import { OpenAPIHono, z } from '@hono/zod-openapi'
import { registerApiDocs } from './api-docs.js'
import { assetDetail, assetDetailRoute, assetSummary, assetSummaryRoute, assetListRoute, listAssets, requestAssetSale, saleRequestRoute, type AssetRepository } from './asset.js'
import { adminLogin, adminLoginSchema, loginSchema, approveMember, currentUser, customerLogin, listMembers, register, registrationSchema, requireAdmin, requireAuth, updateMember, updateOwnProfile, memberProfileSchema, type AuthRepository } from './auth.js'
import { businessNumberSchema, customerFieldsSchema, customerHandlers, decisionSchema, memberDecisionSchema, type CustomerRepository } from './customer.js'
import { getConnInfo } from '@hono/node-server/conninfo'
import { listAdminBanners, listPublicBanners, saveBanner, placementId, placementInput, type BannerRepository } from './banner.js'
import { ErrorCode, failure, handleError, success } from './http.js'
import { approveAdminSale, saleApprovalInput, completeAdminSaleInspection, saleInspectionCompleteInput, createAdminItems, updateAdminItem, updateAdminAsset, assetUpdateInput, itemUpdateInput, itemInput, categoryInput, adminDataQuery, loadAdminData, saveAdminCategory, type AdminDataRepository } from './admin-data.js'
import { adminListQuery } from './admin-pagination.js'
import { adminAccountCreate, adminAccountUpdate, adminAccountHandlers, requireSystemAdmin, type AdminAccountRepository } from './admin-accounts.js'
import { bodyLimit } from 'hono/body-limit'
import type { Context } from 'hono'
import { uploadAdminImage, saveAdminImages, replaceImagesSchema, type ImageStorage, type AdminImageRepository } from './admin-images.js'
import { receivingDecision, receivingHandlers, receivingInput, receivingQuery, type ReceivingRepository } from './receiving.js'
import { inspectionHandlers, inspectionWrite, inspectionVersion, receiveInput, inspectionListQuery, type InspectionRepository } from './inspection.js'
import { locationHandlers, locationInput, locationUpdate, locationQuery, type LocationRepository } from './location.js'
import { listMarketProducts, marketQuery, type MarketRepository } from './market.js'
import { cartAdd, cartSync, cartUpdate, cartRemove, cartHandlers, type CartRepository } from './cart.js'
import { quoteHandlers, quoteCreateInput, quotePreviewInput, quoteListQuery, type QuoteRepository } from './quote.js'
import { campaignHandlers, campaignInput, campaignUpdate, campaignProductQuery, type CampaignRepository } from './campaign.js'
import { registerOutbound, type OutboundRepository } from './outbound.js'

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
  inspections?: InspectionRepository
  locations?: LocationRepository
  market?: MarketRepository
  cart?: CartRepository
  quotes?: QuoteRepository
  campaigns?: CampaignRepository
  outbound?: OutboundRepository
}

export function createApp({ checkDatabase, readinessTimeoutMs, auth, assets, banners, adminData, customers, adminAccounts, imageStorage, adminImages, receivings, inspections, locations, market, cart, quotes, campaigns, outbound }: Dependencies) {
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
  if (market) {
    app.get('/api/market/products', listMarketProducts(market))
    app.openAPIRegistry.registerPath({ method: 'get', path: '/api/market/products', tags: ['Market'], summary: '비회원 마켓 상품·분류·실제 기획전 조회 (가격·고객사·신청자 정보 제외)', request: { query: marketQuery }, responses: { 200: { description: '가격 제외 판매 가능 상품·수량·공개 사진·기획전' }, 400: { description: '페이지·검색 입력 오류 또는 비회원 가격 정렬' } } })
  }

  app.openAPIRegistry.registerComponent('securitySchemes', 'BearerAuth', { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })

  if (auth) {
    const customerAuth = requireAuth(auth.repository, auth.secret, 'CUSTOMER')
    app.patch('/api/auth/me', customerAuth, bodyLimit({ maxSize: 8192 }), updateOwnProfile(auth.repository, auth.secret, auth.expiresIn))
    app.openAPIRegistry.registerPath({ method: 'patch', path: '/api/auth/me', tags: ['Auth'], summary: '본인 회원정보 수정 및 세션 갱신 (이메일 변경은 현재 비밀번호 확인)', security: [{ BearerAuth: [] }], request: { body: { required: true, content: { 'application/json': { schema: memberProfileSchema } } } }, responses: { 200: { description: '갱신된 고객 세션·회원정보' }, 400: { description: '입력 또는 현재 비밀번호 오류' }, 401: { description: '고객 인증 필요' }, 403: { description: '활성 계정·고객사 필요' }, 409: { description: '중복 이메일 또는 동시 수정' } } })
    if (quotes) {
      const handlers = quoteHandlers(quotes)
      app.use('/api/customer/quotes/*', bodyLimit({ maxSize: 65536, onError: context => failure(context, 413, ErrorCode.VALIDATION_ERROR, '견적 요청이 너무 큽니다.') }))
      app.post('/api/customer/quotes/preview', customerAuth, handlers.preview)
      app.post('/api/customer/quotes', customerAuth, bodyLimit({ maxSize: 65536 }), handlers.create)
      app.get('/api/customer/quotes', customerAuth, handlers.list)
      app.get('/api/customer/quotes/:id', customerAuth, handlers.detail)
      for (const [method, path, schema] of [['post', '/api/customer/quotes/preview', quotePreviewInput], ['post', '/api/customer/quotes', quoteCreateInput], ['get', '/api/customer/quotes', null], ['get', '/api/customer/quotes/{id}', null]] as const) app.openAPIRegistry.registerPath({ method, path, tags: ['Purchase quotes'], summary: '고객사 공유 구매 견적 요청 (VAT 포함 예상 금액, 재고 예약 없음)', security: [{ BearerAuth: [] }], request: schema ? { body: { required: true, content: { 'application/json': { schema } } } } : path.endsWith('{id}') ? { params: z.object({ id: z.uuid() }) } : { query: quoteListQuery }, responses: { 200: { description: '미리보기·조회·동일 요청 재시도' }, 201: { description: '접수 완료 및 선택 장바구니 항목 삭제' }, 400: { description: '입력 오류' }, 401: { description: '로그인 필요' }, 403: { description: '활성 고객사 필요' }, 404: { description: '요청 없음 또는 타 고객사' }, 409: { description: '가격 변경 재확인 또는 재고·장바구니 충돌' } } })
    }
    if (cart) {
      const handlers = cartHandlers(cart)
      app.use('/api/cart/*', bodyLimit({ maxSize: 32768, onError: context => failure(context, 413, ErrorCode.VALIDATION_ERROR, '장바구니 요청이 너무 큽니다.') }))
      app.get('/api/cart', customerAuth, handlers.list)
      app.post('/api/cart/items', customerAuth, handlers.add)
      app.patch('/api/cart/items/:id', customerAuth, handlers.update)
      app.delete('/api/cart/items/:id', customerAuth, handlers.removeOne)
      app.delete('/api/cart/items', customerAuth, handlers.remove)
      app.post('/api/cart/sync', customerAuth, handlers.sync)
      for (const [method, path] of [['get', '/api/cart'], ['post', '/api/cart/items'], ['patch', '/api/cart/items/{id}'], ['delete', '/api/cart/items/{id}'], ['delete', '/api/cart/items'], ['post', '/api/cart/sync']] as const) app.openAPIRegistry.registerPath({ method, path, tags: ['Cart'], summary: '개인 장바구니 (최신 상품 검증, 재고 예약 없음)', security: [{ BearerAuth: [] }], request: method === 'get' ? undefined : { ...(path.endsWith('{id}') ? { params: z.object({ id: z.uuid() }) } : {}), ...(method === 'delete' && path.endsWith('{id}') ? { query: z.object({ version: z.coerce.number().int().nonnegative() }) } : { body: { required: true, content: { 'application/json': { schema: method === 'patch' ? cartUpdate : path.endsWith('/sync') ? cartSync : method === 'post' ? cartAdd : cartRemove } } } }) }, responses: { 200: { description: '최신 개인 장바구니' }, 400: { description: '입력 오류' }, 401: { description: '인증 필요' }, 403: { description: '활성 고객사 필요' }, 404: { description: '상품 없음' }, 409: { description: '버전 또는 요청 ID 충돌' } } })
    }
    if (market) {
      app.get('/api/customer/market/products', customerAuth, listMarketProducts(market, true))
      app.openAPIRegistry.registerPath({ method: 'get', path: '/api/customer/market/products', tags: ['Market'], summary: '활성 고객 회원 마켓 목록·가격·실제 기획전 조회', security: [{ BearerAuth: [] }], request: { query: marketQuery }, responses: { 200: { description: '가격 포함 상품 목록' }, 400: { description: '검색·페이지 입력 오류' }, 401: { description: '회원 인증 필요' }, 403: { description: '활성 고객사 필요' } } })
    }
    const adminAuth = requireAuth(auth.repository, auth.secret, 'ADMIN')
    if (outbound) registerOutbound(app, outbound, customerAuth, adminAuth)
    if (campaigns) {
      const handlers = campaignHandlers(campaigns)
      app.get('/api/admin/campaign-products', adminAuth, requireAdmin, handlers.products)
      app.post('/api/admin/campaigns', adminAuth, requireAdmin, bodyLimit({ maxSize: 32768 }), handlers.save(false))
      app.put('/api/admin/campaigns/:id', adminAuth, requireAdmin, bodyLimit({ maxSize: 32768 }), handlers.save(true))
      for (const [method, path, schema] of [['get', '/api/admin/campaign-products', null], ['post', '/api/admin/campaigns', campaignInput], ['put', '/api/admin/campaigns/{id}', campaignUpdate]] as const) app.openAPIRegistry.registerPath({ method, path, tags: ['Campaigns'], summary: '기획전 직접 상품 편성 및 순서 저장 (최대 100종)', security: [{ BearerAuth: [] }], request: method === 'get' ? { query: campaignProductQuery } : { ...(method === 'put' ? { params: z.object({ id: z.string().min(1).max(20) }) } : {}), body: { required: true, content: { 'application/json': { schema: schema! } } } }, responses: { 200: { description: '상품 검색·기획전 수정' }, 201: { description: '기획전 등록' }, 400: { description: '입력·편성 오류' }, 401: { description: '관리자 인증 필요' }, 403: { description: '관리자 권한 필요' }, 404: { description: '기획전 없음' }, 409: { description: '동시 수정 충돌' } } })
    }
    if (inspections) {
      const inspection = inspectionHandlers(inspections)
      app.use('/api/admin/inspections/:id/*', bodyLimit({ maxSize: 10 * 1024 * 1024, onError: (context) => failure(context, 413, ErrorCode.VALIDATION_ERROR, '검수 요청은 10MB 이하입니다. 행과 사진을 나눠 주세요.') }))
      app.post('/api/admin/receivings/:id/receive', adminAuth, requireAdmin, inspection.receive)
      app.get('/api/admin/inspections/:id', adminAuth, requireAdmin, inspection.detail)
      app.put('/api/admin/inspections/:id/draft', adminAuth, requireAdmin, inspection.draft)
      app.post('/api/admin/inspections/:id/confirm', adminAuth, requireAdmin, inspection.save(false))
      app.put('/api/admin/inspections/:id/result', adminAuth, requireAdmin, inspection.save(true))
      app.get('/api/customer/inspections', customerAuth, inspection.list)
      app.get('/api/customer/inspections/:id', customerAuth, inspection.customerDetail)
      app.post('/api/customer/inspections/:id/acknowledge', customerAuth, inspection.customerAction(false))
      app.post('/api/customer/inspections/:id/disposal-consent', customerAuth, inspection.customerAction(true))
      for (const [method, path, schema] of [
        ['post', '/api/admin/receivings/{id}/receive', receiveInput],
        ['get', '/api/admin/inspections/{id}', null],
        ['put', '/api/admin/inspections/{id}/draft', inspectionWrite],
        ['post', '/api/admin/inspections/{id}/confirm', inspectionWrite],
        ['put', '/api/admin/inspections/{id}/result', inspectionWrite],
        ['get', '/api/customer/inspections/{id}', null],
        ['post', '/api/customer/inspections/{id}/acknowledge', inspectionVersion],
        ['post', '/api/customer/inspections/{id}/disposal-consent', inspectionVersion.extend({ agreed: z.literal(true) })],
      ] as const) app.openAPIRegistry.registerPath({ method, path, tags: ['First inspections'], summary: path, security: [{ BearerAuth: [] }], request: { params: z.object({ id: z.string().max(20) }), ...(schema ? { body: { required: true, content: { 'application/json': { schema } } } } : {}) }, responses: { 200: { description: '검수 결과 저장·조회' }, 201: { description: '입고 완료·검수 대기 생성' }, 400: { description: '입력·수량·참조 오류' }, 401: { description: '인증 필요' }, 403: { description: '권한 필요' }, 404: { description: '결과 없음 또는 타 고객사' }, 409: { description: '버전·상태·후속 작업 충돌' } } })
      app.openAPIRegistry.registerPath({ method: 'get', path: '/api/customer/inspections', tags: ['First inspections'], summary: '고객사 확정 검수 결과 목록', security: [{ BearerAuth: [] }], request: { query: inspectionListQuery }, responses: { 200: { description: '고객사별 페이지 목록' } } })
    }
    if (locations) {
      const location = locationHandlers(locations)
      app.get('/api/admin/locations', adminAuth, requireAdmin, location.list)
      app.post('/api/admin/locations', adminAuth, requireAdmin, location.save(false))
      app.patch('/api/admin/locations/:id', adminAuth, requireAdmin, location.save(true))
      for (const [method, path, schema] of [['get', '/api/admin/locations', null], ['post', '/api/admin/locations', locationInput], ['patch', '/api/admin/locations/{id}', locationUpdate]] as const) app.openAPIRegistry.registerPath({ method, path, tags: ['Locations'], summary: '로케이션 DB 관리', security: [{ BearerAuth: [] }], request: { ...(method === 'get' ? { query: locationQuery } : { body: { required: true, content: { 'application/json': { schema: schema! } } } }), ...(method === 'patch' ? { params: z.object({ id: z.string().max(20) }) } : {}) }, responses: { 200: { description: '조회·수정' }, 201: { description: '생성' }, 400: { description: '입력 오류' }, 401: { description: '관리자 인증 필요' }, 409: { description: '이름 중복·버전 충돌' } } })
    }
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
      app.openAPIRegistry.registerPath({ method: 'post', path: '/api/admin/images/{kind}', summary: '관리자 이미지 파일 S3 업로드', tags: ['Images'], security: [{ BearerAuth: [] }], request: { params: z.object({ kind: z.enum(['items', 'assets', 'banners', 'inspections']) }), body: { required: true, content: { 'multipart/form-data': { schema: z.object({ file: z.string().openapi({ type: 'string', format: 'binary' }) }) } } } }, responses: { 201: { description: 'S3 이미지 id/name/url' }, 400: { description: '잘못된 이미지' }, 401: { description: '관리자 인증 필요' }, 413: { description: '크기 초과' }, 429: { description: '업로드 요청 제한' }, 503: { description: 'S3 저장 실패' } } })
    }
    if (adminData) {
      app.post('/api/admin/sale-requests/:id/approve', adminAuth, requireAdmin, approveAdminSale(adminData))
      app.openAPIRegistry.registerPath({ method: 'post', path: '/api/admin/sale-requests/{id}/approve', tags: ['Admin'], summary: '상세 검수 완료 판매 요청 승인 및 마켓 상품 진열', security: [{ BearerAuth: [] }], request: { params: z.object({ id: z.uuid() }), body: { required: true, content: { 'application/json': { schema: saleApprovalInput } } } }, responses: { 200: { description: '승인 완료 및 판매 중 상품 생성' }, 400: { description: '판매 단가·사유·자산 조건 오류' }, 401: { description: '관리자 인증 필요' }, 403: { description: '관리자 권한 필요' }, 404: { description: '요청 없음' }, 409: { description: '검수 미완료·이미 처리·버전 충돌' } } })
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
    app.openAPIRegistry.registerPath({ method: 'post', path: '/api/auth/login', tags: ['Auth'], summary: '활성 고객 회원 로그인 (customer audience JWT)', request: { body: { required: true, content: { 'application/json': { schema: loginSchema } } } }, responses: { 200: { description: '고객 토큰 및 프로필' }, 400: { description: '입력 오류' }, 401: { description: '계정 또는 비밀번호 불일치' }, 403: { description: '활성 회원·고객사 필요' } } })
    app.post('/api/admin/auth/login', adminLogin(auth.repository, auth.secret, auth.expiresIn))
    app.get('/api/admin/auth/me', adminAuth, requireAdmin, currentUser)
    app.openAPIRegistry.registerPath({ method: 'post', path: '/api/admin/auth/login', tags: ['Admin Auth'], summary: '직접 생성된 MRS 관리자 계정 로그인', request: { body: { required: true, content: { 'application/json': { schema: adminLoginSchema } } } }, responses: { 200: { description: '관리자 전용 audience 토큰 발급' }, 400: { description: '잘못된 요청' }, 401: { description: '계정 또는 비밀번호 불일치 (고객 계정 포함)' }, 403: { description: '비활성 계정' } } })
    app.openAPIRegistry.registerPath({ method: 'get', path: '/api/admin/auth/me', tags: ['Admin Auth'], summary: '관리자 전용 세션과 현재 DB 역할 확인', security: [{ BearerAuth: [] }], responses: { 200: { description: '확인된 관리자 프로필' }, 401: { description: '관리자 인증 필요' } } })
    app.post('/api/auth/register', register(auth.repository))
    app.get('/api/auth/me', customerAuth, currentUser)
    app.openAPIRegistry.registerPath({ method: 'get', path: '/api/auth/me', tags: ['Auth'], summary: '현재 고객 세션·소속·고객사 활성 상태 조회', security: [{ BearerAuth: [] }], responses: { 200: { description: '고객 프로필' } } })
    if (!customers) app.openAPIRegistry.registerPath({ method: 'post', path: '/api/auth/register', tags: ['Auth'], summary: '기존 고객사 소속 또는 신규 고객사 회원 신청', request: { body: { required: true, content: { 'application/json': { schema: registrationSchema } } } }, responses: { 201: { description: '승인 대기 회원' }, 400: { description: '입력 오류' }, 409: { description: '중복 회원' } } })
    app.get('/api/admin/members', adminAuth, requireAdmin, listMembers(auth.repository))
    app.post('/api/admin/members/:id/approve', adminAuth, requireAdmin, approveMember(auth.repository))
    app.post('/api/admin/members/:id/actions', adminAuth, requireAdmin, updateMember(auth.repository))
    app.openAPIRegistry.registerPath({ method: 'get', path: '/api/admin/members', tags: ['Accounts'], summary: '고객 회원 목록·검색·페이지 조회', security: [{ BearerAuth: [] }], request: { query: adminListQuery }, responses: { 200: { description: '회원 및 pagination' } } })
    app.openAPIRegistry.registerPath({ method: 'post', path: '/api/admin/members/{id}/approve', tags: ['Accounts'], summary: '고객 회원 소속 승인', security: [{ BearerAuth: [] }], request: { params: z.object({ id: z.uuid() }), body: { required: true, content: { 'application/json': { schema: memberDecisionSchema.omit({ action: true }) } } } }, responses: { 200: { description: '승인된 회원' }, 409: { description: '상태·버전 충돌' } } })
    if (!customers) app.openAPIRegistry.registerPath({ method: 'post', path: '/api/admin/members/{id}/actions', tags: ['Accounts'], summary: '고객 회원 심사·권한·소속 변경', security: [{ BearerAuth: [] }], request: { params: z.object({ id: z.uuid() }), body: { required: true, content: { 'application/json': { schema: memberDecisionSchema } } } }, responses: { 200: { description: '변경된 회원' }, 409: { description: '상태·버전 충돌' } } })
    if (adminData) {
      app.get('/api/admin/data', adminAuth, requireAdmin, loadAdminData(adminData))
      app.openAPIRegistry.registerPath({ method: 'get', path: '/api/admin/data', tags: ['Admin data'], summary: '도메인별 관리 데이터 (scope)·검색·페이지·상세 조회', security: [{ BearerAuth: [] }], request: { query: adminDataQuery }, responses: { 200: { description: '선택한 도메인 자료 및 pagination' } } })
      app.post('/api/admin/items', adminAuth, requireAdmin, createAdminItems(adminData))
      app.openAPIRegistry.registerPath({ method: 'post', path: '/api/admin/items', tags: ['Items'], summary: '품목 단일·일괄 등록 (최대 50000행)', security: [{ BearerAuth: [] }], request: { body: { required: true, content: { 'application/json': { schema: z.object({ items: z.array(itemInput).min(1).max(50000) }) } } } }, responses: { 201: { description: '등록된 품목' }, 400: { description: '입력 오류' }, 409: { description: '품목 중복·참조 오류' } } })
      app.put('/api/admin/items/:id', adminAuth, requireAdmin, updateAdminItem(adminData))
      app.put('/api/admin/assets/:id', adminAuth, requireAdmin, updateAdminAsset(adminData))
      app.post('/api/admin/sale-requests/:id/inspection/complete', adminAuth, requireAdmin, completeAdminSaleInspection(adminData))
      app.openAPIRegistry.registerPath({ method: 'post', path: '/api/admin/sale-requests/{id}/inspection/complete', tags: ['Admin'], summary: '자산 상세화 등록·수량 확인 후 상세 검수 완료 (판매 승인은 별도)', security: [{ BearerAuth: [] }], request: { params: z.object({ id: z.uuid() }), body: { required: true, content: { 'application/json': { schema: saleInspectionCompleteInput } } } }, responses: { 200: { description: '상세 검수 완료' }, 400: { description: '등록 항목 또는 수량 미충족' }, 401: { description: '관리자 인증 필요' }, 403: { description: '활성 관리자 권한 필요' }, 404: { description: '판매 요청 없음' }, 409: { description: '자산 또는 요청 상태 변경' } } })
      app.openAPIRegistry.registerPath({ method: 'put', path: '/api/admin/assets/{id}', summary: '기존 자산 정보 수정 및 변경 이력 저장', tags: ['Admin assets'], security: [{ BearerAuth: [] }], request: { params: z.object({ id: z.string().regex(/^\d{6}-\d{4}$/) }), body: { required: true, content: { 'application/json': { schema: assetUpdateInput } } } }, responses: { 200: { description: 'DB에 저장된 data.asset 반환' }, 400: { description: '입력·상태·참조 오류' }, 401: { description: '관리자 인증 필요' }, 404: { description: '자산 없음' }, 409: { description: '동시 변경 또는 연결 상품 충돌' } } })
      app.openAPIRegistry.registerPath({ method: 'put', path: '/api/admin/items/{id}', summary: '기존 품목 정보와 이미지 수정', tags: ['Admin items'], security: [{ BearerAuth: [] }], request: { params: z.object({ id: z.string().regex(/^\d{6}$/) }), body: { required: true, content: { 'application/json': { schema: itemUpdateInput } } } }, responses: { 200: { description: 'DB에 저장된 data.item 반환' }, 400: { description: '입력 또는 카테고리·이미지 오류' }, 401: { description: '관리자 인증 필요' }, 404: { description: '품목 없음' }, 409: { description: '중복 코드, 연결 자산 단위 변경 또는 동시 변경 충돌' } } })
      app.put('/api/admin/categories/:id', adminAuth, requireAdmin, saveAdminCategory(adminData))
      app.openAPIRegistry.registerPath({ method: 'put', path: '/api/admin/categories/{id}', tags: ['Categories'], summary: '카테고리 저장', security: [{ BearerAuth: [] }], request: { params: z.object({ id: z.string().regex(/^\d{6}$/) }), body: { required: true, content: { 'application/json': { schema: categoryInput } } } }, responses: { 200: { description: '저장된 카테고리' }, 409: { description: '코드·상위 분류·중복 오류' } } })
    }
    if (assets) {
      app.use('/api/assets', customerAuth)
      app.use('/api/assets/*', customerAuth)
      app.openapi(assetSummaryRoute, assetSummary(assets))
      app.openapi(assetDetailRoute, assetDetail(assets))
      app.openapi(saleRequestRoute, requestAssetSale(assets))
      app.openapi(assetListRoute, listAssets(assets))
    }
    if (banners) {
      app.get('/api/admin/banners', adminAuth, requireAdmin, listAdminBanners(banners))
      app.put('/api/admin/banners/:id', adminAuth, requireAdmin, saveBanner(banners))
      app.openAPIRegistry.registerPath({ method: 'get', path: '/api/admin/banners', tags: ['Banners'], summary: '관리자 배너 위치 목록·상세', security: [{ BearerAuth: [] }], request: { query: adminListQuery }, responses: { 200: { description: '배너 위치 및 페이지' } } })
      app.openAPIRegistry.registerPath({ method: 'put', path: '/api/admin/banners/{id}', tags: ['Banners'], summary: '배너 위치·이미지·기간·링크·순서 저장', security: [{ BearerAuth: [] }], request: { params: z.object({ id: placementId }), body: { required: true, content: { 'application/json': { schema: placementInput } } } }, responses: { 200: { description: '저장된 배너 위치' }, 409: { description: '배너 저장 충돌' } } })
    }
  }

  if (banners) {
    app.get('/api/banners', listPublicBanners(banners))
    app.openAPIRegistry.registerPath({ method: 'get', path: '/api/banners', tags: ['Banners'], summary: '활성 기간의 공개 배너 조회', request: { query: z.object({ placements: z.string().min(1).describe('쉼표로 구분한 배너 위치 ID, 최대 20개') }) }, responses: { 200: { description: '공개 배너 위치·이미지·링크' }, 400: { description: '위치 입력 오류' } } })
  }

  for (const endpoint of ['live', 'ready']) app.openAPIRegistry.registerPath({ method: 'get', path: `/api/health/${endpoint}`, tags: ['Health'], summary: endpoint === 'live' ? '프로세스 상태' : '데이터베이스 준비 상태', responses: { 200: { description: '정상' }, ...(endpoint === 'ready' ? { 503: { description: 'DB 사용 불가' } } : {}) } })

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

  registerApiDocs(app)

  app.notFound((context) => failure(context, 404, ErrorCode.NOT_FOUND, 'Not found'))

  return app
}