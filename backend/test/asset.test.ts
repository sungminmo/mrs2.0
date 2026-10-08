import assert from 'node:assert/strict'
import { randomInt, randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createApp } from '../src/app.js'
import { canAssetRequestSale, createAssetRepository, type AssetListQuery, type AssetRepository } from '../src/asset.js'
import { hashPassword, type AuthRepository, type AuthUser } from '../src/auth.js'
import type { Prisma, PrismaClient } from '../src/generated/prisma/client.js'
import { createDatabase } from '../src/database.js'

const secret = 'test-only-secret-at-least-32-characters'

test('asset list and detail share precise sale eligibility', () => {
  const asset = { storageStatus: 'STORED', saleStatus: 'PENDING', grade: 'A', quantity: '0.001', saleRequest: null, product: null }
  for (const grade of ['S', 'A', 'B']) assert.equal(canAssetRequestSale({ ...asset, grade }), true)
  for (const changed of [{ storageStatus: 'PENDING' }, { storageStatus: 'RELEASED' }, { saleStatus: 'ON_SALE' }, { saleStatus: 'SOLD' }, { grade: 'F' }, { quantity: '0' }, { quantity: '-1' }, { saleRequest: { id: 'existing' } }, { product: { id: 'existing' } }]) assert.equal(canAssetRequestSale({ ...asset, ...changed }), false)
})

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
  const saleCalls: unknown[] = []
  const assets: AssetRepository = {
    requestSale: async (actor, id, input) => { saleCalls.push({ actor: actor.id, id, input }); return { id: 'test-sale-request' } },
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
  return { app, token, loginStatus: login.status, captured: () => captured, saleCalls }
}

test('asset sale requests require authentication and validated amount and quantity', async () => {
  const { app, token, saleCalls } = await fixture()
  const path = '/api/assets/261006-9001/sale-requests'
  assert.equal((await app.request(path, { method: 'POST' })).status, 401)
  for (const input of [{ desiredAmount: 0, expectedQuantity: '2' }, { desiredAmount: 1.5, expectedQuantity: '2' }, { desiredAmount: 1e12 + 1, expectedQuantity: '2' }, { desiredAmount: 100, expectedQuantity: '-1' }, { desiredAmount: 100, expectedQuantity: '2', customerId: 'other' }]) {
    assert.equal((await app.request(path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input) })).status, 400)
  }
  assert.equal(saleCalls.length, 0)
  const response = await app.request(path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ desiredAmount: 100000, expectedQuantity: '2.500' }) })
  assert.equal(response.status, 201)
  assert.equal(saleCalls.length, 1)
})

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

test('existing asset list accepts sale request filters without adding an endpoint', async () => {
  const { app, token, captured } = await fixture()
  const response = await app.request('/api/assets?saleRequested=true&saleRequestStatus=APPROVED&saleInspection=COMPLETED&saleRequestedFrom=2026-10-01&saleRequestedTo=2026-10-08&sort=requestedDesc&page=2&size=10', { headers: { Authorization: `Bearer ${token}` } })
  assert.equal(response.status, 200)
  assert.deepEqual(captured()?.query, { page: 2, size: 10, saleRequested: 'true', saleRequestStatus: 'APPROVED', saleInspection: 'COMPLETED', saleRequestedFrom: '2026-10-01', saleRequestedTo: '2026-10-08', sort: 'requestedDesc' })
  assert.equal(captured()?.customerId, 'TEST-CUST-001')
  assert.equal((await app.request('/api/assets?saleRequested=false', { headers: { Authorization: `Bearer ${token}` } })).status, 200)
})

test('sale request list rejects ambiguous filters and inverted request dates', async () => {
  const { app, token, captured } = await fixture()
  for (const query of ['saleRequested=1', 'saleRequestStatus=PENDING', 'saleRequested=false&saleInspection=PENDING', 'sort=requestedDesc', 'saleRequested=true&saleRequestStatus=SOLD', 'saleRequested=true&saleInspection=APPROVED', 'saleRequested=true&saleRequestedFrom=2026-10-09&saleRequestedTo=2026-10-08', 'saleRequested=true&saleRequestedFrom=invalid']) {
    assert.equal((await app.request(`/api/assets?${query}`, { headers: { Authorization: `Bearer ${token}` } })).status, 400, query)
  }
  assert.equal(captured(), undefined)
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
  assert.equal(result.records[0]?.canRequestSale, true)
})

test('OpenAPI document and Scalar reference expose the asset endpoint', async () => {
  const { app } = await fixture()
  const documentResponse = await app.request('/api/openapi.json')
  assert.equal(documentResponse.status, 200)
  const document = await documentResponse.json() as { openapi: string; paths: Record<string, unknown>; components: { securitySchemes: Record<string, unknown> } }
  assert.equal(document.openapi, '3.1.0')
  assert.ok(document.paths['/api/assets'])
  assert.ok(document.paths['/api/assets/{id}/sale-requests'])
  assert.ok(document.components.securitySchemes.BearerAuth)

  const customerDocument = await (await app.request('/api/openapi/customer.json')).json() as { paths: Record<string, { get?: { parameters?: Array<{ name: string }> } }>; components: { schemas: Record<string, { properties?: Record<string, unknown> }> } }
  const parameters = customerDocument.paths['/api/assets']?.get?.parameters?.map(parameter => parameter.name)
  for (const name of ['saleRequested', 'saleRequestStatus', 'saleInspection', 'saleRequestedFrom', 'saleRequestedTo']) assert.ok(parameters?.includes(name), name)
  assert.ok(customerDocument.components.schemas.AssetSaleRequest?.properties?.quantity)
  assert.ok(customerDocument.components.schemas.AssetSaleRequestSummary)
  assert.equal(customerDocument.components.schemas.AssetSaleRequest?.properties?.actorUserId, undefined)
  assert.equal(customerDocument.paths['/api/customer/sale-requests'], undefined)

  const referenceResponse = await app.request('/api/docs')
  assert.equal(referenceResponse.status, 200)
  assert.match(await referenceResponse.text(), /MRS API Reference|scalar/i)
})

test('local MySQL sale request filtering, snapshots and summaries use existing asset APIs', { skip: !process.env.MRS_ASSET_TEST_DB_PORT }, async (context) => {
  const name = process.env.MRS_ASSET_TEST_DB_NAME ?? 'mrs_test'
  assert.match(name, /^(?:mrs_test|receiving_preview|test_[a-z0-9_]+|[a-z0-9_]+_test)$/)
  const port = Number(process.env.MRS_ASSET_TEST_DB_PORT)
  assert.ok(Number.isInteger(port) && port > 0 && port < 65536)
  const database = createDatabase({ host: '127.0.0.1', port, name, user: process.env.MRS_ASSET_TEST_DB_USER ?? 'root', password: process.env.MRS_ASSET_TEST_DB_PASSWORD ?? '', poolMax: 3, timeoutMs: 5000 })
  const client = database.client
  const owners = [0, 1].map(() => `SALE-T-${randomUUID().slice(0, 8)}`)
  const ids = ['991008-9101', '991008-9102', '991008-9103', '991008-9104', '991008-9105']
  const requests = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
  const repository = createAssetRepository(client)
  const now = new Date('2026-10-08T00:00:00Z')
  const query: AssetListQuery = { page: 1, size: 1, saleRequested: 'true', sort: 'requestedDesc' }
  try {
    await client.customer.createMany({ data: owners.map(id => ({ id, name: 'Sale request integration test', businessNumber: String(randomInt(1_000_000_000, 10_000_000_000)), representativeName: 'Test owner', address: 'Test address', phone: '0212345678', status: 'ACTIVE' })) })
    await client.asset.createMany({ data: ids.map((id, index) => ({ id, customerId: owners[index === 4 ? 1 : 0]!, receivingId: 'SALE-TEST-RCV', name: `Sale fixture ${index}`, specification: 'TEST', grade: 'A', quantity: index === 1 ? '5' : '2', unit: 'EA', appraisal: String((index + 1) * 100), storageStatus: 'STORED', saleStatus: index === 1 ? 'ON_SALE' : 'PENDING' })) })
    await client.saleRequest.createMany({ data: [
      { id: requests[0]!, assetId: ids[0]!, actorUserId: randomUUID(), quantity: '10.125', desiredAmount: '999999999999', createdAt: new Date('2026-10-01T15:00:00Z') },
      { id: requests[1]!, assetId: ids[1]!, actorUserId: randomUUID(), quantity: '10', desiredAmount: '10000', status: 'APPROVED', inspection: 'COMPLETED', createdAt: new Date('2026-10-02T15:00:00Z') },
      { id: requests[2]!, assetId: ids[2]!, actorUserId: randomUUID(), quantity: '2', desiredAmount: '2000', status: 'REJECTED', inspection: 'COMPLETED', createdAt: new Date('2026-10-01T14:59:59Z') },
      { id: requests[3]!, assetId: ids[4]!, actorUserId: randomUUID(), quantity: '2', desiredAmount: '3000', status: 'APPROVED', inspection: 'COMPLETED', createdAt: new Date('2026-10-04T00:00:00Z') },
    ] })
    await client.product.create({ data: { id: `SALE-${randomUUID().slice(0, 8)}`, assetId: ids[1]!, name: 'Sale fixture product', originalUnitPrice: '1000', discountRate: 0, listedQuantity: '10', reservedQuantity: '1', soldQuantity: '5', status: 'AVAILABLE', publishedAt: now } })
    await context.test('whole-company counts do not depend on page or selected approval/inspection', async () => {
      const result = await repository.list(owners[0]!, query, now)
      assert.equal(result.totalElements, 3)
      assert.deepEqual(result.records.map(record => record.id), [ids[1]])
      assert.deepEqual(result.saleRequestSummary, { approval: { PENDING: 1, APPROVED: 1, REJECTED: 1 }, inspection: { PENDING: 1, COMPLETED: 2 } })
      const next = await repository.list(owners[0]!, { ...query, page: 2 }, now)
      assert.deepEqual(next.records.map(record => record.id), [ids[0]])
      assert.deepEqual(next.saleRequestSummary, result.saleRequestSummary)
      const filtered = await repository.list(owners[0]!, { ...query, saleRequestStatus: 'PENDING', saleInspection: 'PENDING' }, now)
      assert.equal(filtered.totalElements, 1)
      assert.deepEqual(filtered.records.map(record => record.id), [ids[0]])
      assert.deepEqual(filtered.saleRequestSummary, result.saleRequestSummary)
    })
    await context.test('request dates use inclusive Korean days and request-number search', async () => {
      const dated = await repository.list(owners[0]!, { ...query, saleRequestedFrom: '2026-10-02', saleRequestedTo: '2026-10-02' }, now)
      assert.equal(dated.totalElements, 1)
      assert.deepEqual(dated.records.map(record => record.id), [ids[0]])
      assert.equal(dated.saleRequestSummary?.approval.PENDING, 1)
      assert.equal(dated.saleRequestSummary?.approval.APPROVED, 0)
      const searched = await repository.list(owners[0]!, { ...query, q: requests[1] }, now)
      assert.equal(searched.totalElements, 1)
      assert.deepEqual(searched.records.map(record => record.id), [ids[1]])
      assert.equal(searched.saleRequestSummary?.approval.APPROVED, 1)
    })
    await context.test('value sorting uses the same request filters and missing-request condition', async () => {
      const result = await repository.list(owners[0]!, { ...query, sort: 'valueDesc', q: requests[0], saleRequestStatus: 'PENDING', saleInspection: 'PENDING', saleRequestedFrom: '2026-10-02', saleRequestedTo: '2026-10-02' }, now)
      assert.equal(result.totalElements, 1)
      assert.deepEqual(result.records.map(record => record.id), [ids[0]])
      const missing = await repository.list(owners[0]!, { page: 1, size: 20, saleRequested: 'false', sort: 'valueDesc' }, now)
      assert.equal(missing.totalElements, 1)
      assert.deepEqual(missing.records.map(record => record.id), [ids[3]])
      assert.equal(missing.records[0]?.saleRequest, null)
      assert.equal(missing.saleRequestSummary, undefined)
    })
    await context.test('request quantities and exact amounts are not replaced by current inventory', async () => {
      const asset = await repository.detail!(owners[0]!, ids[0]!)
      assert.equal(asset?.quantity, '2')
      assert.equal(asset?.saleRequest?.quantity, '10.125')
      assert.equal(asset?.saleRequest?.desiredAmount, '999999999999')
      assert.deepEqual(Object.keys(asset!.saleRequest!).sort(), ['createdAt', 'desiredAmount', 'id', 'inspection', 'product', 'quantity', 'status'])
      assert.equal(asset?.saleRequest?.product, null)
      const approved = await repository.detail!(owners[0]!, ids[1]!)
      assert.equal(approved?.saleRequest?.status, 'APPROVED')
      assert.equal(approved?.saleRequest?.product?.status, 'AVAILABLE')
      assert.equal(approved?.saleRequest?.product?.soldQuantity, '5')
      assert.equal(approved?.saleRequest?.product?.reservedQuantity, '1')
    })
    await context.test('another customer is excluded from list, search, summaries and details', async () => {
      assert.equal(await repository.detail!(owners[0]!, ids[4]!), null)
      const foreign = await repository.list(owners[0]!, { ...query, q: requests[3] }, now)
      assert.equal(foreign.totalElements, 0)
      assert.equal(foreign.records.length, 0)
      assert.deepEqual(foreign.saleRequestSummary, { approval: { PENDING: 0, APPROVED: 0, REJECTED: 0 }, inspection: { PENDING: 0, COMPLETED: 0 } })
    })
  } finally {
    await client.product.deleteMany({ where: { asset: { customerId: { in: owners } } } })
    await client.saleRequest.deleteMany({ where: { asset: { customerId: { in: owners } } } })
    await client.asset.deleteMany({ where: { customerId: { in: owners } } })
    await client.customer.deleteMany({ where: { id: { in: owners } } })
    await database.close()
  }
})
