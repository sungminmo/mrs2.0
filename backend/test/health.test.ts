import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'
import { createApp } from '../src/app.js'
import { hashPassword } from '../src/auth.js'
import { AppError, ErrorCode } from '../src/http.js'
import { databaseUrl, readConfig, readDatabaseConfig } from '../src/config.js'
import { createDatabase, databaseOptions } from '../src/database.js'

const environment = {
  DB_HOST: 'db', DB_NAME: 'b2b_mall', DB_USER: 'b2b_app', DB_PASSWORD: 'test-only', JWT_SECRET: 'test-only-secret-at-least-32-characters',
}

test('liveness does not depend on the database', async () => {
  const app = createApp({
    checkDatabase: async () => { throw new Error('Must not be called') },
    readinessTimeoutMs: 50,
  })
  const response = await app.request('/api/health/live')
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { success: true, data: { status: 'ok' } })
})

test('readiness checks the database and is not cached', async () => {
  let checks = 0
  const app = createApp({ checkDatabase: async () => { checks += 1 }, readinessTimeoutMs: 50 })
  const response = await app.request('/api/health/ready')
  assert.equal(response.status, 200)
  assert.equal(checks, 1)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual(await response.json(), { success: true, data: { status: 'ok', database: 'up' } })
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
  assert.deepEqual(await response.json(), {
    success: false,
    error: { code: 'SERVICE_UNAVAILABLE', message: 'Database is unavailable' },
  })
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
  assert.deepEqual(await response.json(), {
    success: false,
    error: { code: 'NOT_FOUND', message: 'Not found' },
  })
})

test('JWT login issues tokens only for approved users and protects account APIs', async () => {
  const passwordHash = await hashPassword('correct-password')
  const activeUser = { id: 'user-active', email: 'active@example.com', passwordHash, companyName: 'MRS 건설', managerName: '홍길동', role: 'CUSTOMER' as const, status: 'ACTIVE' as const }
  const pendingUser = { ...activeUser, id: 'user-pending', email: 'pending@example.com', status: 'PENDING' as const }
  const users = [activeUser, pendingUser]
  const app = createApp({
    checkDatabase: async () => {},
    readinessTimeoutMs: 50,
    auth: {
      repository: {
        findByEmail: async (email) => users.find((user) => user.email === email) ?? null,
        findById: async (id) => users.find((user) => user.id === id) ?? null,
      },
      secret: environment.JWT_SECRET,
      expiresIn: '1h',
    },
  })

  const loginResponse = await app.request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: activeUser.email, password: 'correct-password' }), headers: { 'Content-Type': 'application/json' } })
  assert.equal(loginResponse.status, 200)
  const loginBody = await loginResponse.json() as { success: boolean; data: { accessToken: string; tokenType: string; user: { email: string; id: string } } }
  assert.equal(loginBody.success, true)
  assert.equal(loginBody.data.tokenType, 'Bearer')
  assert.equal(loginBody.data.user.email, activeUser.email)
  assert.ok(loginBody.data.accessToken.length > 30)

  const meResponse = await app.request('/api/auth/me', { headers: { Authorization: `Bearer ${loginBody.data.accessToken}` } })
  assert.equal(meResponse.status, 200)
  assert.deepEqual(await meResponse.json(), { success: true, data: { user: { id: activeUser.id, email: activeUser.email, companyName: activeUser.companyName, managerName: activeUser.managerName, role: 'CUSTOMER' } } })

  const pendingResponse = await app.request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: pendingUser.email, password: 'correct-password' }), headers: { 'Content-Type': 'application/json' } })
  assert.equal(pendingResponse.status, 403)
  assert.deepEqual(await pendingResponse.json(), { success: false, error: { code: 'ACCOUNT_PENDING', message: 'Account approval is pending' } })

  const unauthorizedResponse = await app.request('/api/auth/me')
  assert.equal(unauthorizedResponse.status, 401)
  assert.deepEqual(await unauthorizedResponse.json(), { success: false, error: { code: 'UNAUTHORIZED', message: 'Bearer token is required' } })
})

test('global error handler normalizes business, validation, and unexpected errors', async () => {
  const app = createApp({ checkDatabase: async () => {}, readinessTimeoutMs: 50 })
  app.get('/api/test/business-error', () => {
    throw new AppError(409, ErrorCode.CONFLICT, 'Asset code already exists')
  })
  app.get('/api/test/validation-error', () => {
    z.object({ quantity: z.number().positive() }).parse({ quantity: 0 })
    throw new Error('Validation was expected to fail')
  })
  app.get('/api/test/unexpected-error', () => {
    throw new Error('secret diagnostic information')
  })

  const businessResponse = await app.request('/api/test/business-error')
  assert.equal(businessResponse.status, 409)
  assert.deepEqual(await businessResponse.json(), {
    success: false,
    error: { code: 'CONFLICT', message: 'Asset code already exists' },
  })

  const validationResponse = await app.request('/api/test/validation-error')
  assert.equal(validationResponse.status, 400)
  assert.deepEqual(await validationResponse.json(), {
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: [{ path: 'quantity', message: 'Too small: expected number to be >0', code: 'too_small' }],
    },
  })

  const unexpectedResponse = await app.request('/api/test/unexpected-error')
  assert.equal(unexpectedResponse.status, 500)
  assert.deepEqual(await unexpectedResponse.json(), {
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  })
})

test('configuration requires connection values without exposing their contents', () => {
  for (const name of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
    assert.throws(() => readConfig({ ...environment, [name]: '' }), new RegExp(`${name} is required`))
  }
  assert.equal(readDatabaseConfig({ ...environment, JWT_SECRET: '' }).name, 'b2b_mall')
  assert.equal(readConfig(environment).database.port, 3306)
  assert.equal(readConfig(environment).database.poolMax, 5)
  assert.throws(() => readConfig({ ...environment, JWT_SECRET: 'too-short' }), /JWT_SECRET must be at least 32 characters/)
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
  assert.equal(options.socketTimeout, 2000)
  assert.equal('queryTimeout' in options, false)
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

test('Prisma CLI URL supports an RDS endpoint and hyphenated database name', () => {
  const endpoint = 'ls-4d8314fe62c21831055666ba9a240b70849af398.c54u0ugkgzq5.ap-northeast-2.rds.amazonaws.com'
  const url = new URL(databaseUrl(readConfig({
    ...environment,
    DB_HOST: endpoint,
    DB_PORT: '3306',
    DB_NAME: 'mrs-db',
    DB_USER: 'dbmasteruser',
  }).database))
  assert.equal(url.hostname, endpoint)
  assert.equal(url.port, '3306')
  assert.equal(url.pathname, '/mrs-db')
  assert.equal(url.username, 'dbmasteruser')
})