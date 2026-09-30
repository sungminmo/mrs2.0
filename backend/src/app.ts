import { OpenAPIHono, z } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { assetDetail, assetDetailRoute, assetSummary, assetSummaryRoute, assetListRoute, listAssets, type AssetRepository } from './asset.js'
import { approveMember, authRoutes, currentUser, listMembers, register, registrationSchema, requireAdmin, requireAuth, updateMember, type AuthRepository } from './auth.js'
import { businessNumberSchema, customerFieldsSchema, customerHandlers, decisionSchema, memberDecisionSchema, type CustomerRepository } from './customer.js'
import { getConnInfo } from '@hono/node-server/conninfo'
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
  customers?: CustomerRepository
}

export function createApp({ checkDatabase, readinessTimeoutMs, auth, assets, banners, adminData, customers }: Dependencies) {
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
    if (customers) {
      const customer = customerHandlers(customers)
      const throttle = async (context: Parameters<typeof customer.lookup>[0], next: () => Promise<void>) => {
        let address = 'local'
        try { address = getConnInfo(context).remote.address ?? 'local' } catch { address = 'local' }
        await customers.throttle('public-ip', address, 120)
        context.header('Cache-Control', 'no-store')
        await next()
      }
      app.use('/api/customers/lookup', throttle)
      app.use('/api/auth/register', throttle)
      app.post('/api/customers/lookup', customer.lookup)
      app.use('/api/admin/customers/*', requireAuth(auth.repository, auth.secret), requireAdmin)
      app.use('/api/admin/customer-applications/*', requireAuth(auth.repository, auth.secret), requireAdmin)
      app.get('/api/admin/customers', requireAuth(auth.repository, auth.secret), requireAdmin, customer.list)
      app.post('/api/admin/customers', requireAuth(auth.repository, auth.secret), requireAdmin, customer.create)
      app.get('/api/admin/customers/:id', customer.detail)
      app.patch('/api/admin/customers/:id', customer.update)
      app.post('/api/admin/customers/:id/suspend', customer.status('SUSPENDED'))
      app.post('/api/admin/customers/:id/reactivate', customer.status('ACTIVE'))
      app.get('/api/admin/customer-applications', requireAuth(auth.repository, auth.secret), requireAdmin, customer.applications)
      app.post('/api/admin/customer-applications/:id/review', customer.review)
      const body = (schema: z.ZodType) => ({ required: true, content: { 'application/json': { schema } } })
      const responses = { 200: { description: '처리 성공' }, 400: { description: '입력 검증 오류' }, 401: { description: '인증 필요 또는 세션 폐기' }, 403: { description: 'MRS 관리자 권한 필요' }, 409: { description: '중복 또는 상태/버전 충돌' }, 429: { description: '요청 제한' } }
      app.openAPIRegistry.registerPath({ method: 'post', path: '/api/customers/lookup', tags: ['Customers'], summary: '활성 고객사 사업자번호 정확 일치 검색 (id/name만 반환)', request: { body: body(z.object({ businessNumber: businessNumberSchema })) }, responses })
      app.openAPIRegistry.registerPath({ method: 'post', path: '/api/auth/register', tags: ['Auth'], summary: '기존 고객사 소속 신청 또는 신규 고객사 동시 신청', request: { body: body(registrationSchema) }, responses: { ...responses, 201: { description: '승인 대기 회원 생성' } } })
      for (const [method, path, summary, schema] of [
        ['get', '/api/admin/customers', '고객사 목록', null],
        ['post', '/api/admin/customers', '확인된 고객사 등록', customerFieldsSchema.extend({ reason: decisionSchema.shape.reason })],
        ['get', '/api/admin/customers/{id}', '고객사 상세 및 감사 이력', null],
        ['patch', '/api/admin/customers/{id}', '고객사 정보 수정', customerFieldsSchema.extend(decisionSchema.shape)],
        ['post', '/api/admin/customers/{id}/suspend', '고객사 전체 접근 정지', decisionSchema],
        ['post', '/api/admin/customers/{id}/reactivate', '고객사 확인/복구', decisionSchema],
        ['get', '/api/admin/customer-applications', '고객사 신청 목록', null],
        ['post', '/api/admin/customer-applications/{id}/review', '고객사 신청 심사 (회원 승인은 별도)', decisionSchema.extend({ action: z.enum(['approve', 'reject', 'reopen']), customerId: z.string().max(20).optional(), fields: customerFieldsSchema.optional() })],
        ['post', '/api/admin/members/{id}/actions', '회원 승인·정지·권한·소속 재심사', memberDecisionSchema],
      ] as const) app.openAPIRegistry.registerPath({ method, path, summary, tags: ['Customers'], security: [{ BearerAuth: [] }], request: { ...(path.includes('{id}') ? { params: z.object({ id: z.string().min(1).max(36) }) } : {}), ...(schema ? { body: body(schema) } : {}) }, responses: { ...responses, ...(method === 'post' && path === '/api/admin/customers' ? { 201: { description: '고객사 생성' } } : {}) } })
    }
    app.post('/api/auth/login', authRoutes(auth.repository, auth.secret, auth.expiresIn))
    app.post('/api/auth/register', register(auth.repository))
    app.get('/api/auth/me', requireAuth(auth.repository, auth.secret), currentUser)
    app.get('/api/admin/members', requireAuth(auth.repository, auth.secret), requireAdmin, listMembers(auth.repository))
    app.post('/api/admin/members/:id/approve', requireAuth(auth.repository, auth.secret), requireAdmin, approveMember(auth.repository))
    app.post('/api/admin/members/:id/actions', requireAuth(auth.repository, auth.secret), requireAdmin, updateMember(auth.repository))
    if (adminData) {
      app.get('/api/admin/data', requireAuth(auth.repository, auth.secret), requireAdmin, loadAdminData(adminData))
      app.post('/api/admin/items', requireAuth(auth.repository, auth.secret), requireAdmin, createAdminItems(adminData))
      app.put('/api/admin/categories/:id', requireAuth(auth.repository, auth.secret), requireAdmin, saveAdminCategory(adminData))
    }
    if (assets) {
      app.use('/api/assets', requireAuth(auth.repository, auth.secret))
      app.use('/api/assets/*', requireAuth(auth.repository, auth.secret))
      app.openapi(assetSummaryRoute, assetSummary(assets))
      app.openapi(assetDetailRoute, assetDetail(assets))
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