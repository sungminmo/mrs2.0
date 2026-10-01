import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { createAssetRepository } from './asset.js'
import type { BannerPlacementInput } from './banner.js'
import { readConfig } from './config.js'
import { createDatabase } from './database.js'
import { createAdminDataRepository } from './admin-data.js'
import { createAuthRepository, createCustomerRepository } from './customer.js'
import { createAdminAccountRepository } from './admin-accounts.js'
import { adminListQuery, listPaging } from './admin-pagination.js'

const config = readConfig()
const database = createDatabase(config.database)
const authRepository = createAuthRepository(database.client)
const bannerRepository = {
  list: async (query = adminListQuery.parse({})) => (await database.client.bannerPlacement.findMany({ ...listPaging(query), include: { items: { select: { id: true, placementId: true, linkUrl: true, enabled: true, sortOrder: true, startsAt: true, endsAt: true, createdAt: true, updatedAt: true } } }, orderBy: { id: 'asc' } })).map((placement) => ({ ...placement, items: placement.items.map((item) => ({ ...item, desktopImageUrl: '', mobileImageUrl: '' })) })),
  count: () => database.client.bannerPlacement.count(),
  findByIds: (ids: string[]) => database.client.bannerPlacement.findMany({ where: { id: { in: ids } }, include: { items: true } }),
  replace: (id: string, data: BannerPlacementInput) => database.client.$transaction(async (transaction) => {
    const placement = await transaction.bannerPlacement.upsert({ where: { id }, create: { id, name: data.name, enabled: data.enabled }, update: { name: data.name, enabled: data.enabled } })
    await transaction.bannerItem.deleteMany({ where: { placementId: id } })
    if (data.items.length) await transaction.bannerItem.createMany({ data: data.items.map((item) => ({ ...item, placementId: id })) })
    return { ...placement, items: await transaction.bannerItem.findMany({ where: { placementId: id }, orderBy: { sortOrder: 'asc' } }) }
  }),
}
const app = createApp({ checkDatabase: database.check, readinessTimeoutMs: config.readinessTimeoutMs, auth: { repository: authRepository, ...config.jwt }, assets: createAssetRepository(database.client), banners: bannerRepository, adminData: createAdminDataRepository(database.client), customers: createCustomerRepository(database.client), adminAccounts: createAdminAccountRepository(database.client) })
const server = serve({ fetch: app.fetch, hostname: '0.0.0.0', port: config.port }, (info) => {
  console.info(`Backend listening on port ${info.port}`)
})

let shuttingDown = false

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  const deadline = setTimeout(() => process.exit(1), 10000)
  deadline.unref()
  server.close((error) => {
    void database.close().then(() => {
      clearTimeout(deadline)
      process.exitCode = error ? 1 : 0
    }).catch(() => {
      console.error('Database shutdown failed')
      process.exitCode = 1
    })
  })
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)