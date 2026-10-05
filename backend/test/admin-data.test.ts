import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from '../src/app.js'
import { hashPassword, type AuthRepository, type AuthUser } from '../src/auth.js'
import { adminDataQuery, createAdminDataRepository } from '../src/admin-data.js'

const secret = 'test-only-secret-at-least-32-characters'

async function fixture(role: AuthUser['role']) {
  const user: AuthUser = { id: '11111111-1111-4111-8111-111111111111', email: `${role.toLowerCase()}@example.test`, passwordHash: await hashPassword('test-password'), companyName: 'Test', managerName: 'Manager', role, status: 'ACTIVE' }
  if (role === 'CUSTOMER') {
    user.customerId = 'CUS-TEST'
    user.customer = { id: 'CUS-TEST', name: 'Test', businessNumber: '2208162517', representativeName: 'Owner', address: 'Seoul', phone: '0212345678', status: 'ACTIVE', accessVersion: 0 }
  }
  const auth: AuthRepository = { findByEmail: async () => user, findById: async () => user, createRegistration: async () => user, listMembers: async () => [], approveMember: async () => null }
  const data = { categories: [], items: [{ id: '000001' }], assets: [], receivings: [], inspections: [], products: [], campaigns: [] }
  const created: unknown[][] = []
  const savedCategories: unknown[] = []
  const updated: unknown[] = []
  const adminData = {
    load: async () => data,
    createItems: async (items: unknown[]) => {
      created.push(items)
      return items.map((item) => ({ ...(item as object), category: '', unit: '', images: [] }))
    },
    saveCategory: async (category: unknown) => {
      savedCategories.push(category)
      return category
    },
    updateItem: async (id: string, item: unknown, actor: string) => { updated.push({ id, item, actor }); return item },
    updateAsset: async (id: string, input: unknown) => { updated.push({ id, input }); data.assets = [{ id, ...(input as object) }] as never },
  }
  const app = createApp({ checkDatabase: async () => {}, readinessTimeoutMs: 50, auth: { repository: auth, secret, expiresIn: '1h' }, adminData: adminData as never })
  const login = await app.request(role === 'ADMIN' ? '/api/admin/auth/login' : '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(role === 'ADMIN' ? { id: user.email, password: 'test-password' } : { email: user.email, password: 'test-password' }) })
  const token = (await login.json() as { data: { accessToken: string } }).data.accessToken
  return { app, token, data, created, savedCategories, updated }
}

test('admin data endpoint requires an authenticated administrator', async () => {
  const admin = await fixture('ADMIN')
  assert.equal((await admin.app.request('/api/admin/data')).status, 401)
  const response = await admin.app.request('/api/admin/data', { headers: { Authorization: `Bearer ${admin.token}` } })
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json() as { data: unknown }).data, admin.data)
  assert.equal((await admin.app.request('/api/admin/data?rows=101', { headers: { Authorization: `Bearer ${admin.token}` } })).status, 400)
  assert.equal((await admin.app.request('/api/admin/data?page=0', { headers: { Authorization: `Bearer ${admin.token}` } })).status, 400)
  assert.equal((await admin.app.request('/api/admin/data?scope=unknown', { headers: { Authorization: `Bearer ${admin.token}` } })).status, 400)

  const customer = await fixture('CUSTOMER')
  assert.equal((await customer.app.request('/api/admin/data', { headers: { Authorization: `Bearer ${customer.token}` } })).status, 401)
})

test('admin item pages query only the selected table with bounded paging and matching count filters', async () => {
  let options: Record<string, unknown> = {}
  const repository = createAdminDataRepository({
    materialCategory: { findMany: async () => [{ id: '010000', parentId: null }, { id: '010100', parentId: '010000' }] },
    masterItem: { findMany: async (input: Record<string, unknown>) => { options = input; return [] }, count: async ({ where }: { where: unknown }) => { assert.deepEqual(where, options.where); return 57 } },
  } as never)
  const data = await repository.load(adminDataQuery.parse({ scope: 'items', page: '3', rows: '10', q: 'bulb', category: '010000', status: '사용', sort: 'name' }))
  assert.equal(options.skip, 20)
  assert.equal(options.take, 10)
  assert.deepEqual(options.where, { OR: [{ id: { contains: 'bulb' } }, { name: { contains: 'bulb' } }], categoryId: { in: ['010000', '010100'] }, enabled: true })
  assert.deepEqual(data.pagination, { page: 3, rows: 10, total: 57 })
  assert.deepEqual(data.assets, [])
  await repository.load(adminDataQuery.parse({ scope: 'items', id: '000003', page: 20, rows: 100 }))
  assert.equal(options.skip, 0)
  assert.equal(options.take, 1)
  assert.deepEqual(options.where, { id: '000003' })
})

test('administrator can register individual and file items in one request', async () => {
  const admin = await fixture('ADMIN')
  const items = [
    { id: '100001', name: '완성 품목', category: '010101', specification: '규격', brand: '', unit: 'EA', inboundPrice: 1000, outboundPrice: null, standardPrice: null, enabled: true, note: '', images: [] },
    { id: '100002', name: '', category: '', specification: '', brand: '', unit: '', inboundPrice: null, outboundPrice: null, standardPrice: null, enabled: true, note: '', images: [] },
  ]
  const response = await admin.app.request('/api/admin/items', { method: 'POST', headers: { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) })
  assert.equal(response.status, 201)
  assert.equal(admin.created.length, 1)
  assert.deepEqual(admin.created[0]?.map((item) => ({ category: (item as { category: unknown }).category, unit: (item as { unit: unknown }).unit })), [{ category: '010101', unit: 'EA' }, { category: null, unit: null }])
  assert.equal(((await response.json() as { data: { items: unknown[] } }).data.items).length, 2)
})

test('item registration requires an administrator and rejects duplicate request codes', async () => {
  const admin = await fixture('ADMIN')
  const item = { id: '100001', name: '', category: '', specification: '', brand: '', unit: '', inboundPrice: null, outboundPrice: null, standardPrice: null, enabled: true, note: '', images: [] }
  assert.equal((await admin.app.request('/api/admin/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [item] }) })).status, 401)
  assert.equal((await admin.app.request('/api/admin/items', { method: 'POST', headers: { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [item, item] }) })).status, 409)

  const customer = await fixture('CUSTOMER')
  assert.equal((await customer.app.request('/api/admin/items', { method: 'POST', headers: { Authorization: `Bearer ${customer.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [item] }) })).status, 401)
})

test('item update requires admin authentication, validates fields and returns the persisted item', async () => {
  const admin = await fixture('ADMIN')
  const item = { id: '100001', name: '수정 품목', category: '', specification: '수정 규격', brand: '수정 브랜드', unit: 'EA', inboundPrice: 0, outboundPrice: 1000, standardPrice: null, enabled: false, note: '수정 적요', images: [] }
  const request = (id: string, body: unknown) => admin.app.request(`/api/admin/items/${id}`, { method: 'PUT', headers: { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  assert.equal((await admin.app.request('/api/admin/items/100001', { method: 'PUT' })).status, 401)
  assert.equal((await request('invalid', item)).status, 400)
  assert.equal((await request('100001', { ...item, inboundPrice: -1 })).status, 400)
  const response = await request('000001', item)
  assert.equal(response.status, 200)
  assert.deepEqual(admin.updated, [{ id: '000001', item: { ...item, category: null }, actor: '11111111-1111-4111-8111-111111111111' }])
  assert.equal((await response.json() as { data: { item: { name: string } } }).data.item.name, '수정 품목')
  const customer = await fixture('CUSTOMER')
  assert.equal((await customer.app.request('/api/admin/items/000001', { method: 'PUT', headers: { Authorization: `Bearer ${customer.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(item) })).status, 401)
})

test('asset edit requires admin, reason and concurrency token and rejects immutable fields', async () => {
  const admin = await fixture('ADMIN')
  const input = { expectedUpdatedAt: '2026-10-06T00:00:00.000Z', reason: '재고 정정', name: '수정 자산', category: '', specification: '', brand: '', quantity: 2, grade: 'A', locationId: '', status: '입고대기', saleStatus: '판매대기' }
  const request = (body: unknown) => admin.app.request('/api/admin/assets/261006-0001', { method: 'PUT', headers: { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  assert.equal((await admin.app.request('/api/admin/assets/261006-0001', { method: 'PUT' })).status, 401)
  for (const body of [{ ...input, reason: '' }, { ...input, expectedUpdatedAt: undefined }, { ...input, quantity: 0.1234 }, { ...input, customerId: 'OTHER' }]) assert.equal((await request(body)).status, 400)
  assert.equal(admin.updated.length, 0)
  const response = await request(input)
  assert.equal(response.status, 200)
  assert.equal((await response.json() as { data: { asset: { name: string } } }).data.asset.name, input.name)
  assert.deepEqual(admin.updated, [{ id: '261006-0001', input: { ...input, locationId: null } }])
  const customer = await fixture('CUSTOMER')
  assert.equal((await customer.app.request('/api/admin/assets/261006-0001', { method: 'PUT', headers: { Authorization: `Bearer ${customer.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input) })).status, 401)
})

test('administrator can save a category to the database', async () => {
  const admin = await fixture('ADMIN')
  const category = { parentId: '010000', name: '신규 중분류', enabled: true, order: 4 }
  const response = await admin.app.request('/api/admin/categories/010400', { method: 'PUT', headers: { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(category) })
  assert.equal(response.status, 200)
  assert.deepEqual(admin.savedCategories, [{ id: '010400', ...category }])
  assert.deepEqual((await response.json() as { data: { category: unknown } }).data.category, { id: '010400', ...category })
})

test('category saving requires an administrator and valid input', async () => {
  const admin = await fixture('ADMIN')
  const category = { parentId: null, name: '신규 대분류', enabled: true, order: 4 }
  assert.equal((await admin.app.request('/api/admin/categories/040000', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(category) })).status, 401)
  assert.equal((await admin.app.request('/api/admin/categories/not-a-code', { method: 'PUT', headers: { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(category) })).status, 400)

  const customer = await fixture('CUSTOMER')
  assert.equal((await customer.app.request('/api/admin/categories/040000', { method: 'PUT', headers: { Authorization: `Bearer ${customer.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(category) })).status, 401)
})

test('category repository upserts the material category record', async () => {
  let upsertInput: unknown
  const transaction = {
    materialCategory: {
      findMany: async () => [{ id: '010000', parentId: null, name: '대분류', enabled: true, sortOrder: 1 }],
      upsert: async (input: { create: { id: string; parentId: string | null; name: string; enabled: boolean; sortOrder: number } }) => {
        upsertInput = input
        return input.create
      },
    },
  }
  const client = { $transaction: async (operation: (value: typeof transaction) => Promise<unknown>) => operation(transaction) }
  const repository = createAdminDataRepository(client as never)
  const saved = await repository.saveCategory({ id: '010100', parentId: '010000', name: '중분류', enabled: true, order: 2 })
  assert.deepEqual(upsertInput, {
    where: { id: '010100' },
    create: { id: '010100', parentId: '010000', name: '중분류', enabled: true, sortOrder: 2 },
    update: { name: '중분류', enabled: true, sortOrder: 2 },
  })
  assert.deepEqual(saved, { id: '010100', parentId: '010000', name: '중분류', enabled: true, order: 2 })
})

test('item repository batches large imports and preserves input order', async () => {
  const createBatchSizes: number[] = []
  const findBatchSizes: number[] = []
  const stored = new Map<string, Record<string, unknown>>()
  const transaction = {
    masterItem: {
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
        createBatchSizes.push(data.length)
        for (const item of data) stored.set(String(item.id), item)
        return { count: data.length }
      },
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        findBatchSizes.push(where.id.in.length)
        return where.id.in.map((id) => ({ ...stored.get(id), id, images: [] }))
      },
    },
    masterItemImage: { createMany: async ({ data }: { data: unknown[] }) => ({ count: data.length }) },
  }
  const client = { $transaction: async (operation: (value: typeof transaction) => Promise<unknown>) => operation(transaction) }
  const repository = createAdminDataRepository(client as never)
  const items = Array.from({ length: 2005 }, (_, index) => ({ id: String(index + 1).padStart(6, '0'), name: `Item ${index}`, category: null, specification: '', brand: '', unit: null, inboundPrice: null, outboundPrice: null, standardPrice: null, enabled: true, note: '', images: [] }))
  const created = await repository.createItems(items)
  assert.deepEqual(createBatchSizes, [1000, 1000, 5])
  assert.deepEqual(findBatchSizes, [1000, 1000, 5])
  assert.equal(created.length, 2005)
  assert.equal(created[0]?.id, '000001')
  assert.equal(created.at(-1)?.id, '002005')
})