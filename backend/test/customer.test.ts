import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SignJWT } from 'jose'
import { createApp } from '../src/app.js'
import { hashPassword, registrationSchema, type AuthUser } from '../src/auth.js'
import { businessNumberSchema, type CustomerRepository } from '../src/customer.js'
import { adminAccountCreate, adminAccountUpdate, type AdminAccountRepository } from '../src/admin-accounts.js'

test('business number normalization and registration reject privilege injection', () => {
  assert.equal(businessNumberSchema.parse('220-81-62517'), '2208162517')
  for (const number of ['0000000000', '2208162518', '220a8162517']) assert.equal(businessNumberSchema.safeParse(number).success, false)
  const input = { email: 'member@example.com', password: 'password123', managerName: 'Manager', managerPhone: '01012345678', customerType: 'existing', customerId: 'CUS-A' }
  assert.equal(registrationSchema.safeParse(input).success, true)
  for (const extra of [{ role: 'ADMIN' }, { adminRole: 'SYSTEM_ADMIN' }, { customerRole: 'MANAGER' }, { status: 'ACTIVE' }, { companyName: 'Forged' }, { customer: {} }]) assert.equal(registrationSchema.safeParse({ ...input, ...extra }).success, false)
})

test('company suspension, role changes and reassignment invalidate sessions without escalating managers', async () => {
  const user: AuthUser = { id: '11111111-1111-4111-8111-111111111111', email: 'member@example.com', passwordHash: await hashPassword('password123'), companyName: 'A', managerName: 'Manager', role: 'CUSTOMER', status: 'ACTIVE', customerId: 'CUS-A', customerRole: 'MANAGER', sessionVersion: 0, customer: { id: 'CUS-A', name: 'A', businessNumber: '2208162517', representativeName: 'Owner', address: 'Seoul', phone: '0212345678', status: 'ACTIVE', accessVersion: 0 } }
  const app = createApp({ checkDatabase: async () => {}, readinessTimeoutMs: 50, auth: { secret: 'test-secret-at-least-32-characters', expiresIn: '1h', repository: { findByEmail: async () => user, findById: async () => user, createRegistration: async () => user, listMembers: async () => [user], approveMember: async () => user } }, customers: { list: async () => [] } as unknown as CustomerRepository })
  const login = () => app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password: 'password123' }) })
  const response = await login()
  assert.equal(response.status, 200)
  const body = await response.json() as { data: { accessToken: string; user: Record<string, unknown> } }
  assert.equal(body.data.user.passwordHash, undefined)
  const headers = { Authorization: `Bearer ${body.data.accessToken}` }
  assert.equal((await app.request('/api/auth/me', { headers })).status, 200)
  for (const route of ['/api/admin/customers', '/api/admin/customers/CUS-A', '/api/admin/members']) assert.equal((await app.request(route, { headers })).status, 401)
  user.customer!.status = 'SUSPENDED'
  user.customer!.accessVersion += 1
  assert.equal((await app.request('/api/auth/me', { headers })).status, 401)
  assert.equal((await login()).status, 403)
  user.customer!.status = 'ACTIVE'
  assert.equal((await app.request('/api/auth/me', { headers })).status, 401)
  const fresh = await (await login()).json() as { data: { accessToken: string } }
  const freshHeaders = { Authorization: `Bearer ${fresh.data.accessToken}` }
  user.customerRole = 'VIEWER'
  user.sessionVersion! += 1
  assert.equal((await app.request('/api/auth/me', { headers: freshHeaders })).status, 401)
  user.customerId = 'CUS-B'
  assert.equal((await login()).status, 403)
})

test('repository outages do not masquerade as expired authentication', async () => {
  const user: AuthUser = { id: '11111111-1111-4111-8111-111111111111', email: 'admin@example.test', passwordHash: await hashPassword('password123'), companyName: 'MRS', managerName: 'Admin', role: 'ADMIN', status: 'ACTIVE' }
  const app = createApp({ checkDatabase: async () => {}, readinessTimeoutMs: 50, auth: { secret: 'test-secret-at-least-32-characters', expiresIn: '1h', repository: { findByEmail: async () => user, findById: async () => { throw new Error('Database unavailable') }, createRegistration: async () => user, listMembers: async () => [], approveMember: async () => user } } })
  const login = await app.request('/api/admin/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: user.email, password: 'password123' }) })
  const { data } = await login.json() as { data: { accessToken: string } }
  assert.equal((await app.request('/api/admin/members', { headers: { Authorization: `Bearer ${data.accessToken}` } })).status, 500)
  assert.equal((await app.request('/api/admin/members', { headers: { Authorization: 'Bearer invalid' } })).status, 401)
})

test('administrator credentials, token audiences and legacy sessions stay isolated', async () => {
  const secret = 'test-secret-at-least-32-characters'
  const admin: AuthUser = { id: '11111111-1111-4111-8111-111111111111', email: 'admin', passwordHash: await hashPassword('admin'), companyName: 'MRS', managerName: 'Admin', role: 'ADMIN', status: 'ACTIVE' }
  const app = createApp({ checkDatabase: async () => {}, readinessTimeoutMs: 50, auth: { secret, expiresIn: '1h', repository: { findByEmail: async (id) => id === admin.email ? admin : null, findById: async () => admin, createRegistration: async () => { throw new Error('Public registration must not create an admin') }, listMembers: async () => [], approveMember: async () => null } } })
  const headers = { 'Content-Type': 'application/json' }
  const login = await app.request('/api/admin/auth/login', { method: 'POST', headers, body: JSON.stringify({ id: 'admin', password: 'admin' }) })
  assert.equal(login.status, 200)
  const { data } = await login.json() as { data: { accessToken: string } }
  const authorization = { Authorization: `Bearer ${data.accessToken}` }
  assert.equal((await app.request('/api/admin/auth/me', { headers: authorization })).status, 200)
  assert.equal((await app.request('/api/auth/me', { headers: authorization })).status, 401)
  assert.equal((await app.request('/api/auth/register', { method: 'POST', headers, body: JSON.stringify({ email: 'admin@example.com', password: 'password123', managerName: 'Admin', managerPhone: '010', customerType: 'existing', customerId: 'CUS-A', role: 'ADMIN' }) })).status, 400)
  const legacy = await new SignJWT({ email: admin.email, sessionVersion: 0, customerVersion: null }).setProtectedHeader({ alg: 'HS256' }).setSubject(admin.id).setExpirationTime('1h').sign(new TextEncoder().encode(secret))
  assert.equal((await app.request('/api/admin/auth/me', { headers: { Authorization: `Bearer ${legacy}` } })).status, 401)
  admin.role = 'CUSTOMER'
  assert.equal((await app.request('/api/admin/auth/me', { headers: authorization })).status, 401)
})

test('administrator account APIs enforce database permission, strict fields and expired sessions', async () => {
  const user: AuthUser = { id: '11111111-1111-4111-8111-111111111111', email: 'admin', passwordHash: await hashPassword('password123'), companyName: 'MRS', managerName: 'Admin', role: 'ADMIN', adminRole: 'SYSTEM_ADMIN', status: 'ACTIVE', sessionVersion: 0 }
  const input = { loginId: 'sales.test', password: 'password123', name: 'Sales', phone: '', adminRole: 'SALES', status: 'ACTIVE', reason: 'New staff' }
  let calls = 0
  const app = createApp({ checkDatabase: async () => {}, readinessTimeoutMs: 50, auth: { secret: 'test-secret-at-least-32-characters', expiresIn: '1h', repository: { findByEmail: async () => user, findById: async () => user, createRegistration: async () => user, listMembers: async () => [], approveMember: async () => null } }, adminAccounts: { list: async () => { calls += 1; return [] }, create: async () => { calls += 1; return {} }, update: async () => { calls += 1; return {} } } as unknown as AdminAccountRepository })
  const login = await app.request('/api/admin/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: user.email, password: 'password123' }) })
  const { data } = await login.json() as { data: { accessToken: string; user: Record<string, unknown> } }
  assert.equal(data.user.adminRole, 'SYSTEM_ADMIN')
  assert.equal(data.user.passwordHash, undefined)
  const headers = { Authorization: `Bearer ${data.accessToken}`, 'Content-Type': 'application/json' }
  assert.equal((await app.request('/api/admin/accounts', { headers })).status, 200)
  assert.equal((await app.request('/api/admin/accounts', { method: 'POST', headers, body: JSON.stringify(input) })).status, 201)
  const update = { name: 'Sales', phone: '', adminRole: 'LOGISTICS', status: 'SUSPENDED', reason: 'Changed assignment', version: 0 }
  assert.equal((await app.request(`/api/admin/accounts/${user.id}`, { method: 'PATCH', headers, body: JSON.stringify(update) })).status, 200)
  for (const invalid of [{ ...input, role: 'CUSTOMER' }, { ...input, password: 'short' }, { ...input, loginId: 'invalid space' }, { ...input, adminRole: 'CUSTOMER' }, { ...input, reason: ' ' }]) {
    assert.equal(adminAccountCreate.safeParse(invalid).success, false)
    assert.equal((await app.request('/api/admin/accounts', { method: 'POST', headers, body: JSON.stringify(invalid) })).status, 400)
  }
  assert.equal(adminAccountUpdate.safeParse({ ...update, loginId: 'renamed' }).success, false)
  const allowedCalls = calls
  for (const permission of ['ADMIN', 'SALES', 'LOGISTICS', null] as const) {
    user.adminRole = permission
    assert.equal((await app.request('/api/admin/accounts', { headers })).status, 403)
    assert.equal((await app.request('/api/admin/accounts', { method: 'POST', headers, body: JSON.stringify(input) })).status, 403)
    assert.equal((await app.request(`/api/admin/accounts/${user.id}`, { method: 'PATCH', headers, body: JSON.stringify(update) })).status, 403)
  }
  assert.equal(calls, allowedCalls)
  user.adminRole = 'SYSTEM_ADMIN'
  user.sessionVersion = 1
  assert.equal((await app.request('/api/admin/accounts', { headers })).status, 401)
  assert.equal((await app.request('/api/admin/accounts')).status, 401)
  user.role = 'CUSTOMER'
  assert.equal((await app.request('/api/admin/accounts', { headers })).status, 401)
})