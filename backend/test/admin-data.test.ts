import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from '../src/app.js'
import { hashPassword, type AuthRepository, type AuthUser } from '../src/auth.js'
import { createAdminDataRepository } from '../src/admin-data.js'

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
  }
  const app = createApp({ checkDatabase: async () => {}, readinessTimeoutMs: 50, auth: { repository: auth, secret, expiresIn: '1h' }, adminData: adminData as never })
  const login = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password: 'test-password' }) })
  const token = (await login.json() as { data: { accessToken: string } }).data.accessToken
  return { app, token, data, created, savedCategories }
}

test('admin data endpoint requires an authenticated administrator', async () => {
  const admin = await fixture('ADMIN')
  assert.equal((await admin.app.request('/api/admin/data')).status, 401)
  const response = await admin.app.request('/api/admin/data', { headers: { Authorization: `Bearer ${admin.token}` } })
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json() as { data: unknown }).data, admin.data)

  const customer = await fixture('CUSTOMER')
  assert.equal((await customer.app.request('/api/admin/data', { headers: { Authorization: `Bearer ${customer.token}` } })).status, 403)
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
  assert.equal((await customer.app.request('/api/admin/items', { method: 'POST', headers: { Authorization: `Bearer ${customer.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [item] }) })).status, 403)
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
  assert.equal((await customer.app.request('/api/admin/categories/040000', { method: 'PUT', headers: { Authorization: `Bearer ${customer.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(category) })).status, 403)
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