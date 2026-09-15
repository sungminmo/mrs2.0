export function readConfig(environment: NodeJS.ProcessEnv = process.env) {
  function required(name: string) {
    const value = environment[name]
    if (!value?.trim()) throw new Error(`${name} is required`)
    return value
  }

  function integer(name: string, fallback: number, maximum: number) {
    const raw = environment[name] ?? String(fallback)
    const value = Number(raw)
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > maximum) {
      throw new Error(`${name} must be an integer between 1 and ${maximum}`)
    }
    return value
  }

  return {
    port: integer('PORT', 3000, 65535),
    database: {
      host: required('DB_HOST'),
      port: integer('DB_PORT', 3306, 65535),
      name: required('DB_NAME'),
      user: required('DB_USER'),
      password: required('DB_PASSWORD'),
      poolMax: integer('DB_POOL_MAX', 5, 100),
      timeoutMs: integer('DB_TIMEOUT_MS', 2000, 10000),
    },
    readinessTimeoutMs: 5000,
  }
}

export type Config = ReturnType<typeof readConfig>