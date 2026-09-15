import { fileURLToPath } from 'node:url'
import { readConfig } from './src/config.js'
import { databaseOptions } from './src/database.js'

export default {
  production: {
    ...databaseOptions(readConfig().database),
    migrations: {
      directory: fileURLToPath(new URL('./migrations/', import.meta.url)),
      loadExtensions: ['.js'],
      tableName: 'knex_migrations',
    },
  },
}