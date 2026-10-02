import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { createApp } from '../src/app.js'
import { hashPassword, type AuthRepository, type AuthUser } from '../src/auth.js'
import type { ReceivingRepository } from '../src/receiving.js'
import type { ImageStorage } from '../src/admin-images.js'

async function fixture(storage?: ImageStorage, fail = false) {
  const user: AuthUser = { id: '11111111-1111-4111-8111-111111111111', customerId: 'CUS-TEST', customerRole: 'VIEWER', customer: { id: 'CUS-TEST', name: 'Test', businessNumber: '2208162517', representativeName: 'Owner', address: 'Seoul', phone: '010', status: 'ACTIVE', accessVersion: 0 }, email: 'receiving@example.test', passwordHash: await hashPassword('test-password'), companyName: 'Test', managerName: 'Manager', role: 'CUSTOMER', status: 'ACTIVE' }
  const auth: AuthRepository = { findByEmail: async () => user, findById: async () => user, createRegistration: async () => user, listMembers: async () => [], approveMember: async () => null }
  const captured: unknown[] = []
  const repository = { create: async (...args: unknown[]) => { captured.push(args); if (fail) throw new Error('DB failure'); return { id: 'REQ-TEST', status: 'REQUESTED' } }, list: async (owner: string) => { captured.push(owner); return { records: [], totalElements: 0 } }, detail: async (owner: string) => { captured.push(owner); return null } } as unknown as ReceivingRepository
  const app = createApp({ checkDatabase: async () => {}, readinessTimeoutMs: 50, auth: { repository: auth, secret: 'test-only-secret-at-least-32-characters', expiresIn: '1h' }, receivings: repository, imageStorage: storage })
  const login = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password: 'test-password' }) })
  const token = (await login.json() as { data: { accessToken: string } }).data.accessToken
  const headers = { Authorization: `Bearer ${token}` }
  const form = () => { const body = new FormData(); for (const [key, value] of Object.entries({ siteName: '현장', managerName: '담당자', managerPhone: '01012345678', volume: 'UNDER_ONE_TON', disposalTerms: 'true' })) body.set(key, value); return body }
  return { app, user, captured, headers, form, submit: (body: FormData) => app.request('/api/customer/receivings', { method: 'POST', headers, body }) }
}

test('approved viewer can submit without photos, and customer ownership is server controlled', async () => {
  const fixtureData = await fixture()
  assert.equal((await fixtureData.submit(fixtureData.form())).status, 201)
  assert.equal(fixtureData.captured.length, 1)
  assert.equal((await fixtureData.app.request('/api/customer/receivings')).status, 401)
  for (const [key, value] of Object.entries({ customerId: 'OTHER', status: 'APPROVED', channel: 'ADMIN', disposalTerms: 'false', siteName: '  ', volume: 'OTHER' })) {
    const body = fixtureData.form(); body.set(key, value)
    assert.equal((await fixtureData.submit(body)).status, 400, key)
  }
  fixtureData.user.status = 'SUSPENDED'
  assert.equal((await fixtureData.submit(fixtureData.form())).status, 401)
})

test('list and detail enforce ownership, pagination and current customer status', async () => {
  const { app, headers, captured, user } = await fixture()
  const response = await app.request('/api/customer/receivings?page=2&size=20', { headers })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.equal(captured[0], 'CUS-TEST')
  assert.equal((await app.request('/api/customer/receivings/OTHER', { headers })).status, 404)
  for (const query of ['size=101', 'page=0', 'status=INVALID', 'customerId=OTHER']) assert.equal((await app.request(`/api/customer/receivings?${query}`, { headers })).status, 400)
  user.customer!.status = 'SUSPENDED'
  assert.equal((await app.request('/api/customer/receivings', { headers })).status, 401)
})

test('photos are validated before upload and failed persistence cleans up uploaded objects', async () => {
  const keys: string[] = []; const removed: string[] = []
  const storage: ImageStorage = { put: async (key) => { keys.push(key) }, remove: async (key) => { removed.push(key) } }
  const { form, submit } = await fixture(storage, true)
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#008800' } }).png().toBuffer()
  const body = form(); body.append('photos', new File([bytes], '현장.png', { type: 'image/png' }))
  assert.equal((await submit(body)).status, 500)
  assert.deepEqual(removed, keys)
  assert.match(keys[0]!, /^receivings\/CUS-TEST\//)
  const invalid = form(); invalid.append('photos', new File(['bad'], 'fake.png', { type: 'image/png' }))
  assert.equal((await submit(invalid)).status, 400)
  const excessive = form(); for (let index = 0; index < 6; index++) excessive.append('photos', new File([bytes], 'site.png', { type: 'image/png' }))
  assert.equal((await submit(excessive)).status, 400)
  assert.equal(keys.length, 1)
})

test('S3 failures do not create a receiving and release the request slot', async () => {
  const { form, submit, captured } = await fixture({ put: async () => { throw new Error('secret') }, remove: async () => {} })
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#008800' } }).png().toBuffer()
  for (let index = 0; index < 3; index++) { const body = form(); body.append('photos', new File([bytes], 'site.png', { type: 'image/png' })); const response = await submit(body); assert.equal(response.status, 503); assert.equal((await response.text()).includes('secret'), false) }
  assert.equal(captured.length, 0)
})

test('five photos succeed with unique keys and invalid files never reach S3', async () => {
  const stored: { key: string; body: Buffer }[] = []
  const { form, submit, captured } = await fixture({ put: async (key, body) => { stored.push({ key, body }) } })
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#008800' } }).withMetadata().png().toBuffer()
  const body = form()
  for (let index = 0; index < 5; index++) body.append('photos', new File([bytes], `site-${index}.png`, { type: 'image/png' }))
  assert.equal((await submit(body)).status, 201)
  assert.equal(new Set(stored.map((entry) => entry.key)).size, 5)
  const metadata = await sharp(stored[0]!.body).metadata()
  assert.equal(metadata.format, 'webp')
  assert.equal(metadata.exif, undefined)
  const images = (captured[0] as unknown[])[2] as { name: string }[]
  assert.deepEqual(images.map((image) => image.name), ['site-0.png', 'site-1.png', 'site-2.png', 'site-3.png', 'site-4.png'])
  for (const file of [new File([bytes], 'fake.jpg', { type: 'image/jpeg' }), new File(['invalid'], 'image.heic', { type: 'image/heic' }), new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }), new File([], 'empty.png', { type: 'image/png' })]) {
    const invalid = form(); invalid.append('photos', file)
    assert.equal((await submit(invalid)).status, 400)
  }
  const duplicate = form(); duplicate.append('siteName', 'Other site')
  assert.equal((await submit(duplicate)).status, 400)
  assert.equal(stored.length, 5)
})

test('oversized bodies and stale customer access are rejected before persistence', async () => {
  const { app, headers, form, submit, user, captured } = await fixture()
  const oversized = form(); oversized.append('photos', new File([new Uint8Array(26 * 1024 * 1024)], 'large.png', { type: 'image/png' }))
  assert.equal((await submit(oversized)).status, 413)
  const terms = await app.request('/api/customer/receivings/terms', { headers })
  assert.equal(terms.status, 200)
  const spec = await app.request('/api/openapi.json')
  assert.ok((await spec.json() as { paths: Record<string, unknown> }).paths['/api/customer/receivings'])
  user.customer!.accessVersion++
  assert.equal((await submit(form())).status, 401)
  assert.equal(captured.length, 0)
})