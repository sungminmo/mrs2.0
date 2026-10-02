import { OpenAPIHono, z } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { assetDetail, assetDetailRoute, assetSummary, assetSummaryRoute, assetListRoute, listAssets, type AssetRepository } from './asset.js'
import { adminLogin, adminLoginSchema, approveMember, currentUser, customerLogin, listMembers, register, registrationSchema, requireAdmin, requireAuth, updateMember, type AuthRepository } from './auth.js'
import { businessNumberSchema, customerFieldsSchema, customerHandlers, decisionSchema, memberDecisionSchema, type CustomerRepository } from './customer.js'
import { getConnInfo } from '@hono/node-server/conninfo'
import { listAdminBanners, listPublicBanners, saveBanner, type BannerRepository } from './banner.js'
import { ErrorCode, failure, handleError, success } from './http.js'
import { createAdminItems, updateAdminItem, itemUpdateInput, loadAdminData, saveAdminCategory, type AdminDataRepository } from './admin-data.js'
import { adminAccountCreate, adminAccountUpdate, adminAccountHandlers, requireSystemAdmin, type AdminAccountRepository } from './admin-accounts.js'
import { bodyLimit } from 'hono/body-limit'
import type { Context } from 'hono'
import { uploadAdminImage, saveAdminImages, replaceImagesSchema, type ImageStorage, type AdminImageRepository } from './admin-images.js'
import { receivingDecision, receivingHandlers, receivingInput, receivingQuery, type ReceivingRepository } from './receiving.js'

type Dependencies = {
  checkDatabase: () => Promise<void>
  readinessTimeoutMs: number
  auth?: { repository: AuthRepository; secret: string; expiresIn: string }
  assets?: AssetRepository
  banners?: BannerRepository
  adminData?: AdminDataRepository
  customers?: CustomerRepository
  adminAccounts?: AdminAccountRepository
  imageStorage?: ImageStorage
  adminImages?: AdminImageRepository
  receivings?: ReceivingRepository
}

export function createApp({ checkDatabase, readinessTimeoutMs, auth, assets, banners, adminData, customers, adminAccounts, imageStorage, adminImages, receivings }: Dependencies) {
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
    const customerAuth = requireAuth(auth.repository, auth.secret, 'CUSTOMER')
    const adminAuth = requireAuth(auth.repository, auth.secret, 'ADMIN')
    if (receivings) {
      const receiving = receivingHandlers(receivings, imageStorage)
      app.post('/api/admin/receivings/:id/review', adminAuth, requireAdmin, receiving.review)
      app.openAPIRegistry.registerPath({ method: 'post', path: '/api/admin/receivings/{id}/review', tags: ['Receivings'], summary: '신청 대기 건 승인·반려 및 처리 사유 기록', security: [{ BearerAuth: [] }], request: { params: z.object({ id: z.string().min(1).max(20) }), body: { required: true, content: { 'application/json': { schema: receivingDecision } } } }, responses: { 200: { description: '저장된 신청과 변경 이력 반환' }, 400: { description: '잘못된 처리 또는 빈 사유' }, 401: { description: '관리자 인증 필요' }, 403: { description: '관리자 권한 필요' }, 404: { description: '신청 없음' }, 409: { description: '이미 처리됨 또는 동시 처리 충돌' } } })
      app.get('/api/customer/receivings/terms', customerAuth, receiving.terms)
      app.get('/api/customer/receivings', customerAuth, receiving.list)
      app.get('/api/customer/receivings/:id', customerAuth, receiving.detail)
      app.post('/api/customer/receivings', customerAuth, bodyLimit({ maxSize: 26 * 1024 * 1024, onError: (context) => failure(context, 413, ErrorCode.VALIDATION_ERROR, '사진은 각 5MB, 최대 5장까지 등록할 수 있습니다.') }), async (context: Context, next) => { if (customers) { const user = context.get('authUser') as { id: string; customerId: string }; await customers.throttle('receiving-user', user.id, 30); await customers.throttle('receiving-company', user.customerId, 100) } await next() }, receiving.create)
      const responses = { 200: { description: '고객사 소유 신청 조회' }, 400: { description: '입력 검증 오류' }, 401: { description: '승인된 고객 인증 필요' }, 403: { description: '고객사 접근 불가' }, 404: { description: '신청 없음 또는 타 고객사 신청' }, 413: { description: '요청 크기 초과' }, 429: { description: '신청 요청 제한' }, 503: { description: '사진 저장 실패' } }
      app.openAPIRegistry.registerPath({ method: 'post', path: '/api/customer/receivings', tags: ['Receivings'], summary: '고객 입고 신청 (VIEWER 포함, 선택 사진 0~5장)', security: [{ BearerAuth: [] }], request: { body: { required: true, content: { 'multipart/form-data': { schema: receivingInput.extend({ photos: z.array(z.string().openapi({ type: 'string', format: 'binary' })).max(5).optional() }) } } } }, responses: { ...responses, 201: { description: 'DB 저장 완료, data.receiving 반환' } } })
      app.openAPIRegistry.registerPath({ method: 'get', path: '/api/customer/receivings', tags: ['Receivings'], summary: '소속 고객사 입고 신청 목록', security: [{ BearerAuth: [] }], request: { query: receivingQuery }, responses })
      app.openAPIRegistry.registerPath({ method: 'get', path: '/api/customer/receivings/terms', tags: ['Receivings'], summary: '현재 입고 폐기 규정 버전과 원문', security: [{ BearerAuth: [] }], responses })
      app.openAPIRegistry.registerPath({ method: 'get', path: '/api/customer/receivings/{id}', tags: ['Receivings'], summary: '소속 고객사 입고 신청 상세 및 사진', security: [{ BearerAuth: [] }], request: { params: z.object({ id: z.string().max(20) }) }, responses })
    }
    if (imageStorage) {
      app.post('/api/admin/images/:kind', adminAuth, requireAdmin, bodyLimit({ maxSize: 6 * 1024 * 1024, onError: (context) => failure(context, 413, ErrorCode.VALIDATION_ERROR, '이미지 파일은 5MB 이하로 업로드해 주세요.') }), async (context: Context, next) => { if (customers) await customers.throttle('image-upload', (context.get('authUser') as { id: string }).id, 100); await next() }, uploadAdminImage(imageStorage))
      app.openAPIRegistry.registerPath({ method: 'post', path: '/api/admin/images/{kind}', summary: '관리자 이미지 파일 S3 업로드', tags: ['Images'], security: [{ BearerAuth: [] }], request: { params: z.object({ kind: z.enum(['items', 'assets', 'banners']) }), body: { required: true, content: { 'multipart/form-data': { schema: z.object({ file: z.string().openapi({ type: 'string', format: 'binary' }) }) } } } }, responses: { 201: { description: 'S3 이미지 id/name/url' }, 400: { description: '잘못된 이미지' }, 401: { description: '관리자 인증 필요' }, 413: { description: '크기 초과' }, 429: { description: '업로드 요청 제한' }, 503: { description: 'S3 저장 실패' } } })
    }
    if (adminImages) for (const kind of ['items', 'assets'] as const) {
      app.put(`/api/admin/${kind}/:id/images`, adminAuth, requireAdmin, saveAdminImages(adminImages, kind))
      app.openAPIRegistry.registerPath({ method: 'put', path: `/api/admin/${kind}/{id}/images`, summary: '이미지 URL DB 저장 (변경 사유·현재 이미지 비교)', tags: ['Images'], security: [{ BearerAuth: [] }], request: { params: z.object({ id: z.string() }), body: { required: true, content: { 'application/json': { schema: replaceImagesSchema } } } }, responses: { 200: { description: '저장된 이미지 목록' }, 400: { description: '이미지 개수·주소·사유 오류' }, 401: { description: '관리자 인증 필요' }, 404: { description: '대상 없음' }, 409: { description: '동시 변경 충돌' } } })
    }
    if (adminAccounts) {
      const accounts = adminAccountHandlers(adminAccounts)
      app.get('/api/admin/accounts', adminAuth, requireSystemAdmin, accounts.list)
      app.post('/api/admin/accounts', adminAuth, requireSystemAdmin, accounts.create)
      app.patch('/api/admin/accounts/:id', adminAuth, requireSystemAdmin, accounts.update)
      const responses = { 200: { description: '처리 성공 (비밀번호·해시 미포함)' }, 400: { description: '입력 검증 오류' }, 401: { description: '인증 필요 또는 세션 폐기' }, 403: { description: '시스템 관리자 권한 필요' }, 404: { description: '관리자 계정 없음' }, 409: { description: '아이디 중복, 버전 충돌 또는 마지막 시스템 관리자 보호' } }
      for (const [method, path, summary, schema] of [
        ['get', '/api/admin/accounts', '관리자 계정 목록', null],
        ['post', '/api/admin/accounts', '관리자 직접 생성 (고객 계정 전환 불가)', adminAccountCreate],
        ['patch', '/api/admin/accounts/{id}', '관리자 정보·권한·상태·비밀번호 변경 및 세션 폐기', adminAccountUpdate],
      ] as const) app.openAPIRegistry.registerPath({ method, path, summary, tags: ['Administrator accounts'], security: [{ BearerAuth: [] }], request: { ...(method === 'patch' ? { params: z.object({ id: z.string().uuid() }) } : {}), ...(schema ? { body: { required: true, content: { 'application/json': { schema } } } } : {}) }, responses: method === 'post' ? { ...responses, 201: { description: '관리자 계정 생성' } } : responses })
    }
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
      app.use('/api/admin/customers/*', adminAuth, requireAdmin)
      app.use('/api/admin/customer-applications/*', adminAuth, requireAdmin)
      app.get('/api/admin/customers', adminAuth, requireAdmin, customer.list)
      app.post('/api/admin/customers', adminAuth, requireAdmin, customer.create)
      app.get('/api/admin/customers/:id', customer.detail)
      app.patch('/api/admin/customers/:id', customer.update)
      app.post('/api/admin/customers/:id/suspend', customer.status('SUSPENDED'))
      app.post('/api/admin/customers/:id/reactivate', customer.status('ACTIVE'))
      app.get('/api/admin/customer-applications', adminAuth, requireAdmin, customer.applications)
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
    app.post('/api/auth/login', customerLogin(auth.repository, auth.secret, auth.expiresIn))
    app.post('/api/admin/auth/login', adminLogin(auth.repository, auth.secret, auth.expiresIn))
    app.get('/api/admin/auth/me', adminAuth, requireAdmin, currentUser)
    app.openAPIRegistry.registerPath({ method: 'post', path: '/api/admin/auth/login', tags: ['Admin Auth'], summary: '직접 생성된 MRS 관리자 계정 로그인', request: { body: { required: true, content: { 'application/json': { schema: adminLoginSchema } } } }, responses: { 200: { description: '관리자 전용 audience 토큰 발급' }, 400: { description: '잘못된 요청' }, 401: { description: '계정 또는 비밀번호 불일치 (고객 계정 포함)' }, 403: { description: '비활성 계정' } } })
    app.openAPIRegistry.registerPath({ method: 'get', path: '/api/admin/auth/me', tags: ['Admin Auth'], summary: '관리자 전용 세션과 현재 DB 역할 확인', security: [{ BearerAuth: [] }], responses: { 200: { description: '확인된 관리자 프로필' }, 401: { description: '관리자 인증 필요' } } })
    app.post('/api/auth/register', register(auth.repository))
    app.get('/api/auth/me', customerAuth, currentUser)
    app.get('/api/admin/members', adminAuth, requireAdmin, listMembers(auth.repository))
    app.post('/api/admin/members/:id/approve', adminAuth, requireAdmin, approveMember(auth.repository))
    app.post('/api/admin/members/:id/actions', adminAuth, requireAdmin, updateMember(auth.repository))
    if (adminData) {
      app.get('/api/admin/data', adminAuth, requireAdmin, loadAdminData(adminData))
      app.post('/api/admin/items', adminAuth, requireAdmin, createAdminItems(adminData))
      app.put('/api/admin/items/:id', adminAuth, requireAdmin, updateAdminItem(adminData))
      app.openAPIRegistry.registerPath({ method: 'put', path: '/api/admin/items/{id}', summary: '기존 품목 정보와 이미지 수정', tags: ['Admin items'], security: [{ BearerAuth: [] }], request: { params: z.object({ id: z.string().regex(/^\d{6}$/) }), body: { required: true, content: { 'application/json': { schema: itemUpdateInput } } } }, responses: { 200: { description: 'DB에 저장된 data.item 반환' }, 400: { description: '입력 또는 카테고리·이미지 오류' }, 401: { description: '관리자 인증 필요' }, 404: { description: '품목 없음' }, 409: { description: '중복 코드, 연결 자산 단위 변경 또는 동시 변경 충돌' } } })
      app.put('/api/admin/categories/:id', adminAuth, requireAdmin, saveAdminCategory(adminData))
    }
    if (assets) {
      app.use('/api/assets', customerAuth)
      app.use('/api/assets/*', customerAuth)
      app.openapi(assetSummaryRoute, assetSummary(assets))
      app.openapi(assetDetailRoute, assetDetail(assets))
      app.openapi(assetListRoute, listAssets(assets))
    }
    if (banners) {
      app.get('/api/admin/banners', adminAuth, requireAdmin, listAdminBanners(banners))
      app.put('/api/admin/banners/:id', adminAuth, requireAdmin, saveBanner(banners))
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