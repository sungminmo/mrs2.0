import { Hono } from 'hono'
import { authRoutes, currentUser, requireAuth, type AuthRepository } from './auth.js'
import { ErrorCode, failure, handleError, success } from './http.js'

type Dependencies = {
  checkDatabase: () => Promise<void>
  readinessTimeoutMs: number
  auth?: { repository: AuthRepository; secret: string; expiresIn: string }
}

export function createApp({ checkDatabase, readinessTimeoutMs, auth }: Dependencies) {
  const app = new Hono()

  app.onError(handleError)

  if (auth) {
    app.post('/api/auth/login', authRoutes(auth.repository, auth.secret, auth.expiresIn))
    app.get('/api/auth/me', requireAuth(auth.repository, auth.secret), currentUser)
  }

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