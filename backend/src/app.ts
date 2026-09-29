import { OpenAPIHono } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { assetListRoute, listAssets, type AssetRepository } from './asset.js'
import { approveMember, authRoutes, currentUser, listMembers, register, requireAdmin, requireAuth, type AuthRepository } from './auth.js'
import { listAdminBanners, listPublicBanners, saveBanner, type BannerRepository } from './banner.js'
import { ErrorCode, failure, handleError, success } from './http.js'
import { createAdminItems, loadAdminData, saveAdminCategory, type AdminDataRepository } from './admin-data.js'

type Dependencies = {
  checkDatabase: () => Promise<void>
  readinessTimeoutMs: number
  auth?: { repository: AuthRepository; secret: string; expiresIn: string }
  assets?: AssetRepository
  banners?: BannerRepository
  adminData?: AdminDataRepository
}

export function createApp({ checkDatabase, readinessTimeoutMs, auth, assets, banners, adminData }: Dependencies) {
  const app = new OpenAPIHono({
    defaultHook: (result, context) => {
      if (result.success) return
      return failure(context, 400, ErrorCode.VALIDATION_ERROR, 'Request validation failed', result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      })))
    },
  })

  app.onError(handleError)

  app.openAPIRegistry.registerComponent('securitySchemes', 'BearerAuth', { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })

  if (auth) {
    app.post('/api/auth/login', authRoutes(auth.repository, auth.secret, auth.expiresIn))
    app.post('/api/auth/register', register(auth.repository))
    app.get('/api/auth/me', requireAuth(auth.repository, auth.secret), currentUser)
    app.get('/api/admin/members', requireAuth(auth.repository, auth.secret), requireAdmin, listMembers(auth.repository))
    app.post('/api/admin/members/:id/approve', requireAuth(auth.repository, auth.secret), requireAdmin, approveMember(auth.repository))
    if (adminData) {
      app.get('/api/admin/data', requireAuth(auth.repository, auth.secret), requireAdmin, loadAdminData(adminData))
      app.post('/api/admin/items', requireAuth(auth.repository, auth.secret), requireAdmin, createAdminItems(adminData))
      app.put('/api/admin/categories/:id', requireAuth(auth.repository, auth.secret), requireAdmin, saveAdminCategory(adminData))
    }
    if (assets) {
      app.use('/api/assets', requireAuth(auth.repository, auth.secret))
      app.openapi(assetListRoute, listAssets(assets))
    }
    if (banners) {
      app.get('/api/admin/banners', requireAuth(auth.repository, auth.secret), requireAdmin, listAdminBanners(banners))
      app.put('/api/admin/banners/:id', requireAuth(auth.repository, auth.secret), requireAdmin, saveBanner(banners))
    }
  }

  if (banners) app.get('/api/banners', listPublicBanners(banners))

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

  app.doc31('/api/openapi.json', (context) => ({
    openapi: '3.1.0',
    info: { title: 'MRS Customer API', version: '1.0.0' },
    servers: [{ url: new URL(context.req.url).origin, description: 'Current environment' }],
  }))
  app.get('/api/docs', Scalar({ url: '/api/openapi.json', pageTitle: 'MRS API Reference' }))

  app.notFound((context) => failure(context, 404, ErrorCode.NOT_FOUND, 'Not found'))

  return app
}