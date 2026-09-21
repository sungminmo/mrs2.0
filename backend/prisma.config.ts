import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'prisma/config'
import { databaseUrl, readDatabaseConfig } from './src/config.ts'

const envPath = fileURLToPath(new URL('../.env', import.meta.url))
if (existsSync(envPath)) loadEnvFile(envPath)
const databaseConfigured = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'].every((name) => process.env[name]?.trim())

export default defineConfig({
  schema: 'prisma/schema',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: databaseConfigured ? databaseUrl(readDatabaseConfig()) : undefined,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
})