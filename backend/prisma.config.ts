import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'prisma/config'
import { databaseUrl, readConfig } from './src/config.ts'

const envPath = fileURLToPath(new URL('../.env', import.meta.url))
if (existsSync(envPath)) loadEnvFile(envPath)

export default defineConfig({
  schema: 'prisma/schema',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env.DB_HOST ? databaseUrl(readConfig().database) : undefined,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
})