import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from '../src/app.js'
import { hashPassword, type AuthRepository, type AuthUser } from '../src/auth.js'

const secret = 'test-only-secret-at-least-32-characters'

async function fixture(role: AuthUser['role']) {
  const user: AuthUser = { id: '11111111-1111-4111-8111-111111111111', email: `${role.toLowerCase()}@example.test`, passwordHash: await hashPassword('test-password'), companyName: 'Test', managerName: 'Manager', role, status: 'ACTIVE' }
  const auth: AuthRepository = { findByEmail: async () => user, findById: async () => user, createRegistration: async () => user, listMembers: async () => [], approveMember: async () => null }
  const data = { categories: [], items: [{ id: '000001' }], assets: [], receivings: [], inspections: [], products: [], campaigns: [] }
  const created: unknown[][] = []
  const adminData = {
    load: async () => data,
    createItems: async (items: unknown[]) => {
      created.push(items)
      return items.map((item) => ({ ...(item as object), category: '', unit: '', images: [] }))
    },
  }
  const app = createApp({ checkDatabase: async () => {}, readinessTimeoutMs: 50, auth: { repository: auth, secret, expiresIn: '1h' }, adminData: adminData as never })
  const login = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password: 'test-password' }) })
  const token = (await login.json() as { data: { accessToken: string } }).data.accessToken
  return { app, token, data, created }
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