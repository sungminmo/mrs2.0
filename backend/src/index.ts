import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import type { BannerPlacementInput } from './banner.js'
import { readConfig } from './config.js'
import { createDatabase } from './database.js'

const config = readConfig()
const database = createDatabase(config.database)
const authRepository = {
  findByEmail: (email: string) => database.client.user.findUnique({ where: { email } }),
  findById: (id: string) => database.client.user.findUnique({ where: { id } }),
  createRegistration: (input: Parameters<typeof database.client.user.create>[0]['data']) => database.client.user.create({ data: input }),
  listMembers: () => database.client.user.findMany({ orderBy: { createdAt: 'desc' } }),
  approveMember: async (id: string, approvedAt: Date) => {
    const result = await database.client.user.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'ACTIVE', approvedAt } })
    return result.count === 1 ? database.client.user.findUnique({ where: { id } }) : null
  },
}
const bannerRepository = {
  list: () => database.client.bannerPlacement.findMany({ include: { items: true }, orderBy: { id: 'asc' } }),
  findByIds: (ids: string[]) => database.client.bannerPlacement.findMany({ where: { id: { in: ids } }, include: { items: true } }),
  replace: (id: string, data: BannerPlacementInput) => database.client.$transaction(async (transaction) => {
    const placement = await transaction.bannerPlacement.upsert({ where: { id }, create: { id, name: data.name, enabled: data.enabled }, update: { name: data.name, enabled: data.enabled } })
    await transaction.bannerItem.deleteMany({ where: { placementId: id } })
    if (data.items.length) await transaction.bannerItem.createMany({ data: data.items.map((item) => ({ ...item, placementId: id })) })
    return { ...placement, items: await transaction.bannerItem.findMany({ where: { placementId: id }, orderBy: { sortOrder: 'asc' } }) }
  }),
}
const app = createApp({ checkDatabase: database.check, readinessTimeoutMs: config.readinessTimeoutMs, auth: { repository: authRepository, ...config.jwt }, banners: bannerRepository })
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