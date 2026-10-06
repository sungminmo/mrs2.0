import assert from 'node:assert/strict'
import test from 'node:test'
import { createApp } from '../src/app.js'
import { hashPassword, type AuthRepository, type AuthUser } from '../src/auth.js'
import { defaultAppraisal, inspectionWrite, type InspectionRepository } from '../src/inspection.js'
import { Prisma } from '../src/generated/prisma/client.js'

test('inspection routes isolate audiences, validate versions and consent and control ownership', async () => {
  const passwordHash = await hashPassword('inspection-test-123')
  const customer: AuthUser = { id: '11111111-1111-4111-8111-111111111111', email: 'inspection@example.test', passwordHash, role: 'CUSTOMER', status: 'ACTIVE', customerRole: 'MANAGER', companyName: 'Test', managerName: 'Test', customerId: 'CUS-TEST', customer: { id: 'CUS-TEST', name: 'Test', businessNumber: '2208162517', representativeName: 'Owner', address: 'Seoul', phone: '010', status: 'ACTIVE', accessVersion: 0 } }
  const admin: AuthUser = { ...customer, id: '22222222-2222-4222-8222-222222222222', role: 'ADMIN', adminRole: 'ADMIN', email: 'admin@example.test', customer: null, customerId: null }
  const auth: AuthRepository = { findByEmail: async (email) => email === admin.email ? admin : customer, findById: async (id) => id === admin.id ? admin : customer, createRegistration: async () => customer, listMembers: async () => [], approveMember: async () => null }
  const calls: unknown[][] = []
  const collect = async (...args: unknown[]) => { calls.push(args); return { id: 'RCV-TEST' } }
  const inspections = { receive: collect, draft: collect, save: collect, detail: collect, customerAction: collect, list: async (...args: unknown[]) => { calls.push(args); return { data: [], meta: { page: 1 } } } } as unknown as InspectionRepository
  const app = createApp({ checkDatabase: async () => {}, readinessTimeoutMs: 50, auth: { repository: auth, secret: 'inspection-test-only-secret-with-32-chars', expiresIn: '1h' }, inspections })
  const login = async (administrator: boolean) => {
    const response = await app.request(administrator ? '/api/admin/auth/login' : '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(administrator ? { id: admin.email, password: 'inspection-test-123' } : { email: customer.email, password: 'inspection-test-123' }) })
    return (await response.json() as { data: { accessToken: string } }).data.accessToken
  }
  const adminToken = await login(true), customerToken = await login(false)
  const request = (path: string, token: string, body?: unknown, method = 'POST') => app.request(path, { method: body === undefined ? 'GET' : method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const path = '/api/admin/inspections/RCV-TEST/draft'
  assert.equal((await request(path, customerToken, { version: 0, rows: [], reason: '초안' }, 'PUT')).status, 401)
  assert.equal((await request('/api/customer/inspections/RCV-TEST', adminToken)).status, 401)
  for (const body of [{ version: -1, rows: [], reason: '초안' }, { version: 0, rows: [], reason: '' }, { version: 0, rows: [], reason: '초안', customerId: 'OTHER' }, { version: 0, rows: Array(1001).fill({}), reason: '초안' }]) assert.equal((await request(path, adminToken, body, 'PUT')).status, 400)
  assert.equal((await request(path, adminToken, { version: 0, rows: [], reason: '초안' }, 'PUT')).status, 200)
  assert.equal((await request('/api/customer/inspections/RCV-TEST', customerToken)).status, 200)
  assert.equal(calls.at(-1)![1], 'CUS-TEST')
  for (const suffix of ['acknowledge', 'disposal-consent']) {
    assert.equal((await request(`/api/customer/inspections/RCV-TEST/${suffix}`, customerToken, { version: 0, agreed: false })).status, 400)
    const response = await request(`/api/customer/inspections/RCV-TEST/${suffix}`, customerToken, { version: 0, ...(suffix === 'disposal-consent' ? { agreed: true } : {}) })
    assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store')
  }
  assert.equal((await request('/api/customer/inspections?customerId=OTHER', customerToken)).status, 400)
  assert.equal((await request('/api/admin/receivings/REQ-TEST/receive', adminToken, { receivedAt: '2999-01-01T00:00:00Z', reason: '입고' })).status, 400)
  admin.status = 'SUSPENDED'
  assert.equal((await request(path, adminToken, { version: 0, rows: [], reason: '초안' }, 'PUT')).status, 401)
})

test('draft quantities never throw decimal errors for malformed input and photos reject external hosts', () => {
  const row = { id: '11111111-1111-4111-8111-111111111111', name: '', specification: '', categoryId: '', unit: '', grade: '', received: '', usable: '', disposal: '' }
  assert.equal(inspectionWrite.safeParse({ version: 0, reason: '초안', rows: [row] }).success, true)
  for (const received of ['oops', '-1', '1.1234', '1000000001']) assert.equal(inspectionWrite.safeParse({ version: 0, reason: '초안', rows: [{ ...row, received }] }).success, false)
  assert.equal(inspectionWrite.safeParse({ version: 0, reason: '초안', rows: [{ ...row, photos: [{ id: row.id, name: '사진', url: 'https://example.com/a.webp' }] }] }).success, false)
})

test('unit appraisal discounts inbound prices and permits optional overrides', () => {
  for (const [grade, expected] of [['S', '900'], ['A', '800'], ['B', '600'], ['F', null]]) assert.equal(defaultAppraisal(new Prisma.Decimal(1000), grade!), expected)
  assert.equal(defaultAppraisal(null, 'S'), null)
  assert.equal(defaultAppraisal(new Prisma.Decimal(0), 'A'), '0')
  assert.equal(defaultAppraisal(new Prisma.Decimal(105), 'S'), '95')
  const row = { id: '11111111-1111-4111-8111-111111111111', name: '', specification: '', categoryId: '', unit: '', grade: '', received: '', usable: '', disposal: '' }
  for (const appraisal of [undefined, null, '0', '1234', '1000000000000']) assert.equal(inspectionWrite.safeParse({ version: 0, reason: '초안', rows: [{ ...row, appraisal }] }).success, true)
  for (const appraisal of ['-1', '1.5', '1000000000001', 'oops', '']) assert.equal(inspectionWrite.safeParse({ version: 0, reason: '초안', rows: [{ ...row, appraisal }] }).success, false)
})