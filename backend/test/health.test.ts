import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from '../src/app.js'
import { databaseUrl, readConfig } from '../src/config.js'
import { createDatabase, databaseOptions } from '../src/database.js'

const environment = {
  DB_HOST: 'db', DB_NAME: 'b2b_mall', DB_USER: 'b2b_app', DB_PASSWORD: 'test-only',
}

test('liveness does not depend on the database', async () => {
  const app = createApp({
    checkDatabase: async () => { throw new Error('Must not be called') },
    readinessTimeoutMs: 50,
  })
  const response = await app.request('/api/health/live')
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ok' })
})

test('readiness checks the database and is not cached', async () => {
  let checks = 0
  const app = createApp({ checkDatabase: async () => { checks += 1 }, readinessTimeoutMs: 50 })
  const response = await app.request('/api/health/ready')
  assert.equal(response.status, 200)
  assert.equal(checks, 1)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual(await response.json(), { status: 'ok', database: 'up' })
})

test('database errors are redacted and recovery does not require an app restart', async () => {
  let unavailable = true
  const app = createApp({
    checkDatabase: async () => { if (unavailable) throw new Error('secret connection details') },
    readinessTimeoutMs: 50,
  })
  const response = await app.request('/api/health/ready')
  assert.equal(response.status, 503)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual(await response.json(), { status: 'unavailable', database: 'down' })
  unavailable = false
  assert.equal((await app.request('/api/health/ready')).status, 200)
})

test('a stalled database probe times out', async () => {
  const app = createApp({ checkDatabase: () => new Promise(() => {}), readinessTimeoutMs: 10 })
  assert.equal((await app.request('/api/health/ready')).status, 503)
})

test('unknown API routes return JSON 404', async () => {
  const app = createApp({ checkDatabase: async () => {}, readinessTimeoutMs: 50 })
  const response = await app.request('/api/unknown')
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { error: 'Not found' })
})

test('configuration requires connection values without exposing their contents', () => {
  for (const name of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
    assert.throws(() => readConfig({ ...environment, [name]: '' }), new RegExp(`${name} is required`))
  }
  assert.equal(readConfig(environment).database.port, 3306)
  assert.equal(readConfig(environment).database.poolMax, 5)
})

test('configuration rejects invalid numeric values', () => {
  for (const name of ['PORT', 'DB_PORT', 'DB_POOL_MAX', 'DB_TIMEOUT_MS']) {
    for (const value of ['0', '-1', '1.5', '', 'not-a-number', '999999']) {
      assert.throws(() => readConfig({ ...environment, [name]: value }), new RegExp(name))
    }
  }
})

test('database module loads in ESM and creates a lazy bounded pool', async () => {
  const config = readConfig(environment).database
  const options = databaseOptions(config)
  assert.equal(options.connectionLimit, 5)
  assert.equal(options.minimumIdle, 0)
  assert.equal(options.acquireTimeout, 2000)
  assert.equal(options.queryTimeout, 2000)
  const database = createDatabase(config)
  assert.equal(typeof database.client.$queryRaw, 'function')
  await database.close()
})

test('Prisma CLI URL escapes special characters in credentials', () => {
  const password = 'p@ss:/?#% word'
  const url = new URL(databaseUrl(readConfig({ ...environment, DB_PASSWORD: password }).database))
  assert.equal(decodeURIComponent(url.password), password)
  assert.equal(url.hostname, 'db')
  assert.equal(url.pathname, '/b2b_mall')
})