import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from '../src/app.js'
import { hashPassword, type AuthRepository, type AuthUser } from '../src/auth.js'

const secret = 'test-only-secret-at-least-32-characters'

async function fixture(role: AuthUser['role']) {
  const user: AuthUser = { id: '11111111-1111-4111-8111-111111111111', email: `${role.toLowerCase()}@example.test`, passwordHash: await hashPassword('test-password'), companyName: 'Test', managerName: 'Manager', role, status: 'ACTIVE' }
  const auth: AuthRepository = { findByEmail: async () => user, findById: async () => user, createRegistration: async () => user, listMembers: async () => [], approveMember: async () => null }
  const data = { categories: [], items: [{ id: '000001' }], assets: [], receivings: [], inspections: [], products: [], campaigns: [] }
  const app = createApp({ checkDatabase: async () => {}, readinessTimeoutMs: 50, auth: { repository: auth, secret, expiresIn: '1h' }, adminData: { load: async () => data } as never })
  const login = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password: 'test-password' }) })
  const token = (await login.json() as { data: { accessToken: string } }).data.accessToken
  return { app, token, data }
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