import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from './generated/prisma/client.js'
import type { Config } from './config.js'

export function databaseOptions(config: Config['database']) {
  return {
    host: config.host,
    port: config.port,
    database: config.name,
    user: config.user,
    password: config.password,
    charset: 'utf8mb4',
    timezone: '+00:00',
    connectionLimit: config.poolMax,
    minimumIdle: 0,
    connectTimeout: config.timeoutMs,
    acquireTimeout: config.timeoutMs,
    socketTimeout: config.timeoutMs,
    queryTimeout: config.timeoutMs,
    multipleStatements: false,
  }
}

export function createDatabase(config: Config['database']) {
  const client = new PrismaClient({ adapter: new PrismaMariaDb(databaseOptions(config)) })
  let probe: Promise<void> | undefined

  return {
    client,
    check: () => {
      probe ??= client.$queryRaw`SELECT 1`
        .then(() => {}).finally(() => { probe = undefined })
      return probe
    },
    close: () => client.$disconnect(),
  }
}