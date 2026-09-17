import { Hono } from 'hono'
import { ErrorCode, failure, handleError, success } from './http.js'

type Dependencies = {
  checkDatabase: () => Promise<void>
  readinessTimeoutMs: number
}

export function createApp({ checkDatabase, readinessTimeoutMs }: Dependencies) {
  const app = new Hono()

  app.onError(handleError)

  app.get('/api/health/live', (context) => success(context, { status: 'ok' }))

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
      return success(context, { status: 'ok', database: 'up' })
    } catch {
      context.header('Cache-Control', 'no-store')
      return failure(context, 503, ErrorCode.SERVICE_UNAVAILABLE, 'Database is unavailable')
    } finally {
      clearTimeout(timer)
    }
  })

  app.notFound((context) => failure(context, 404, ErrorCode.NOT_FOUND, 'Not found'))

  return app
}