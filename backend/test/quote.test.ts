import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SignJWT } from 'jose'
import { createApp } from '../src/app.js'
import type { AuthUser, AuthRepository } from '../src/auth.js'
import { quoteCreateInput, quoteListQuery, quotePreviewInput, validateQuoteDate, type QuoteRepository } from '../src/quote.js'
import { inspectionListQuery } from '../src/inspection.js'
import { outboundAction, outboundOffer, outboundShipment, type OutboundRepository } from '../src/outbound.js'

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

test('history list filters reject invalid states and injected ownership', () => {
  assert.equal(quoteListQuery.parse({ responseStatus: 'EXPIRED', q: ' 견적 ' }).q, '견적')
  for (const input of [{ responseStatus: 'DRAFT' }, { customerId: 'OTHER' }, { size: 101 }]) assert.equal(quoteListQuery.safeParse(input).success, false)
  assert.equal(inspectionListQuery.safeParse({ status: 'COMPLETED', disposal: 'REQUIRED' }).success, true)
  for (const input of [{ status: 'PENDING' }, { disposal: 'INVALID' }, { customerId: 'OTHER' }]) assert.equal(inspectionListQuery.safeParse(input).success, false)
})

test('outbound schemas reject owner injection, duplicate lines and invalid amounts', () => {
  const action = { operationId: crypto.randomUUID(), version: 0, reason: '검증' }
  const line = { productId: 'PRD-TEST', sourceQuoteItemId: null, quantity: '1.001', unitPrice: '1000' }
  const offer = { ...action, contactName: '담당', phone: '010', email: '', address: '주소', deliveryDate: null, deliveryMethod: 'DELIVERY', expiresAt: null, shippingFee: '0', note: '', items: [line] }
  assert.equal(outboundOffer.safeParse(offer).success, true)
  for (const input of [{ ...action, customerId: 'OTHER' }, { ...action, reason: ' ' }, { ...action, version: -1 }]) assert.equal(outboundAction.safeParse(input).success, false)
  for (const input of [{ ...offer, items: [line, line] }, { ...offer, items: [] }, { ...offer, shippingFee: '0.1' }, { ...offer, items: [{ ...line, unitPrice: '1000000000001' }] }]) assert.equal(outboundOffer.safeParse(input).success, false)
  const shipment = { ...action, orderVersion: 0, scheduledAt: null, carrier: '', vehicle: '', trackingNumber: '', note: '', items: [{ orderItemId: crypto.randomUUID(), quantity: '2' }] }
  assert.equal(outboundShipment.safeParse(shipment).success, true)
  assert.equal(outboundShipment.safeParse({ ...shipment, items: [shipment.items[0], shipment.items[0]] }).success, false)
})

test('outbound HTTP requires correct JWT audience and strict input and publishes OpenAPI', async () => {
  const secret = 'outbound-http-test-secret-at-least-32'
  const customer: AuthUser = { id: crypto.randomUUID(), email: 'buyer@example.test', passwordHash: 'unused', companyName: '회사', managerName: '담당', role: 'CUSTOMER', status: 'ACTIVE', sessionVersion: 0, customerId: 'CUS-TEST', customer: { id: 'CUS-TEST', name: '회사', businessNumber: null, representativeName: '', address: '', phone: '', status: 'ACTIVE', accessVersion: 0 } }
  const admin: AuthUser = { ...customer, id: crypto.randomUUID(), email: 'admin@example.test', role: 'ADMIN', customerId: null, customer: null }
  const calls: string[] = []
  const outbound = { command: async (_actor: AuthUser, action: string) => { calls.push(action); return { quoteId: crypto.randomUUID(), replayed: false } }, offers: async () => ({ offers: [], order: null }), list: async () => ({ records: [], total: 0, page: 1, size: 20 }), detail: async () => null } as unknown as OutboundRepository
  const auth: AuthRepository = { findById: async id => id === admin.id ? admin : customer, findByEmail: async () => customer, createRegistration: async () => customer, listMembers: async () => [], approveMember: async () => null }
  const app = createApp({ checkDatabase: async () => {}, readinessTimeoutMs: 50, auth: { repository: auth, secret, expiresIn: '1h' }, outbound })
  const token = async (actor: AuthUser) => new SignJWT({ email: actor.email, sessionVersion: 0, customerVersion: 0 }).setProtectedHeader({ alg: 'HS256' }).setSubject(actor.id).setAudience(actor.role === 'ADMIN' ? 'admin' : 'customer').setExpirationTime('1h').sign(new TextEncoder().encode(secret))
  const customerToken = await token(customer)
  const adminToken = await token(admin)
  const id = crypto.randomUUID()
  const action = { operationId: crypto.randomUUID(), version: 0, reason: '승인' }
  const request = (path: string, accessToken: string, body?: unknown) => app.request(path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  assert.equal((await app.request('/api/customer/orders')).status, 401)
  assert.equal((await request('/api/admin/orders', customerToken)).status, 401)
  assert.equal((await request('/api/customer/orders', adminToken)).status, 401)
  assert.equal((await request(`/api/customer/offers/${id}/accept`, customerToken, { ...action, customerId: 'OTHER' })).status, 400)
  assert.equal((await request('/api/customer/offers/not-uuid/accept', customerToken, action)).status, 400)
  assert.equal(calls.length, 0)
  const accepted = await request(`/api/customer/offers/${id}/accept`, customerToken, action)
  assert.equal(accepted.status, 200)
  assert.equal(accepted.headers.get('Cache-Control'), 'private, no-store')
  assert.deepEqual(calls, ['accept'])
  const list = await request('/api/customer/orders', customerToken)
  assert.equal(list.headers.get('Cache-Control'), 'private, no-store')
  const schema = await (await app.request('/api/openapi.json')).json()
  assert.ok(schema.paths['/api/admin/shipments/{id}/dispatch'])
  assert.ok(schema.paths['/api/customer/orders/{id}/cancellations'])
})

test('quote API authenticates customers, protects prices and exposes reconfirmation without creating a quote', async () => {
  const secret = 'quote-test-secret-at-least-32-characters'
  const actor: AuthUser = { id: crypto.randomUUID(), email: 'quote@example.test', passwordHash: 'unused', companyName: '회사', managerName: '담당자', role: 'CUSTOMER', status: 'ACTIVE', sessionVersion: 0, customerId: 'CUS-TEST', customer: { id: 'CUS-TEST', name: '회사', businessNumber: null, representativeName: '', address: '', phone: '', status: 'ACTIVE', accessVersion: 0 } }
  const calls: AuthUser[] = []
  const preview = { company: '회사', items: [], total: '24000', originalTotal: '24000', snapshot: 'b'.repeat(64) }
  const repository: QuoteRepository = { preview: async user => { calls.push(user); return preview }, create: async user => { calls.push(user); return { changed: preview } }, list: async user => { calls.push(user); return { records: [], page: 1, size: 20, total: 0, summary: {} } }, detail: async () => { throw new Error('unused') } }
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