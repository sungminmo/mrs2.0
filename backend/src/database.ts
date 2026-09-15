import knex from 'knex'
import type { Knex } from 'knex'
import type { Config } from './config.js'

export function databaseOptions(config: Config['database']): Knex.Config {
  return {
    client: 'mysql2',
    connection: {
      host: config.host,
      port: config.port,
      database: config.name,
      user: config.user,
      password: config.password,
      charset: 'utf8mb4',
      timezone: 'Z',
      connectTimeout: config.timeoutMs,
      multipleStatements: false,
    },
    pool: { min: 0, max: config.poolMax },
    acquireConnectionTimeout: config.timeoutMs,
  }
}

export function createDatabase(config: Config['database']) {
  const connection = knex(databaseOptions(config))
  let probe: Promise<void> | undefined

  return {
    check: () => {
      probe ??= connection.raw('SELECT 1').timeout(config.timeoutMs, { cancel: true })
        .then(() => {}).finally(() => { probe = undefined })
      return probe
    },
    close: () => connection.destroy(),
  }
}