import { publicImageUrl } from './admin-images.js'
import { randomUUID } from 'node:crypto'
import { customerTransaction } from './customer.js'
import { createRoute, z } from '@hono/zod-openapi'
import type { Context } from 'hono'
import type { AuthUser } from './auth.js'
import { Prisma, type PrismaClient, type Product, type SaleRequest } from './generated/prisma/client.js'
import { AppError, ErrorCode } from './http.js'

const dayMs = 24 * 60 * 60 * 1000

export const assetListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).openapi({ example: 1 }),
  size: z.coerce.number().int().min(1).max(100).default(20).openapi({ example: 20 }),
  q: z.string().trim().min(1).max(160).optional().openapi({ example: '알루미늄' }),
  storageStatus: z.enum(['PENDING', 'STORED', 'RELEASED']).optional(),
  saleStatus: z.enum(['PENDING', 'ON_SALE', 'SOLD']).optional(),
  saleRequested: z.enum(['true', 'false']).optional().describe('판매 요청 존재 여부. 요청 전용 조건은 true와 함께 사용'),
  saleRequestStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  saleInspection: z.enum(['PENDING', 'COMPLETED']).optional(),
  saleRequestedFrom: z.iso.date().optional(),
  saleRequestedTo: z.iso.date().optional(),
  grade: z.enum(['S', 'A', 'B', 'F']).optional(),
  categoryId: z.string().regex(/^\d{6}$/).optional().openapi({ example: '020101' }),
  locationId: z.string().trim().min(1).max(20).optional().openapi({ example: 'LOC-A03' }),
  receivedFrom: z.iso.date().optional(),
  receivedTo: z.iso.date().optional(),
  storageDaysFrom: z.coerce.number().int().min(0).optional(),
  storageDaysTo: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['updatedDesc', 'valueDesc', 'receivedDesc', 'nameAsc', 'requestedDesc']).default('updatedDesc'),
})

export type AssetListQuery = z.infer<typeof assetListQuerySchema>

const saleRequestSelect = { id: true, status: true, inspection: true, quantity: true, desiredAmount: true, createdAt: true } satisfies Prisma.SaleRequestSelect
const saleProductSelect = { id: true, status: true, publishedAt: true, listedQuantity: true, reservedQuantity: true, soldQuantity: true } satisfies Prisma.ProductSelect
type SaleRequestRecord = Pick<SaleRequest, keyof typeof saleRequestSelect>
type SaleProductRecord = Pick<Product, keyof typeof saleProductSelect>
type SaleRequestView = z.infer<typeof saleRequestSchema>
type SaleRequestSummary = { approval: Record<'PENDING' | 'APPROVED' | 'REJECTED', number>; inspection: Record<'PENDING' | 'COMPLETED', number> }

function saleRequestView(request: SaleRequestRecord | null, product: SaleProductRecord | null): SaleRequestView | null {
  return request ? saleRequestSchema.parse({ id: request.id, status: request.status, inspection: request.inspection, quantity: request.quantity.toString(), desiredAmount: request.desiredAmount.toString(), createdAt: request.createdAt.toISOString(), product: product ? { id: product.id, status: product.status, publishedAt: product.publishedAt?.toISOString() ?? null, listedQuantity: product.listedQuantity.toString(), reservedQuantity: product.reservedQuantity.toString(), soldQuantity: product.soldQuantity.toString() } : null }) : null
}

export function canAssetRequestSale(asset: { storageStatus: string; saleStatus: string; grade: string; quantity: { toString: () => string }; saleRequest?: unknown; product?: unknown }) {
  return asset.storageStatus === 'STORED' && asset.saleStatus === 'PENDING' && ['S', 'A', 'B'].includes(asset.grade) && new Prisma.Decimal(asset.quantity.toString()).gt(0) && !asset.saleRequest && !asset.product
}

type AssetListRecord = {
  id: string
  itemId: string | null
  receivingId: string
  name: string
  category: { id: string; name: string; path: string } | null
  specification: string
  brand: string
  grade: 'S' | 'A' | 'B' | 'F'
  quantity: string
  unit: string
  appraisalValue: string | null
  storageStatus: 'PENDING' | 'STORED' | 'RELEASED'
  saleStatus: 'PENDING' | 'ON_SALE' | 'SOLD'
  locationId: string | null
  thumbnailUrl: string | null
  canRequestSale?: boolean
  saleRequest?: SaleRequestView | null
  receivedAt: Date
  createdAt: Date
  updatedAt: Date
}

type AssetDetail = { canRequestSale?: boolean; saleRequest?: SaleRequestView | null; id: string; name: string; itemId: string | null; receivingId: string; specification: string; brand: string; grade: string; quantity: string; unit: string; appraisalValue: string | null; storageStatus: string; saleStatus: string; locationId: string | null; category: { id: string; name: string; path: string } | null; createdAt: Date; images: Array<{ id: string; name: string; url: string }> }
type AssetSummary = { total: number; appraisalValue: string | null; unappraised: number; groups: Array<{ storageStatus: string; saleStatus: string; count: number }>; quantities: Array<{ unit: string; quantity: string }> }

export type AssetRepository = {
  requestSale?: (user: AuthUser, id: string, input: { desiredAmount: number; expectedQuantity: string }) => Promise<{ id: string }>
  list: (customerId: string, query: AssetListQuery, now: Date) => Promise<{ records: AssetListRecord[]; totalElements: number; saleRequestSummary?: SaleRequestSummary }>
  detail?: (customerId: string, id: string) => Promise<AssetDetail | null>
  summary?: (customerId: string) => Promise<AssetSummary>
}

const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
}).openapi('AssetCategory')

const saleRequestSchema = z.object({
  id: z.string(), status: z.enum(['PENDING', 'APPROVED', 'REJECTED']), inspection: z.enum(['PENDING', 'COMPLETED']), quantity: z.string().describe('판매 요청 당시 전체 수량 스냅샷'), desiredAmount: z.string().describe('전체 요청 수량의 판매 희망금액(원), 정산금 아님'), createdAt: z.iso.datetime(),
  product: z.object({ id: z.string(), status: z.enum(['DRAFT', 'AVAILABLE', 'OUT_OF_STOCK']), publishedAt: z.iso.datetime().nullable(), listedQuantity: z.string(), reservedQuantity: z.string(), soldQuantity: z.string().describe('출고 확정된 누적 수량, 정산 완료를 뜻하지 않음') }).nullable(),
}).openapi('AssetSaleRequest')
const saleRequestSummarySchema = z.object({ approval: z.object({ PENDING: z.number(), APPROVED: z.number(), REJECTED: z.number() }), inspection: z.object({ PENDING: z.number(), COMPLETED: z.number() }) }).openapi('AssetSaleRequestSummary')

const assetSchema = z.object({
  id: z.string(),
  itemId: z.string().nullable(),
  receivingId: z.string(),
  name: z.string(),
  category: categorySchema.nullable(),
  specification: z.string(),
  brand: z.string(),
  grade: z.enum(['S', 'A', 'B', 'F']),
  quantity: z.string(),
  unit: z.string(),
  appraisalValue: z.string().nullable().describe('개당 평가금액(원), null은 미평가. 총액은 현재 수량을 곱해 계산'),
  storageStatus: z.enum(['PENDING', 'STORED', 'RELEASED']),
  saleStatus: z.enum(['PENDING', 'ON_SALE', 'SOLD']),
  locationId: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  canRequestSale: z.boolean().optional().describe('현재 판매 요청 가능 여부. 등록 시 상태·수량을 다시 검증'),
  saleRequest: saleRequestSchema.nullable().optional(),
  receivedAt: z.iso.datetime(),
  storageDays: z.number().int().min(0),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).openapi('AssetListItem')

const errorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string(), code: z.string() })).optional(),
  }),
}).openapi('ErrorResponse')

const readResponses = { 401: { description: '인증 필요' }, 403: { description: '고객 권한 필요' }, 404: { description: '자산 없음' }, 503: { description: '자산 귀속 확인 필요' } }
export const assetDetailRoute = createRoute({ method: 'get', path: '/api/assets/{id}', tags: ['Assets'], summary: '자사 자산 상세 조회', security: [{ BearerAuth: [] }], request: { params: z.object({ id: z.string().regex(/^\d{6}-\d{4}$/) }) }, responses: { ...readResponses, 200: { description: '고객 공개 필드 및 보호된 저장 이미지', content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.object({ asset: assetSchema.omit({ thumbnailUrl: true, receivedAt: true, storageDays: true, updatedAt: true }).extend({ canRequestSale: z.boolean(), saleRequest: saleRequestSchema.nullable(), images: z.array(z.object({ id: z.string(), name: z.string(), url: z.string() })) }) }) }) } } } } })
export const assetSummaryRoute = createRoute({ method: 'get', path: '/api/assets/summary', tags: ['Assets'], summary: '자사 전체 보유 자산 집계 (출고완료 제외)', security: [{ BearerAuth: [] }], responses: { ...readResponses, 200: { description: '페이지와 무관한 전체 집계. 평가금액은 자산 총평가액의 합.', content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.object({ total: z.number(), appraisalValue: z.string().nullable(), unappraised: z.number(), groups: z.array(z.object({ storageStatus: z.string(), saleStatus: z.string(), count: z.number() })), quantities: z.array(z.object({ unit: z.string(), quantity: z.string() })) }) }) } } } } })

function assetOwner(context: Context) {
  const user = context.get('authUser') as AuthUser
  if (user.role !== 'CUSTOMER' || !user.customerId) throw new AppError(403, ErrorCode.FORBIDDEN, '고객사 소속 계정이 필요합니다.')
  return user.customerId
}

export function assetDetail(repository: AssetRepository) {
  return async (context: Context) => {
    const owner = assetOwner(context)
    if (!repository.detail) throw new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, '상세 조회를 사용할 수 없습니다.')
    const asset = await repository.detail(owner, context.req.param('id')!)
    if (!asset) throw new AppError(404, ErrorCode.NOT_FOUND, '자산을 찾을 수 없습니다.')
    return context.json({ success: true as const, data: { asset } })
  }
}

export const saleRequestInput = z.object({ desiredAmount: z.number().int().min(1).max(1e12), expectedQuantity: z.string().max(32).regex(/^\d+(\.\d{1,3})?$/) }).strict()
export const saleRequestRoute = createRoute({ method: 'post', path: '/api/assets/{id}/sale-requests', tags: ['Assets'], summary: '자사 자산 전체 수량 판매 요청', security: [{ BearerAuth: [] }], request: { params: z.object({ id: z.string().regex(/^\d{6}-\d{4}$/) }), body: { content: { 'application/json': { schema: saleRequestInput } } } }, responses: { 201: { description: '승인 대기·상세 검수 대기로 접수', content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.object({ request: z.object({ id: z.string() }) }) }) } } }, 400: { description: '잘못된 입력' }, 401: { description: '인증 필요' }, 403: { description: '활성 고객사 소속 필요' }, 404: { description: '자산 없음' }, 409: { description: '중복 요청·수량 변경·판매 불가 상태' } } })
export function requestAssetSale(repository: AssetRepository) {
  return async (context: Context) => {
    assetOwner(context)
    if (!repository.requestSale) throw new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, '판매 요청을 사용할 수 없습니다.')
    const id = z.string().regex(/^\d{6}-\d{4}$/).parse(context.req.param('id'))
    return context.json({ success: true, data: { request: await repository.requestSale(context.get('authUser') as AuthUser, id, saleRequestInput.parse(await context.req.json())) } }, 201)
  }
}

export function assetSummary(repository: AssetRepository) {
  return async (context: Context) => {
    const owner = assetOwner(context)
    if (!repository.summary) throw new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, '집계를 사용할 수 없습니다.')
    return context.json({ success: true as const, data: await repository.summary(owner) })
  }
}

export function privateImage(url: string) {
  return publicImageUrl(url) ?? (url.length <= 4_200_000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(url) ? url : null)
}

async function assertOwnerConsistency(client: PrismaClient, customerId: string) {
  const mismatches = await client.$queryRaw<Array<{ id: string }>>`
    SELECT asset.id FROM assets asset
    LEFT JOIN receivings receiving ON receiving.id = asset.receivingId
    LEFT JOIN inspection_items item ON item.assetId = asset.id
    LEFT JOIN inspections inspection ON inspection.id = item.inspectionId
    LEFT JOIN receivings inspected ON inspected.id = inspection.receivingId
    WHERE (asset.customerId = ${customerId} OR receiving.customerId = ${customerId} OR inspected.customerId = ${customerId})
      AND ((receiving.id IS NOT NULL AND asset.customerId <> receiving.customerId)
        OR (inspected.id IS NOT NULL AND asset.customerId <> inspected.customerId)) LIMIT 1`
  if (mismatches.length) throw new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, '자산 귀속 확인이 필요합니다. MRS에 문의해 주세요.')
}

export const assetListRoute = createRoute({
  method: 'get',
  path: '/api/assets',
  tags: ['Assets'],
  summary: '내 자산 목록 조회',
  description: '로그인 계정에 연결된 고객사 소유 자산만 조회합니다. saleRequested=true로 판매 요청 내역을 조회하며 saleRequestStatus, saleInspection, saleRequestedFrom/To, sort=requestedDesc를 함께 사용할 수 있습니다. 요청일 기간은 한국시간 날짜 기준입니다. saleRequestSummary는 페이지·승인·검수 필터와 독립적인 검색 범위 전체 집계입니다. receivedAt과 보관 일수는 현재 Asset.createdAt을 기준으로 합니다.',
  security: [{ BearerAuth: [] }],
  request: { query: assetListQuerySchema },
  responses: {
    200: {
      description: '자산 목록',
      content: { 'application/json': { schema: z.object({
        success: z.literal(true),
        data: z.array(assetSchema),
        meta: z.object({ page: z.number(), size: z.number(), totalElements: z.number(), totalPages: z.number() }),
        saleRequestSummary: saleRequestSummarySchema.optional(),
      }) } },
    },
    400: { description: '잘못된 조회 조건', content: { 'application/json': { schema: errorSchema } } },
    401: { description: '인증 필요', content: { 'application/json': { schema: errorSchema } } },
    403: { description: '고객사 연결 필요', content: { 'application/json': { schema: errorSchema } } },
  },
})

function validateRanges(query: AssetListQuery) {
  if ((query.saleRequestStatus || query.saleInspection || query.saleRequestedFrom || query.saleRequestedTo || query.sort === 'requestedDesc') && query.saleRequested !== 'true') {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, '판매 요청 조건은 saleRequested=true와 함께 사용해야 합니다.')
  }
  if (query.saleRequestedFrom && query.saleRequestedTo && query.saleRequestedFrom > query.saleRequestedTo) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, '판매 요청 시작일은 종료일보다 늦을 수 없습니다.')
  }
  if (query.receivedFrom && query.receivedTo && query.receivedFrom > query.receivedTo) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Request validation failed', [{ path: 'receivedFrom', message: 'Must be on or before receivedTo', code: 'invalid_range' }])
  }
  if (query.storageDaysFrom !== undefined && query.storageDaysTo !== undefined && query.storageDaysFrom > query.storageDaysTo) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Request validation failed', [{ path: 'storageDaysFrom', message: 'Must be less than or equal to storageDaysTo', code: 'invalid_range' }])
  }
}

export function listAssets(repository: AssetRepository, now: () => Date = () => new Date()) {
  return async (context: Context) => {
    const user = context.get('authUser') as AuthUser
    if (user.role !== 'CUSTOMER') throw new AppError(403, ErrorCode.FORBIDDEN, 'Customer access is required')
    if (!user.customerId) throw new AppError(403, ErrorCode.FORBIDDEN, 'Customer account is not linked to an asset owner')
    const query = assetListQuerySchema.parse(context.req.query())
    validateRanges(query)
    const currentTime = now()
    const result = await repository.list(user.customerId, query, currentTime)
    return context.json({
      success: true as const,
      data: result.records.map((record) => ({
        ...record,
        receivedAt: record.receivedAt.toISOString(),
        storageDays: Math.max(0, Math.floor((currentTime.getTime() - record.receivedAt.getTime()) / dayMs)),
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      })),
      meta: {
        page: query.page,
        size: query.size,
        totalElements: result.totalElements,
        totalPages: Math.ceil(result.totalElements / query.size),
      },
      ...(result.saleRequestSummary ? { saleRequestSummary: result.saleRequestSummary } : {}),
    }, 200)
  }
}

function descendants(categories: Array<{ id: string; parentId: string | null }>, rootId: string) {
  const ids = new Set([rootId])
  let changed = true
  while (changed) {
    changed = false
    for (const category of categories) {
      if (category.parentId && ids.has(category.parentId) && !ids.has(category.id)) {
        ids.add(category.id)
        changed = true
      }
    }
  }
  return [...ids]
}

function categoryPath(categories: Array<{ id: string; parentId: string | null; name: string }>, id: string) {
  const byId = new Map(categories.map((category) => [category.id, category]))
  const names: string[] = []
  const visited = new Set<string>()
  let current = byId.get(id)
  while (current && !visited.has(current.id)) {
    names.unshift(current.name)
    visited.add(current.id)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return names.join(' > ')
}

export function createAssetRepository(client: PrismaClient): AssetRepository {
  return {
    list: async (customerId, query, now) => {
      await assertOwnerConsistency(client, customerId)
      const categories = await client.materialCategory.findMany({ select: { id: true, parentId: true, name: true } })
      const and: Prisma.AssetWhereInput[] = []
      if (query.q) and.push({ OR: [{ id: { contains: query.q } }, { name: { contains: query.q } }, { specification: { contains: query.q } }, { brand: { contains: query.q } }, ...(query.saleRequested === 'true' ? [{ saleRequest: { is: { id: { contains: query.q } } } }] : [])] })
      if (query.receivedFrom) and.push({ createdAt: { gte: new Date(`${query.receivedFrom}T00:00:00.000Z`) } })
      if (query.receivedTo) and.push({ createdAt: { lt: new Date(new Date(`${query.receivedTo}T00:00:00.000Z`).getTime() + dayMs) } })
      if (query.storageDaysFrom !== undefined) and.push({ createdAt: { lte: new Date(now.getTime() - query.storageDaysFrom * dayMs) } })
      if (query.storageDaysTo !== undefined) and.push({ createdAt: { gt: new Date(now.getTime() - (query.storageDaysTo + 1) * dayMs) } })
      const requestWhere: Prisma.SaleRequestWhereInput = {
        ...(query.saleRequestedFrom || query.saleRequestedTo ? { createdAt: { ...(query.saleRequestedFrom ? { gte: new Date(`${query.saleRequestedFrom}T00:00:00+09:00`) } : {}), ...(query.saleRequestedTo ? { lt: new Date(new Date(`${query.saleRequestedTo}T00:00:00+09:00`).getTime() + dayMs) } : {}) } } : {}),
      }
      const baseWhere: Prisma.AssetWhereInput = {
        customerId,
        ...(query.saleRequested ? { saleRequest: query.saleRequested === 'true' ? { is: requestWhere } : { is: null } } : {}),
        ...(query.storageStatus ? { storageStatus: query.storageStatus } : {}),
        ...(query.saleStatus ? { saleStatus: query.saleStatus } : {}),
        ...(query.grade ? { grade: query.grade } : {}),
        ...(query.locationId ? { locationId: query.locationId } : {}),
        ...(query.categoryId ? { categoryId: { in: descendants(categories, query.categoryId) } } : {}),
        ...(and.length ? { AND: and } : {}),
      }
      const where: Prisma.AssetWhereInput = query.saleRequested === 'true' ? { ...baseWhere, saleRequest: { is: { ...requestWhere, ...(query.saleRequestStatus ? { status: query.saleRequestStatus } : {}), ...(query.saleInspection ? { inspection: query.saleInspection } : {}) } } } : baseWhere
      const orderBy: Prisma.AssetOrderByWithRelationInput[] = query.sort === 'requestedDesc'
        ? [{ saleRequest: { createdAt: 'desc' } }, { id: 'asc' }]
        : query.sort === 'valueDesc'
        ? [{ appraisal: 'desc' }, { id: 'asc' }]
        : query.sort === 'receivedDesc'
          ? [{ createdAt: 'desc' }, { id: 'asc' }]
          : query.sort === 'nameAsc'
            ? [{ name: 'asc' }, { id: 'asc' }]
            : [{ updatedAt: 'desc' }, { id: 'asc' }]
      const [totalElements, records, approvalGroups, inspectionGroups] = await client.$transaction([
        client.asset.count({ where }),
        client.asset.findMany({
          where,
          orderBy,
          skip: (query.page - 1) * query.size,
          take: query.size,
          include: { category: true, saleRequest: { select: saleRequestSelect }, product: { select: saleProductSelect }, images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
        }),
        ...(query.saleRequested === 'true' ? [client.saleRequest.groupBy({ by: ['status'], where: { asset: { is: baseWhere } }, _count: true }), client.saleRequest.groupBy({ by: ['inspection'], where: { asset: { is: baseWhere } }, _count: true })] : []),
      ], { isolationLevel: 'RepeatableRead' })
      const saleRequestSummary: SaleRequestSummary | undefined = query.saleRequested === 'true' ? { approval: { PENDING: 0, APPROVED: 0, REJECTED: 0 }, inspection: { PENDING: 0, COMPLETED: 0 } } : undefined
      if (saleRequestSummary) {
        for (const group of approvalGroups as Array<{ status: string; _count: number }>) if (Object.hasOwn(saleRequestSummary.approval, group.status)) saleRequestSummary.approval[group.status as keyof SaleRequestSummary['approval']] = group._count
        for (const group of inspectionGroups as Array<{ inspection: string; _count: number }>) if (Object.hasOwn(saleRequestSummary.inspection, group.inspection)) saleRequestSummary.inspection[group.inspection as keyof SaleRequestSummary['inspection']] = group._count
      }
      if (query.sort === 'valueDesc') {
        const conditions = [Prisma.sql`customerId = ${customerId}`]
        if (query.q) conditions.push(Prisma.sql`(LOCATE(${query.q}, id) > 0 OR LOCATE(${query.q}, name) > 0 OR LOCATE(${query.q}, specification) > 0 OR LOCATE(${query.q}, brand) > 0 ${query.saleRequested === 'true' ? Prisma.sql`OR EXISTS (SELECT 1 FROM sale_requests request WHERE request.assetId = assets.id AND LOCATE(${query.q}, request.id) > 0)` : Prisma.empty})`)
        if (query.saleRequested) {
          const requestConditions = [Prisma.sql`request.assetId = assets.id`]
          if (query.saleRequestStatus) requestConditions.push(Prisma.sql`request.status = ${query.saleRequestStatus}`)
          if (query.saleInspection) requestConditions.push(Prisma.sql`request.inspection = ${query.saleInspection}`)
          if (query.saleRequestedFrom) requestConditions.push(Prisma.sql`request.createdAt >= ${new Date(`${query.saleRequestedFrom}T00:00:00+09:00`)}`)
          if (query.saleRequestedTo) requestConditions.push(Prisma.sql`request.createdAt < ${new Date(new Date(`${query.saleRequestedTo}T00:00:00+09:00`).getTime() + dayMs)}`)
          conditions.push(Prisma.sql`${query.saleRequested === 'false' ? Prisma.sql`NOT` : Prisma.empty} EXISTS (SELECT 1 FROM sale_requests request WHERE ${Prisma.join(requestConditions, ' AND ')})`)
        }
        if (query.storageStatus) conditions.push(Prisma.sql`storageStatus = ${{ PENDING: '입고대기', STORED: '보관중', RELEASED: '출고완료' }[query.storageStatus]}`)
        if (query.saleStatus) conditions.push(Prisma.sql`saleStatus = ${{ PENDING: '판매대기', ON_SALE: '판매중', SOLD: '판매완료' }[query.saleStatus]}`)
        if (query.grade) conditions.push(Prisma.sql`grade = ${query.grade}`)
        if (query.locationId) conditions.push(Prisma.sql`locationId = ${query.locationId}`)
        if (query.categoryId) conditions.push(Prisma.sql`categoryId IN (${Prisma.join(descendants(categories, query.categoryId))})`)
        if (query.receivedFrom) conditions.push(Prisma.sql`createdAt >= ${new Date(`${query.receivedFrom}T00:00:00.000Z`)}`)
        if (query.receivedTo) conditions.push(Prisma.sql`createdAt < ${new Date(new Date(`${query.receivedTo}T00:00:00.000Z`).getTime() + dayMs)}`)
        if (query.storageDaysFrom !== undefined) conditions.push(Prisma.sql`createdAt <= ${new Date(now.getTime() - query.storageDaysFrom * dayMs)}`)
        if (query.storageDaysTo !== undefined) conditions.push(Prisma.sql`createdAt > ${new Date(now.getTime() - (query.storageDaysTo + 1) * dayMs)}`)
        const ids = await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM assets WHERE ${Prisma.join(conditions, ' AND ')} ORDER BY appraisal * quantity DESC, id ASC LIMIT ${query.size} OFFSET ${(query.page - 1) * query.size}`)
        const sorted = await client.asset.findMany({ where: { ...where, id: { in: ids.map((entry) => entry.id) } }, include: { category: true, saleRequest: { select: saleRequestSelect }, product: { select: saleProductSelect }, images: { orderBy: { sortOrder: 'asc' }, take: 1 } } })
        records.splice(0, records.length, ...ids.flatMap(({ id }) => sorted.filter((entry) => entry.id === id)))
      }
      return {
        totalElements,
        ...(saleRequestSummary ? { saleRequestSummary } : {}),
        records: records.map((record) => ({
          id: record.id,
          itemId: record.itemId,
          receivingId: record.receivingId,
          name: record.name,
          category: record.category ? { id: record.category.id, name: record.category.name, path: categoryPath(categories, record.category.id) } : null,
          specification: record.specification,
          brand: record.brand,
          grade: record.grade,
          quantity: record.quantity.toString(),
          unit: record.unit,
          appraisalValue: record.appraisal?.toString() ?? null,
          storageStatus: record.storageStatus,
          saleStatus: record.saleStatus,
          locationId: record.locationId,
          thumbnailUrl: record.images[0] ? privateImage(record.images[0].url) : null,
          canRequestSale: canAssetRequestSale(record),
          saleRequest: saleRequestView(record.saleRequest ?? null, record.product ?? null),
          receivedAt: record.createdAt,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        })),
      }
    },
    detail: async (customerId, id) => {
      await assertOwnerConsistency(client, customerId)
      const record = await client.asset.findFirst({ where: { id, customerId }, include: { category: true, saleRequest: { select: saleRequestSelect }, product: { select: saleProductSelect }, images: { orderBy: { sortOrder: 'asc' } } } })
      if (!record) return null
      const categories = await client.materialCategory.findMany({ select: { id: true, parentId: true, name: true } })
      return { saleRequest: saleRequestView(record.saleRequest, record.product), canRequestSale: canAssetRequestSale(record), id: record.id, itemId: record.itemId, receivingId: record.receivingId, name: record.name, specification: record.specification, brand: record.brand, grade: record.grade, quantity: record.quantity.toString(), unit: record.unit, appraisalValue: record.appraisal?.toString() ?? null, storageStatus: record.storageStatus, saleStatus: record.saleStatus, locationId: record.locationId, createdAt: record.createdAt, category: record.category ? { id: record.category.id, name: record.category.name, path: categoryPath(categories, record.category.id) } : null, images: record.images.flatMap((image) => { const url = privateImage(image.url); return url ? [{ id: image.id, name: image.name, url }] : [] }) }
    },
    requestSale: (user, id, input) => customerTransaction(client, async (transaction) => {
      const actor = await transaction.user.findUnique({ where: { id: user.id }, include: { customer: true } })
      if (!actor || actor.role !== 'CUSTOMER' || actor.status !== 'ACTIVE' || !actor.customerId || actor.customerId !== user.customerId || actor.customer?.status !== 'ACTIVE' || actor.sessionVersion !== (user.sessionVersion ?? 0) || actor.customer.accessVersion !== user.customer?.accessVersion) throw new AppError(403, ErrorCode.FORBIDDEN, '활성 고객사 소속 계정이 필요합니다.')
      const asset = await transaction.asset.findFirst({ where: { id, customerId: actor.customerId }, include: { saleRequest: true, product: true } })
      if (!asset) throw new AppError(404, ErrorCode.NOT_FOUND, '자산을 찾을 수 없습니다.')
      if (asset.saleRequest || asset.product) throw new AppError(409, ErrorCode.CONFLICT, '이미 판매 요청되었거나 상품이 연결된 자산입니다.')
      if (asset.storageStatus !== 'STORED' || asset.saleStatus !== 'PENDING' || asset.grade === 'F' || !asset.quantity.gt(0)) throw new AppError(409, ErrorCode.CONFLICT, '보관중·판매대기 상태의 재사용 자산만 요청할 수 있습니다.')
      if (!asset.quantity.equals(input.expectedQuantity)) throw new AppError(409, ErrorCode.CONFLICT, '자산 수량이 변경되었습니다. 새로고침 후 다시 요청해 주세요.')
      const request = await transaction.saleRequest.create({ data: { id: randomUUID(), assetId: id, actorUserId: actor.id, quantity: asset.quantity, desiredAmount: input.desiredAmount } })
      await transaction.assetChange.create({ data: { id: randomUUID(), assetId: id, reason: '고객 마켓 판매 등록 요청', changes: [['판매 요청', '요청 없음', request.id]] } })
      await transaction.customerChange.create({ data: { customerId: actor.customerId, actorUserId: actor.id, action: 'sale.request', reason: '고객 마켓 판매 등록 요청', changes: { requestId: request.id, assetId: id, quantity: request.quantity.toString(), desiredAmount: request.desiredAmount.toString(), status: request.status, inspection: request.inspection } } })
      return { id: request.id }
    }),
    summary: async (customerId) => {
      await assertOwnerConsistency(client, customerId)
      const where: Prisma.AssetWhereInput = { customerId, storageStatus: { not: 'RELEASED' } }
      const [total, unappraised, groups, quantities] = await client.$transaction([
        client.$queryRaw<Array<{ count: bigint; amount: Prisma.Decimal | null }>>(Prisma.sql`SELECT COUNT(*) AS count, SUM(appraisal * quantity) AS amount FROM assets WHERE customerId = ${customerId} AND storageStatus <> '출고완료'`),
        client.asset.count({ where: { ...where, appraisal: null } }),
        client.asset.groupBy({ by: ['storageStatus', 'saleStatus'], where, _count: true }),
        client.asset.groupBy({ by: ['unit'], where, _sum: { quantity: true } }),
      ], { isolationLevel: 'RepeatableRead' })
      return { total: Number(total[0]!.count), appraisalValue: total[0]!.amount?.toString() ?? null, unappraised, groups: groups.map((group) => ({ storageStatus: group.storageStatus, saleStatus: group.saleStatus, count: group._count })), quantities: quantities.map((group) => ({ unit: group.unit, quantity: group._sum.quantity?.toString() ?? '0' })) }
    },
  }
}
