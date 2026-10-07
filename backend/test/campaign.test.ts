import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SignJWT } from 'jose'
import { createApp } from '../src/app.js'
import type { AuthUser, AuthRepository } from '../src/auth.js'
import { campaignInput, campaignUpdate, campaignProductQuery, enabledMarketCategoryIds, type CampaignRepository } from '../src/campaign.js'

const input = { name: '직접 편성', description: '기획전 설명', enabled: true, order: 1, startsAt: '2026-10-01T00:00:00+09:00', endsAt: '2026-11-01T00:00:00+09:00', productIds: ['PRD-1'], reason: '편성 등록' }
test('campaign contracts reject categories, duplicates, empty exposure, invalid dates and more than 100 products', () => {
  assert.equal(campaignInput.safeParse(input).success, true)
  for (const value of [{ ...input, category: '010000' }, { ...input, productIds: ['PRD-1', 'PRD-1'] }, { ...input, productIds: [] }, { ...input, productIds: Array.from({ length: 101 }, (_, index) => `PRD-${index}`) }, { ...input, endsAt: input.startsAt }, { ...input, startsAt: '2026-02-30T00:00:00Z' }, { ...input, reason: ' ' }]) assert.equal(campaignInput.safeParse(value).success, false)
  assert.equal(campaignInput.safeParse({ ...input, enabled: false, productIds: [] }).success, true)
  assert.equal(campaignUpdate.safeParse(input).success, false)
  assert.equal(campaignUpdate.safeParse({ ...input, version: 0 }).success, true)
  assert.equal(campaignProductQuery.safeParse({ rows: 101 }).success, false)
  assert.deepEqual(enabledMarketCategoryIds([{ id: 'root', parentId: null, enabled: false }, { id: 'leaf', parentId: 'root', enabled: true }, { id: 'good', parentId: null, enabled: true }, { id: 'orphan', parentId: 'missing', enabled: true }]), ['good'])
})
test('campaign APIs require administrator authentication and use private responses', async () => {
  const secret = 'campaign-secret-at-least-32-characters'
  const actor: AuthUser = { id: crypto.randomUUID(), email: 'admin@example.test', passwordHash: 'unused', companyName: 'MRS', managerName: '관리자', role: 'ADMIN', status: 'ACTIVE', sessionVersion: 0 }
  const calls: unknown[] = []
  const repository: CampaignRepository = { products: async query => { calls.push(query); return { products: [], pagination: { page: 1, rows: 20, total: 0 } } }, save: async (user, body, id) => { calls.push({ user, body, id }); return { id: id ?? 'CAM-TEST', ...body, version: 0, products: [], productCount: 1, visibleProductCount: 0 } } }
  const auth: AuthRepository = { findById: async () => actor, findByEmail: async () => actor, createRegistration: async () => actor, listMembers: async () => [], approveMember: async () => null }
  const app = createApp({ checkDatabase: async () => {}, readinessTimeoutMs: 50, auth: { repository: auth, secret, expiresIn: '1h' }, campaigns: repository })
  const token = await new SignJWT({ email: actor.email, sessionVersion: 0 }).setProtectedHeader({ alg: 'HS256' }).setSubject(actor.id).setAudience('admin').setExpirationTime('1h').sign(new TextEncoder().encode(secret))
  const request = (path: string, method = 'GET', body?: unknown) => app.request(path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
  assert.equal((await app.request('/api/admin/campaign-products')).status, 401)
  const products = await request('/api/admin/campaign-products?q=PRD&status=DRAFT')
  assert.equal(products.status, 200)
  assert.equal(products.headers.get('Cache-Control'), 'private, no-store')
  assert.equal((await request('/api/admin/campaigns', 'POST', input)).status, 201)
  assert.equal((await request('/api/admin/campaigns/CAM-TEST', 'PUT', { ...input, version: 0 })).status, 200)
  assert.equal((calls[1] as { user: AuthUser }).user.id, actor.id)
  assert.equal((await request('/api/admin/campaigns', 'POST', { ...input, category: '010000' })).status, 400)
  assert.equal((await request('/api/admin/campaigns/CAM-TEST', 'PUT', input)).status, 400)
  actor.role = 'CUSTOMER'
  assert.equal((await request('/api/admin/campaign-products')).status, 401)
})