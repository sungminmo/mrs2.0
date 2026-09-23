import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from '../src/app.js'
import { hashPassword, type AuthUser } from '../src/auth.js'
import type { BannerInput, BannerRecord, BannerRepository } from '../src/banner.js'

function banner(id: string, overrides: Partial<BannerRecord> = {}): BannerRecord {
  return {
    id,
    desktopImageUrl: `/mrs2.0/${id}-desktop.jpg`,
    mobileImageUrl: `/mrs2.0/${id}-mobile.jpg`,
    linkUrl: null,
    enabled: true,
    startsAt: null,
    endsAt: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  }
}

function repository(records: BannerRecord[]): BannerRepository {
  return {
    list: async () => records,
    findByIds: async (ids) => records.filter((record) => ids.includes(record.id)),
    upsert: async (id, input: BannerInput) => {
      const record = banner(id, { ...input, updatedAt: new Date() })
      const index = records.findIndex((candidate) => candidate.id === id)
      if (index < 0) records.push(record); else records[index] = record
      return record
    },
  }
}

test('public banner lookup returns only enabled banners within their schedule', async () => {
  const records = [
    banner('active'),
    banner('disabled', { enabled: false }),
    banner('future', { startsAt: new Date('2999-01-01T00:00:00Z') }),
    banner('expired', { endsAt: new Date('2000-01-01T00:00:00Z') }),
  ]
  const app = createApp({ checkDatabase: async () => {}, readinessTimeoutMs: 50, banners: repository(records) })
  const response = await app.request('/api/banners?ids=active,disabled,future,expired')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual((await response.json() as { data: { banners: BannerRecord[] } }).data.banners.map((record) => record.id), ['active'])
})

test('administrator can save an ID-based banner with external destination', async () => {
  const passwordHash = await hashPassword('admin-password')
  const admin: AuthUser = { id: '11111111-1111-4111-8111-111111111111', email: 'admin@example.com', passwordHash, companyName: 'MRS', managerName: '관리자', role: 'ADMIN', status: 'ACTIVE' }
  const records: BannerRecord[] = []
  const app = createApp({
    checkDatabase: async () => {},
    readinessTimeoutMs: 50,
    banners: repository(records),
    auth: {
      secret: 'test-only-secret-at-least-32-characters',
      expiresIn: '1h',
      repository: {
        findByEmail: async () => admin,
        findById: async () => admin,
        createRegistration: async () => { throw new Error('Not used') },
        listMembers: async () => [],
        approveMember: async () => null,
      },
    },
  })
  const unauthorized = await app.request('/api/admin/banners')
  assert.equal(unauthorized.status, 401)

  const login = await app.request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: admin.email, password: 'admin-password' }) })
  const token = (await login.json() as { data: { accessToken: string } }).data.accessToken
  const response = await app.request('/api/admin/banners/customer-market-top', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ desktopImageUrl: '/mrs2.0/desktop.jpg', mobileImageUrl: '/mrs2.0/mobile.jpg', linkUrl: 'https://example.com/event', enabled: true, startsAt: '2026-09-01T00:00:00+09:00', endsAt: '2026-10-01T00:00:00+09:00' }),
  })
  assert.equal(response.status, 200)
  assert.equal(records[0]?.id, 'customer-market-top')
  assert.equal(records[0]?.linkUrl, 'https://example.com/event')
})