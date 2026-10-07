import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SignJWT } from 'jose'
import { createApp } from '../src/app.js'
import type { AuthUser, AuthRepository } from '../src/auth.js'
import type { CartRepository } from '../src/cart.js'

const secret = 'cart-test-secret-at-least-32-characters'
const user: AuthUser = { id: '11111111-1111-4111-8111-111111111111', email: 'cart@example.test', passwordHash: 'unused', companyName: '회사', managerName: '담당자', role: 'CUSTOMER', status: 'ACTIVE', sessionVersion: 0, customerId: 'CUS-TEST', customer: { id: 'CUS-TEST', name: '회사', businessNumber: null, representativeName: '', address: '', phone: '', status: 'ACTIVE', accessVersion: 0 } }
async function fixture(role: AuthUser['role'] = 'CUSTOMER') {
  const actor = { ...user, role }
  const calls: unknown[] = []
  const data = { id: null, version: 0, items: [] }
  const record = (method: string) => async (...args: unknown[]) => { calls.push({ method, args }); return data }
  const repository: CartRepository = { list: record('list'), add: record('add'), sync: record('sync'), update: record('update'), remove: record('remove') }
  const auth: AuthRepository = { findById: async () => actor, findByEmail: async () => actor, createRegistration: async () => actor, listMembers: async () => [], approveMember: async () => null }
  const app = createApp({ checkDatabase: async () => {}, readinessTimeoutMs: 50, auth: { repository: auth, secret, expiresIn: '1h' }, cart: repository })
  const token = await new SignJWT({ email: actor.email, sessionVersion: 0, customerVersion: 0 }).setProtectedHeader({ alg: 'HS256' }).setSubject(actor.id).setAudience(role === 'ADMIN' ? 'admin' : 'customer').setExpirationTime('1h').sign(new TextEncoder().encode(secret))
  const request = (path: string, method = 'GET', body?: unknown) => app.request(path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  return { app, calls, request, actor }
}
test('cart routes require customer authentication and pass authenticated ownership', async () => {
  const member = await fixture()
  assert.equal((await member.app.request('/api/cart')).status, 401)
  const response = await member.request('/api/cart')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.equal((member.calls[0] as { args: AuthUser[] }).args[0]!.id, member.actor.id)
  const admin = await fixture('ADMIN')
  assert.equal((await admin.request('/api/cart')).status, 401)
})
test('cart add, sync, patch and delete reject malformed quantities, duplicates and owner injection', async () => {
  const member = await fixture()
  const operationId = crypto.randomUUID()
  const input = { operationId, productId: 'PRD-TEST', quantity: '1.001' }
  assert.equal((await member.request('/api/cart/items', 'POST', input)).status, 200)
  for (const quantity of ['0', '-1', '1.0001', '1000000001', 'NaN']) assert.equal((await member.request('/api/cart/items', 'POST', { ...input, quantity })).status, 400)
  assert.equal((await member.request('/api/cart/items', 'POST', { ...input, userId: 'other' })).status, 400)
  const item = { productId: 'PRD-TEST', quantity: '1' }
  assert.equal((await member.request('/api/cart/sync', 'POST', { operationId, items: [item] })).status, 200)
  assert.equal((await member.request('/api/cart/sync', 'POST', { operationId, items: [item, item] })).status, 400)
  assert.equal((await member.request('/api/cart/sync', 'POST', { operationId, items: [] })).status, 400)
  assert.equal((await member.request(`/api/cart/items/${operationId}`, 'PATCH', { quantity: '2', expectedVersion: 0 })).status, 200)
  assert.equal((await member.request(`/api/cart/items/${operationId}`, 'PATCH', { quantity: '2' })).status, 400)
  assert.equal((await member.request('/api/cart/items', 'DELETE', { items: [{ id: operationId, expectedVersion: 0 }] })).status, 200)
  assert.equal((await member.request('/api/cart/items/bad?version=0', 'DELETE')).status, 400)
})