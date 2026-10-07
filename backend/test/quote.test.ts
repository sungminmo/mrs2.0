import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SignJWT } from 'jose'
import { createApp } from '../src/app.js'
import type { AuthUser, AuthRepository } from '../src/auth.js'
import { quoteCreateInput, quotePreviewInput, validateQuoteDate, type QuoteRepository } from '../src/quote.js'

test('purchase quote requests reject duplicate products, owner injection and invalid cart sources', () => {
  const item = { productId: 'PRD-TEST', quantity: '1.001' }
  assert.equal(quotePreviewInput.parse({ source: 'product', items: [item] }).items[0]?.quantity, '1.001')
  for (const input of [{ source: 'product', items: [item, item] }, { source: 'cart', items: [item] }, { source: 'product', items: [item], customerId: 'OTHER' }, { source: 'product', items: [] }]) assert.equal(quotePreviewInput.safeParse(input).success, false)
  for (const quantity of ['0', '-1', '1e2', '1.0001', '1000000001']) assert.equal(quotePreviewInput.safeParse({ source: 'product', items: [{ ...item, quantity }] }).success, false)
  const body = { source: 'product', items: [item], operationId: crypto.randomUUID(), expectedSnapshot: 'a'.repeat(64), contact: { name: '담당자', phone: '010', email: '' } }
  assert.equal(quoteCreateInput.safeParse(body).success, true)
  assert.equal(quoteCreateInput.safeParse({ ...body, contact: { name: ' ', phone: '010' } }).success, false)
  assert.equal(quoteCreateInput.safeParse({ ...body, total: '0' }).success, false)
})
test('purchase quote delivery dates use actual calendar dates and Korean today', () => {
  assert.doesNotThrow(() => validateQuoteDate(null))
  assert.doesNotThrow(() => validateQuoteDate('2099-12-31'))
  for (const date of ['2020-01-01', '2099-02-30', '2099-13-01']) assert.throws(() => validateQuoteDate(date), /실제 날짜/)
})

test('quote API authenticates customers, protects prices and exposes reconfirmation without creating a quote', async () => {
  const secret = 'quote-test-secret-at-least-32-characters'
  const actor: AuthUser = { id: crypto.randomUUID(), email: 'quote@example.test', passwordHash: 'unused', companyName: '회사', managerName: '담당자', role: 'CUSTOMER', status: 'ACTIVE', sessionVersion: 0, customerId: 'CUS-TEST', customer: { id: 'CUS-TEST', name: '회사', businessNumber: null, representativeName: '', address: '', phone: '', status: 'ACTIVE', accessVersion: 0 } }
  const calls: AuthUser[] = []
  const preview = { company: '회사', items: [], total: '24000', originalTotal: '24000', snapshot: 'b'.repeat(64) }
  const repository: QuoteRepository = { preview: async user => { calls.push(user); return preview }, create: async user => { calls.push(user); return { changed: preview } }, list: async user => { calls.push(user); return { records: [], page: 1, size: 20, total: 0 } }, detail: async () => { throw new Error('unused') } }
  const auth: AuthRepository = { findById: async () => actor, findByEmail: async () => actor, createRegistration: async () => actor, listMembers: async () => [], approveMember: async () => null }
  const app = createApp({ checkDatabase: async () => {}, readinessTimeoutMs: 50, auth: { repository: auth, secret, expiresIn: '1h' }, quotes: repository })
  const token = await new SignJWT({ email: actor.email, sessionVersion: 0, customerVersion: 0 }).setProtectedHeader({ alg: 'HS256' }).setSubject(actor.id).setAudience('customer').setExpirationTime('1h').sign(new TextEncoder().encode(secret))
  const request = (path: string, body?: unknown) => app.request(path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  assert.equal((await app.request('/api/customer/quotes')).status, 401)
  assert.equal((await app.request('/api/customer/quotes/preview', { method: 'POST' })).status, 401)
  const draft = { source: 'product', items: [{ productId: 'PRD-TEST', quantity: '1' }] }
  const response = await request('/api/customer/quotes/preview', draft)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.equal((await response.json()).data.total, '24000')
  assert.equal(calls[0]?.customerId, actor.customerId)
  assert.equal((await request('/api/customer/quotes/preview', { ...draft, customerId: 'OTHER' })).status, 400)
  const changed = await request('/api/customer/quotes', { ...draft, operationId: crypto.randomUUID(), expectedSnapshot: 'a'.repeat(64), contact: { name: '담당자', phone: '010' } })
  assert.equal(changed.status, 409)
  assert.equal(changed.headers.get('Cache-Control'), 'private, no-store')
  assert.deepEqual((await changed.json()).preview, preview)
  assert.equal((await request('/api/customer/quotes')).status, 200)
  actor.role = 'ADMIN'
  assert.equal((await request('/api/customer/quotes')).status, 401)
  actor.role = 'CUSTOMER'
  actor.customer!.status = 'SUSPENDED'
  assert.equal((await request('/api/customer/quotes')).status, 401)
})