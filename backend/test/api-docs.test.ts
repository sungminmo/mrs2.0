import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from '../src/app.js'
import { createDatabase } from '../src/database.js'
import { createAuthRepository, createCustomerRepository } from '../src/customer.js'
import { createAssetRepository } from '../src/asset.js'
import { createAdminDataRepository } from '../src/admin-data.js'
import { createAdminAccountRepository } from '../src/admin-accounts.js'
import { createAdminImageRepository, createImageStorage } from '../src/admin-images.js'
import { createReceivingRepository } from '../src/receiving.js'
import { createInspectionRepository } from '../src/inspection.js'
import { createLocationRepository } from '../src/location.js'
import { createMarketRepository } from '../src/market.js'
import { createCartRepository } from '../src/cart.js'
import { createQuoteRepository } from '../src/quote.js'
import { createCampaignRepository } from '../src/campaign.js'
import { createOutboundRepository } from '../src/outbound.js'
import { responseSchemas } from '../src/api-schemas.js'

test('Scalar documents cover live domain routes, separate audiences and resolve all schemas without DB access', async context => {
  const database = createDatabase({ host: '127.0.0.1', port: 1, name: 'unused', user: 'unused', password: '', poolMax: 1, timeoutMs: 100 })
  context.after(() => database.close())
  const client = database.client
  const app = createApp({ checkDatabase: async () => {}, readinessTimeoutMs: 100, auth: { repository: createAuthRepository(client), secret: 'docs-test-secret-long-enough', expiresIn: '1h' }, assets: createAssetRepository(client), customers: createCustomerRepository(client), adminData: createAdminDataRepository(client), adminAccounts: createAdminAccountRepository(client), adminImages: createAdminImageRepository(client), imageStorage: createImageStorage(), receivings: createReceivingRepository(client), inspections: createInspectionRepository(client), locations: createLocationRepository(client), market: createMarketRepository(client), cart: createCartRepository(client), quotes: createQuoteRepository(client), campaigns: createCampaignRepository(client), outbound: createOutboundRepository(client), banners: { list: async () => [], findByIds: async () => [], replace: async () => { throw new Error('unused') } } })
  const all = await (await app.request('/api/openapi.json')).json()
  for (const route of app.routes) {
    if (!route.path.startsWith('/api/') || route.path.includes('*') || route.path.startsWith('/api/docs') || route.path.startsWith('/api/openapi')) continue
    const method = route.method.toLowerCase()
    if (method === 'all') continue
    const path = route.path.replace(/:([a-zA-Z]+)/g, '{$1}')
    assert.ok(all.paths[path]?.[method], `${method} ${path} missing from OpenAPI`)
  }
  for (const scope of ['customer', 'admin'] as const) {
    const response = await app.request(`/api/openapi/${scope}.json`)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const spec = await response.json()
    const scheme = scope === 'admin' ? 'AdminBearer' : 'CustomerBearer'
    assert.deepEqual(Object.keys(spec.components.securitySchemes), [scheme])
    const ids = new Set<string>()
    for (const [path, item] of Object.entries(spec.paths) as [string, Record<string, any>][]) {
      if (path.startsWith('/api/health/')) continue
      assert.equal(path.startsWith('/api/admin/'), scope === 'admin', path)
      for (const [method, operation] of Object.entries(item)) {
        assert.ok(operation.operationId)
        assert.ok(operation.tags.every((tag: string) => tag.length > 0))
        assert.equal(ids.has(operation.operationId), false)
        ids.add(operation.operationId)
        const publicRoute = ['/api/auth/login', '/api/auth/register', '/api/admin/auth/login', '/api/customers/lookup', '/api/market/products', '/api/banners'].includes(path)
        assert.deepEqual(operation.security, publicRoute ? [] : [{ [scheme]: [] }], `${method} ${path}`)
        if (!publicRoute) { assert.ok(operation.responses['401']); assert.ok(operation.responses['403']) }
      }
    }
    const refs = JSON.stringify(spec).matchAll(/"\$ref":"#\/components\/schemas\/([^"]+)"/g)
    for (const match of refs) assert.ok(spec.components.schemas[match[1]!], `unresolved ${match[1]}`)
    assert.ok(spec.components.schemas.AuthenticationSession)
    assert.equal(!!spec.paths['/api/auth/login'], scope === 'customer')
    assert.equal(!!spec.paths['/api/admin/auth/login'], scope === 'admin')
    assert.equal(Object.keys(spec.components.schemas).some(name => name.startsWith(scope === 'admin' ? 'CustomerPurchaseQuotes' : 'Admin')), false)
    const html = await (await app.request(`/api/docs/${scope}`)).text()
    assert.match(html, new RegExp(`/api/openapi/${scope}\\.json`))
    assert.match(html, /persistAuth.*false/)
    assert.match(html, new RegExp(scheme))
  }
  const combined = await (await app.request('/api/docs')).text()
  assert.match(combined, /\/api\/openapi\/customer.json/)
  assert.match(combined, /\/api\/openapi\/admin.json/)
  for (const endpoint of ['/api/assets', '/api/customer/quotes', '/api/admin/data', '/api/admin/accounts']) assert.equal((await app.request(endpoint)).status, 401)
})

test('documented authentication and history responses match serialized DTO shapes', () => {
  const entry = { id: 'INSP-1', receivingId: 'REQ-1', siteName: '현장', receivedAt: '2026-10-08T00:00:00.000Z', status: 'COMPLETED', acknowledgedAt: '2026-10-08T01:00:00.000Z', consentedAt: null, hasDisposalTargets: false, disposalTargetCount: 0, consentRequired: false, canConsent: false }
  const inspection = responseSchemas.get('get /api/customer/inspections')!
  assert.equal(inspection.safeParse({ data: [entry], meta: { page: 1, size: 20, totalElements: 1, totalPages: 1 }, summary: { acknowledgement: { PENDING: 0, COMPLETED: 1 }, disposal: { NONE: 1, REQUIRED: 0, CONSENTED: 0 } } }).success, true)
  assert.equal(inspection.safeParse({ data: [{ ...entry, consentRequired: 'false' }] }).success, false)
})