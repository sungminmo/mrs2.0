import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { createApp } from '../src/app.js'
import { hashPassword, type AuthRepository, type AuthUser } from '../src/auth.js'
import { createAdminImageRepository, imageOrigin, publicImageUrl, type ImageStorage } from '../src/admin-images.js'
import { AppError } from '../src/http.js'

async function fixture(storage: ImageStorage, role: AuthUser['role'] = 'ADMIN') {
  const user: AuthUser = { id: '11111111-1111-4111-8111-111111111111', email: 'upload@example.test', passwordHash: await hashPassword('test-password'), companyName: 'Test', managerName: 'Manager', role, status: 'ACTIVE' }
  if (role === 'CUSTOMER') {
    user.customerId = 'CUS-TEST'
    user.customer = { id: 'CUS-TEST', name: 'Test', businessNumber: '2208162517', representativeName: 'Owner', address: 'Seoul', phone: '0212345678', status: 'ACTIVE', accessVersion: 0 }
  }
  const repository: AuthRepository = { findByEmail: async () => user, findById: async () => user, createRegistration: async () => user, listMembers: async () => [], approveMember: async () => null }
  const app = createApp({ checkDatabase: async () => {}, readinessTimeoutMs: 50, auth: { repository, secret: 'test-only-secret-at-least-32-characters', expiresIn: '1h' }, imageStorage: storage })
  const response = await app.request(role === 'ADMIN' ? '/api/admin/auth/login' : '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(role === 'ADMIN' ? { id: user.email, password: 'test-password' } : { email: user.email, password: 'test-password' }) })
  const token = (await response.json() as { data: { accessToken: string } }).data.accessToken
  const upload = (file: File, kind = 'items') => { const body = new FormData(); body.append('file', file); return app.request(`/api/admin/images/${kind}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body }) }
  return { app, upload }
}

test('authenticated upload stores decoded metadata-free WebP with a unique S3 URL', async () => {
  const stored: { key: string; body: Buffer }[] = []
  const { app, upload } = await fixture({ put: async (key, body) => { stored.push({ key, body }) } })
  const bytes = await sharp({ create: { width: 12, height: 8, channels: 3, background: '#008800' } }).withMetadata().png().toBuffer()
  for (const kind of ['items', 'assets', 'banners']) {
    const response = await upload(new File([new Uint8Array(bytes)], 'sample.png', { type: 'image/png' }), kind)
    assert.equal(response.status, 201)
    const { image } = (await response.json() as { data: { image: { id: string; name: string; url: string } } }).data
    assert.equal(image.name, 'sample.png')
    assert.equal(image.url, `${imageOrigin}/${kind}/11111111-1111-4111-8111-111111111111/${image.id}.webp`)
    const metadata = await sharp(stored.at(-1)!.body).metadata()
    assert.equal(metadata.format, 'webp')
    assert.equal(metadata.exif, undefined)
    assert.equal(metadata.width, 12)
  }
  assert.equal(new Set(stored.map((entry) => entry.key)).size, 3)
  assert.equal((await app.request('/api/admin/images/items', { method: 'POST' })).status, 401)
  const customer = await fixture({ put: async () => { assert.fail('customer must not upload') } }, 'CUSTOMER')
  assert.equal((await customer.upload(new File([bytes], 'sample.png', { type: 'image/png' }))).status, 401)
})

test('upload rejects invalid image bytes, MIME spoofing, unsupported kinds and excessive size', async () => {
  const { app, upload } = await fixture({ put: async () => { assert.fail('invalid file must not reach S3') } })
  assert.equal((await upload(new File(['not an image'], 'fake.png', { type: 'image/png' }))).status, 400)
  assert.equal((await upload(new File(['<svg/>'], 'fake.svg', { type: 'image/svg+xml' }))).status, 400)
  assert.equal((await upload(new File([], 'empty.png', { type: 'image/png' }))).status, 400)
  assert.equal((await upload(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }))).status, 400)
  assert.equal((await upload(new File([new Uint8Array(6 * 1024 * 1024)], 'large.png', { type: 'image/png' }))).status, 413)
  assert.equal((await upload(new File(['bytes'], 'fake.png', { type: 'image/png' }), 'other')).status, 400)
  const jpeg = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#ffffff' } }).jpeg().toBuffer()
  assert.equal((await upload(new File([jpeg], 'fake.png', { type: 'image/png' }))).status, 400)
  assert.equal((await app.request('/api/admin/images/items', { method: 'POST', body: 'invalid' })).status, 401)
})

test('S3 errors are redacted and a failed request releases the processing slot', async () => {
  const { upload } = await fixture({ put: async () => { throw new Error('AWS_SECRET_ACCESS_KEY=must-not-leak') } })
  const bytes = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#ffffff' } }).png().toBuffer()
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await upload(new File([bytes], 'sample.png', { type: 'image/png' }))
    assert.equal(response.status, 503)
    assert.equal((await response.text()).includes('must-not-leak'), false)
  }
})

test('trusted image URLs reject other hosts and active or signed content', () => {
  assert.ok(publicImageUrl(`${imageOrigin}/items/test.webp`))
  for (const url of ['https://example.com/items/test.webp', `${imageOrigin}/items/test.svg`, `${imageOrigin}/items/test.webp?token=secret`, `${imageOrigin}/items/test.webp#fragment`, `${imageOrigin}/other/test.png`, 'javascript:alert(1)']) assert.equal(publicImageUrl(url), null)
})

test('image replacement checks optimistic state, persists order and creates compatible audit history', async () => {
  let images = [{ id: 'legacy-image', name: 'before.jpg', url: `${imageOrigin}/assets/before.jpg` }]
  const changes: unknown[] = []
  const transaction = {
    asset: { findUnique: async () => ({ id: '261001-0001', images }), update: async () => ({}) },
    assetImage: { deleteMany: async () => { images = [] }, createMany: async ({ data }: { data: typeof images }) => { images = data } },
    assetChange: { create: async ({ data }: { data: { changes: unknown } }) => { changes.push(data.changes) } },
    customerChange: { create: async () => ({}) },
  }
  const repository = createAdminImageRepository({ $transaction: async (operation: (tx: typeof transaction) => Promise<unknown>) => operation(transaction) } as never)
  const expected = images.map((image) => ({ ...image }))
  const next = [{ id: 'new-image', name: 'after.webp', url: `${imageOrigin}/assets/after.webp` }]
  await repository.replace('assets', '261001-0001', { images: next, expected, reason: '이미지 교체' }, 'actor')
  assert.equal(images[0]?.name, 'after.webp')
  assert.deepEqual(changes, [[['자산 이미지', 'before.jpg', 'after.webp']]])
  await assert.rejects(repository.replace('assets', '261001-0001', { images: next, expected, reason: 'stale' }, 'actor'), (error: unknown) => error instanceof AppError && error.status === 409)
  await assert.rejects(repository.replace('assets', '261001-0001', { images: [{ ...next[0]!, url: 'https://example.com/image.jpg' }], expected: next, reason: 'invalid' }, 'actor'), (error: unknown) => error instanceof AppError && error.status === 400)
})