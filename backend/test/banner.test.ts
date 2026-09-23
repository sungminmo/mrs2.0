import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from '../src/app.js'
import { hashPassword, type AuthUser } from '../src/auth.js'
import type { BannerItemRecord, BannerPlacementInput, BannerPlacementRecord, BannerRepository } from '../src/banner.js'

function item(id: string, overrides: Partial<BannerItemRecord> = {}): BannerItemRecord {
  return { id, placementId: 'customer-home-hero', desktopImageUrl: `/mrs2.0/${id}-desktop.jpg`, mobileImageUrl: `/mrs2.0/${id}-mobile.jpg`, linkUrl: null, enabled: true, sortOrder: 0, startsAt: null, endsAt: null, createdAt: new Date('2026-09-01T00:00:00Z'), updatedAt: new Date('2026-09-01T00:00:00Z'), ...overrides }
}

function placement(items: BannerItemRecord[] = []): BannerPlacementRecord {
  return { id: 'customer-home-hero', name: '고객 홈 메인 배너', enabled: true, items, createdAt: new Date('2026-09-01T00:00:00Z'), updatedAt: new Date('2026-09-01T00:00:00Z') }
}

function repository(records: BannerPlacementRecord[]): BannerRepository {
  return {
    list: async () => records,
    findByIds: async (ids) => records.filter((record) => ids.includes(record.id)),
    replace: async (id, input: BannerPlacementInput) => {
      const now = new Date()
      const record: BannerPlacementRecord = { id, name: input.name, enabled: input.enabled, items: input.items.map((entry) => ({ ...entry, placementId: id, createdAt: now, updatedAt: now })), createdAt: now, updatedAt: now }
      const index = records.findIndex((candidate) => candidate.id === id)
      if (index < 0) records.push(record); else records[index] = record
      return record
    },
  }
}

test('public placement returns active items in configured order', async () => {
  const records = [placement([
    item('11111111-1111-4111-8111-111111111111', { sortOrder: 2 }),
    item('22222222-2222-4222-8222-222222222222', { sortOrder: 1 }),
    item('33333333-3333-4333-8333-333333333333', { enabled: false }),
    item('44444444-4444-4444-8444-444444444444', { startsAt: new Date('2999-01-01T00:00:00Z') }),
  ])]
  const app = createApp({ checkDatabase: async () => {}, readinessTimeoutMs: 50, banners: repository(records) })
  const response = await app.request('/api/banners?placements=customer-home-hero')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  const body = await response.json() as { data: { placements: Array<{ id: string; items: Array<{ id: string }> }> } }
  assert.equal(body.data.placements[0]?.id, 'customer-home-hero')
  assert.deepEqual(body.data.placements[0]?.items.map((entry) => entry.id), ['22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111'])
})

test('administrator can save a placement with multiple linked images', async () => {
  const passwordHash = await hashPassword('admin-password')
  const admin: AuthUser = { id: '11111111-1111-4111-8111-111111111111', email: 'admin@example.com', passwordHash, companyName: 'MRS', managerName: '관리자', role: 'ADMIN', status: 'ACTIVE' }
  const records: BannerPlacementRecord[] = []
  const app = createApp({ checkDatabase: async () => {}, readinessTimeoutMs: 50, banners: repository(records), auth: { secret: 'test-only-secret-at-least-32-characters', expiresIn: '1h', repository: { findByEmail: async () => admin, findById: async () => admin, createRegistration: async () => { throw new Error('Not used') }, listMembers: async () => [], approveMember: async () => null } } })
  assert.equal((await app.request('/api/admin/banners')).status, 401)
  const login = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: admin.email, password: 'admin-password' }) })
  const token = (await login.json() as { data: { accessToken: string } }).data.accessToken
  const entry = (id: string, sortOrder: number) => ({ id, desktopImageUrl: '/mrs2.0/desktop.jpg', mobileImageUrl: '/mrs2.0/mobile.jpg', linkUrl: 'https://example.com/event', enabled: true, sortOrder, startsAt: null, endsAt: null })
  const response = await app.request('/api/admin/banners/customer-market-top', { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '마켓 상단', enabled: true, items: [entry('11111111-1111-4111-8111-111111111111', 1), entry('22222222-2222-4222-8222-222222222222', 2)] }) })
  assert.equal(response.status, 200)
  assert.equal(records[0]?.id, 'customer-market-top')
  assert.equal(records[0]?.items.length, 2)
  assert.equal(records[0]?.items[0]?.linkUrl, 'https://example.com/event')
})