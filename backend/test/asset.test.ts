import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from '../src/app.js'
import { createAssetRepository, type AssetListQuery, type AssetRepository } from '../src/asset.js'
import { hashPassword, type AuthRepository, type AuthUser } from '../src/auth.js'
import type { Prisma, PrismaClient } from '../src/generated/prisma/client.js'

const secret = 'test-only-secret-at-least-32-characters'

async function fixture(customerId: string | null = 'TEST-CUST-001') {
  const user: AuthUser = {
    id: '11111111-1111-4111-8111-111111111111',
    customerId,
    customer: customerId ? { id: customerId, name: 'Test Customer', businessNumber: '2208162517', representativeName: 'Manager', address: 'Seoul', phone: '0212345678', status: 'ACTIVE', accessVersion: 0 } : null,
    email: 'customer@example.test',
    passwordHash: await hashPassword('customer-password'),
    companyName: 'Test Customer',
    managerName: '담당자',
    role: 'CUSTOMER',
    status: 'ACTIVE',
  }
  const auth: AuthRepository = {
    findByEmail: async () => user,
    findById: async () => user,
    createRegistration: async () => { throw new Error('Not used') },
    listMembers: async () => [],
    approveMember: async () => null,
  }
  let captured: { customerId: string; query: AssetListQuery; now: Date } | undefined
  const assets: AssetRepository = {
    list: async (ownerId, query, now) => {
      captured = { customerId: ownerId, query, now }
      return {
        totalElements: 21,
        records: [{
          id: '260901-0001',
          itemId: '900001',
          receivingId: 'TEST-RCV-001',
          name: 'Test Aluminum Sheet',
          category: { id: '990101', name: 'Aluminum', path: 'Test Materials > Metals > Aluminum' },
          specification: 'A5052',
          brand: 'Test Metal',
          grade: 'S',
          quantity: '25.000',
          unit: 'EA',
          appraisalValue: '1375000',
          storageStatus: 'STORED',
          saleStatus: 'ON_SALE',
          locationId: 'TEST-LOC-A1',
          thumbnailUrl: '/images/asset.jpg',
          receivedAt: new Date('2026-09-01T00:00:00.000Z'),
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
          updatedAt: new Date('2026-09-20T00:00:00.000Z'),
        }],
      }
    },
  }
  const app = createApp({ checkDatabase: async () => {}, readinessTimeoutMs: 50, auth: { repository: auth, secret, expiresIn: '1h' }, assets })
  const login = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password: 'customer-password' }) })
  const token = (await login.json() as { data?: { accessToken: string } }).data?.accessToken ?? ''
  return { app, token, loginStatus: login.status, captured: () => captured }
}

test('asset list requires authentication and a linked customer', async () => {
  const linked = await fixture()
  assert.equal((await linked.app.request('/api/assets')).status, 401)

  const unlinked = await fixture(null)
  const response = await unlinked.app.request('/api/assets', { headers: { Authorization: `Bearer ${unlinked.token}` } })
  assert.equal(unlinked.loginStatus, 403)
  assert.equal(response.status, 401)
})

test('asset list passes all filters and returns paginated serialized records', async () => {
  const { app, token, captured } = await fixture()
  const parameters = new URLSearchParams({
    page: '2', size: '10', q: 'Aluminum', storageStatus: 'STORED', saleStatus: 'ON_SALE', grade: 'S', categoryId: '990100', locationId: 'TEST-LOC-A1', receivedFrom: '2026-09-01', receivedTo: '2026-09-30', storageDaysFrom: '1', storageDaysTo: '60', sort: 'nameAsc',
  })
  const response = await app.request(`/api/assets?${parameters}`, { headers: { Authorization: `Bearer ${token}` } })
  assert.equal(response.status, 200)
  assert.deepEqual(captured()?.query, {
    page: 2, size: 10, q: 'Aluminum', storageStatus: 'STORED', saleStatus: 'ON_SALE', grade: 'S', categoryId: '990100', locationId: 'TEST-LOC-A1', receivedFrom: '2026-09-01', receivedTo: '2026-09-30', storageDaysFrom: 1, storageDaysTo: 60, sort: 'nameAsc',
  })
  assert.equal(captured()?.customerId, 'TEST-CUST-001')
  const body = await response.json() as { data: Array<{ receivedAt: string; storageDays: number; appraisalValue: string; category: { path: string } }>; meta: Record<string, number> }
  assert.deepEqual(body.meta, { page: 2, size: 10, totalElements: 21, totalPages: 3 })
  assert.equal(body.data[0]?.receivedAt, '2026-09-01T00:00:00.000Z')
  assert.equal(body.data[0]?.appraisalValue, '1375000')
  assert.equal(body.data[0]?.category.path, 'Test Materials > Metals > Aluminum')
})

test('asset list rejects inverted date and storage-day ranges', async () => {
  const { app, token } = await fixture()
  for (const query of ['receivedFrom=2026-09-30&receivedTo=2026-09-01', 'storageDaysFrom=20&storageDaysTo=10']) {
    const response = await app.request(`/api/assets?${query}`, { headers: { Authorization: `Bearer ${token}` } })
    assert.equal(response.status, 400)
    assert.equal((await response.json() as { error: { code: string } }).error.code, 'VALIDATION_ERROR')
  }
})

test('Prisma repository scopes ownership and expands descendant categories', async () => {
  let countWhere: Prisma.AssetWhereInput | undefined
  let findArguments: { where?: Prisma.AssetWhereInput; orderBy?: Prisma.AssetOrderByWithRelationInput[] } | undefined
  const client = {
    $queryRaw: async () => [],
    materialCategory: { findMany: async () => [
      { id: 'ROOT', parentId: null, name: 'Root' },
      { id: 'CHILD', parentId: 'ROOT', name: 'Child' },
      { id: 'LEAF', parentId: 'CHILD', name: 'Leaf' },
      { id: 'OTHER', parentId: null, name: 'Other' },
    ] },
    asset: {
      count: async ({ where }: { where: Prisma.AssetWhereInput }) => { countWhere = where; return 1 },
      findMany: async (argumentsValue: typeof findArguments) => {
        findArguments = argumentsValue
        return [{
          id: 'ASSET-1', itemId: 'ITEM-1', receivingId: 'RCV-1', name: 'Asset', specification: 'Spec', brand: '', grade: 'A', quantity: { toString: () => '1.000' }, unit: 'EA', appraisal: null, storageStatus: 'STORED', saleStatus: 'PENDING', locationId: null, createdAt: new Date('2026-09-01T00:00:00Z'), updatedAt: new Date('2026-09-02T00:00:00Z'), category: { id: 'LEAF', name: 'Leaf' }, images: [],
        }]
      },
    },
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
  } as unknown as PrismaClient
  const repository = createAssetRepository(client)
  const result = await repository.list('CUSTOMER-1', { page: 1, size: 20, categoryId: 'ROOT', sort: 'nameAsc' }, new Date('2026-09-28T00:00:00Z'))

  assert.equal(countWhere?.customerId, 'CUSTOMER-1')
  assert.deepEqual(countWhere?.categoryId, { in: ['ROOT', 'CHILD', 'LEAF'] })
  assert.deepEqual(findArguments?.where, countWhere)
  assert.deepEqual(findArguments?.orderBy, [{ name: 'asc' }, { id: 'asc' }])
  assert.equal(result.records[0]?.category?.path, 'Root > Child > Leaf')
  assert.equal(result.records[0]?.appraisalValue, null)
})

test('OpenAPI document and Scalar reference expose the asset endpoint', async () => {
  const { app } = await fixture()
  const documentResponse = await app.request('/api/openapi.json')
  assert.equal(documentResponse.status, 200)
  const document = await documentResponse.json() as { openapi: string; paths: Record<string, unknown>; components: { securitySchemes: Record<string, unknown> } }
  assert.equal(document.openapi, '3.1.0')
  assert.ok(document.paths['/api/assets'])
  assert.ok(document.components.securitySchemes.BearerAuth)

  const referenceResponse = await app.request('/api/docs')
  assert.equal(referenceResponse.status, 200)
  assert.match(await referenceResponse.text(), /MRS API Reference|scalar/i)
})
