function required(environment: NodeJS.ProcessEnv, name: string) {
  const value = environment[name]
  if (!value?.trim()) throw new Error(`${name} is required`)
  return value
}

function integer(environment: NodeJS.ProcessEnv, name: string, fallback: number, maximum: number) {
  const raw = environment[name] ?? String(fallback)
  const value = Number(raw)
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`)
  }
  return value
}

export function readDatabaseConfig(environment: NodeJS.ProcessEnv = process.env) {
  return {
    host: required(environment, 'DB_HOST'),
    port: integer(environment, 'DB_PORT', 3306, 65535),
    name: required(environment, 'DB_NAME'),
    user: required(environment, 'DB_USER'),
    password: required(environment, 'DB_PASSWORD'),
    poolMax: integer(environment, 'DB_POOL_MAX', 5, 100),
    timeoutMs: integer(environment, 'DB_TIMEOUT_MS', 2000, 10000),
  }
}

export function readConfig(environment: NodeJS.ProcessEnv = process.env) {
  const jwtSecret = required(environment, 'JWT_SECRET')
  if (jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters')

  return {
    port: integer(environment, 'PORT', 3000, 65535),
    jwt: {
      secret: jwtSecret,
      expiresIn: environment.JWT_EXPIRES_IN?.trim() || '1h',
    },
    database: readDatabaseConfig(environment),
    readinessTimeoutMs: 5000,
  }
}

export type Config = ReturnType<typeof readConfig>

export function databaseUrl(config: Config['database']) {
  const url = new URL('mysql://localhost')
  url.hostname = config.host
  url.port = String(config.port)
  url.username = encodeURIComponent(config.user)
  url.password = encodeURIComponent(config.password)
  url.pathname = `/${encodeURIComponent(config.name)}`
  return url.toString()
}