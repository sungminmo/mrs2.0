import { Hono } from 'hono'

type Dependencies = {
  checkDatabase: () => Promise<void>
  readinessTimeoutMs: number
}

export function createApp({ checkDatabase, readinessTimeoutMs }: Dependencies) {
  const app = new Hono()

  app.get('/api/health/live', (context) => context.json({ status: 'ok' }))

  app.get('/api/health/ready', async (context) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        Promise.resolve().then(checkDatabase),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Readiness timeout')), readinessTimeoutMs)
        }),
      ])
      context.header('Cache-Control', 'no-store')
      return context.json({ status: 'ok', database: 'up' })
    } catch {
      context.header('Cache-Control', 'no-store')
      return context.json({ status: 'unavailable', database: 'down' }, 503)
    } finally {
      clearTimeout(timer)
    }
  })

  app.notFound((context) => context.json({ error: 'Not found' }, 404))
  app.onError((_error, context) => context.json({ error: 'Internal server error' }, 500))

  return app
}