import { createRoute, z } from '@hono/zod-openapi'
import type { Context } from 'hono'
import type { AuthUser } from './auth.js'
import type { Prisma, PrismaClient } from './generated/prisma/client.js'
import { AppError, ErrorCode } from './http.js'

const dayMs = 24 * 60 * 60 * 1000

export const assetListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).openapi({ example: 1 }),
  size: z.coerce.number().int().min(1).max(100).default(20).openapi({ example: 20 }),
  q: z.string().trim().min(1).max(160).optional().openapi({ example: '알루미늄' }),
  storageStatus: z.enum(['PENDING', 'STORED', 'RELEASED']).optional(),
  saleStatus: z.enum(['PENDING', 'ON_SALE', 'SOLD']).optional(),
  grade: z.enum(['S', 'A', 'B', 'F']).optional(),
  categoryId: z.string().regex(/^\d{6}$/).optional().openapi({ example: '020101' }),
  locationId: z.string().trim().min(1).max(20).optional().openapi({ example: 'LOC-A03' }),
  receivedFrom: z.iso.date().optional(),
  receivedTo: z.iso.date().optional(),
  storageDaysFrom: z.coerce.number().int().min(0).optional(),
  storageDaysTo: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['updatedDesc', 'valueDesc', 'receivedDesc', 'nameAsc']).default('updatedDesc'),
})

export type AssetListQuery = z.infer<typeof assetListQuerySchema>

type AssetListRecord = {
  id: string
  itemId: string
  receivingId: string
  name: string
  category: { id: string; name: string; path: string }
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
  receivedAt: Date
  createdAt: Date
  updatedAt: Date
}

type AssetDetail = { id: string; name: string; itemId: string; receivingId: string; specification: string; brand: string; grade: string; quantity: string; unit: string; appraisalValue: string | null; storageStatus: string; saleStatus: string; locationId: string | null; category: { id: string; name: string; path: string }; createdAt: Date; images: Array<{ id: string; name: string; url: string }> }
type AssetSummary = { total: number; appraisalValue: string | null; unappraised: number; groups: Array<{ storageStatus: string; saleStatus: string; count: number }>; quantities: Array<{ unit: string; quantity: string }> }

export type AssetRepository = {
  list: (customerId: string, query: AssetListQuery, now: Date) => Promise<{ records: AssetListRecord[]; totalElements: number }>
  detail?: (customerId: string, id: string) => Promise<AssetDetail | null>
  summary?: (customerId: string) => Promise<AssetSummary>
}

const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
}).openapi('AssetCategory')

const assetSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  receivingId: z.string(),
  name: z.string(),
  category: categorySchema,
  specification: z.string(),
  brand: z.string(),
  grade: z.enum(['S', 'A', 'B', 'F']),
  quantity: z.string(),
  unit: z.string(),
  appraisalValue: z.string().nullable(),
  storageStatus: z.enum(['PENDING', 'STORED', 'RELEASED']),
  saleStatus: z.enum(['PENDING', 'ON_SALE', 'SOLD']),
  locationId: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
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
export const assetDetailRoute = createRoute({ method: 'get', path: '/api/assets/{id}', tags: ['Assets'], summary: '자사 자산 상세 조회', security: [{ BearerAuth: [] }], request: { params: z.object({ id: z.string().regex(/^\d{6}-\d{4}$/) }) }, responses: { ...readResponses, 200: { description: '고객 공개 필드 및 보호된 저장 이미지', content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.object({ asset: assetSchema.omit({ thumbnailUrl: true, receivedAt: true, storageDays: true, updatedAt: true }).extend({ images: z.array(z.object({ id: z.string(), name: z.string(), url: z.string() })) }) }) }) } } } } })
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

export function assetSummary(repository: AssetRepository) {
  return async (context: Context) => {
    const owner = assetOwner(context)
    if (!repository.summary) throw new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, '집계를 사용할 수 없습니다.')
    return context.json({ success: true as const, data: await repository.summary(owner) })
  }
}

export function privateImage(url: string) {
  return url.length <= 4_200_000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(url) ? url : null
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
  description: '로그인 계정에 연결된 고객사 소유 자산만 조회합니다. receivedAt과 보관 일수는 현재 Asset.createdAt을 기준으로 합니다.',
  security: [{ BearerAuth: [] }],
  request: { query: assetListQuerySchema },
  responses: {
    200: {
      description: '자산 목록',
      content: { 'application/json': { schema: z.object({
        success: z.literal(true),
        data: z.array(assetSchema),
        meta: z.object({ page: z.number(), size: z.number(), totalElements: z.number(), totalPages: z.number() }),
      }) } },
    },
    400: { description: '잘못된 조회 조건', content: { 'application/json': { schema: errorSchema } } },
    401: { description: '인증 필요', content: { 'application/json': { schema: errorSchema } } },
    403: { description: '고객사 연결 필요', content: { 'application/json': { schema: errorSchema } } },
  },
})

function validateRanges(query: AssetListQuery) {
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
      if (query.q) and.push({ OR: [{ id: { contains: query.q } }, { name: { contains: query.q } }, { specification: { contains: query.q } }, { brand: { contains: query.q } }] })
      if (query.receivedFrom) and.push({ createdAt: { gte: new Date(`${query.receivedFrom}T00:00:00.000Z`) } })
      if (query.receivedTo) and.push({ createdAt: { lt: new Date(new Date(`${query.receivedTo}T00:00:00.000Z`).getTime() + dayMs) } })
      if (query.storageDaysFrom !== undefined) and.push({ createdAt: { lte: new Date(now.getTime() - query.storageDaysFrom * dayMs) } })
      if (query.storageDaysTo !== undefined) and.push({ createdAt: { gt: new Date(now.getTime() - (query.storageDaysTo + 1) * dayMs) } })
      const where: Prisma.AssetWhereInput = {
        customerId,
        ...(query.storageStatus ? { storageStatus: query.storageStatus } : {}),
        ...(query.saleStatus ? { saleStatus: query.saleStatus } : {}),
        ...(query.grade ? { grade: query.grade } : {}),
        ...(query.locationId ? { locationId: query.locationId } : {}),
        ...(query.categoryId ? { categoryId: { in: descendants(categories, query.categoryId) } } : {}),
        ...(and.length ? { AND: and } : {}),
      }
      const orderBy: Prisma.AssetOrderByWithRelationInput[] = query.sort === 'valueDesc'
        ? [{ appraisal: 'desc' }, { id: 'asc' }]
        : query.sort === 'receivedDesc'
          ? [{ createdAt: 'desc' }, { id: 'asc' }]
          : query.sort === 'nameAsc'
            ? [{ name: 'asc' }, { id: 'asc' }]
            : [{ updatedAt: 'desc' }, { id: 'asc' }]
      const [totalElements, records] = await client.$transaction([
        client.asset.count({ where }),
        client.asset.findMany({
          where,
          orderBy,
          skip: (query.page - 1) * query.size,
          take: query.size,
          include: { category: true, images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
        }),
      ])
      return {
        totalElements,
        records: records.map((record) => ({
          id: record.id,
          itemId: record.itemId,
          receivingId: record.receivingId,
          name: record.name,
          category: { id: record.category.id, name: record.category.name, path: categoryPath(categories, record.category.id) },
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
          receivedAt: record.createdAt,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        })),
      }
    },
    detail: async (customerId, id) => {
      await assertOwnerConsistency(client, customerId)
      const record = await client.asset.findFirst({ where: { id, customerId }, include: { category: true, images: { orderBy: { sortOrder: 'asc' } } } })
      if (!record) return null
      const categories = await client.materialCategory.findMany({ select: { id: true, parentId: true, name: true } })
      return { id: record.id, itemId: record.itemId, receivingId: record.receivingId, name: record.name, specification: record.specification, brand: record.brand, grade: record.grade, quantity: record.quantity.toString(), unit: record.unit, appraisalValue: record.appraisal?.toString() ?? null, storageStatus: record.storageStatus, saleStatus: record.saleStatus, locationId: record.locationId, createdAt: record.createdAt, category: { id: record.category.id, name: record.category.name, path: categoryPath(categories, record.category.id) }, images: record.images.flatMap((image) => { const url = privateImage(image.url); return url ? [{ id: image.id, name: image.name, url }] : [] }) }
    },
    summary: async (customerId) => {
      await assertOwnerConsistency(client, customerId)
      const where: Prisma.AssetWhereInput = { customerId, storageStatus: { not: 'RELEASED' } }
      const [total, unappraised, groups, quantities] = await client.$transaction([
        client.asset.aggregate({ where, _count: true, _sum: { appraisal: true } }),
        client.asset.count({ where: { ...where, appraisal: null } }),
        client.asset.groupBy({ by: ['storageStatus', 'saleStatus'], where, _count: true }),
        client.asset.groupBy({ by: ['unit'], where, _sum: { quantity: true } }),
      ], { isolationLevel: 'RepeatableRead' })
      return { total: total._count, appraisalValue: total._sum.appraisal?.toString() ?? null, unappraised, groups: groups.map((group) => ({ storageStatus: group.storageStatus, saleStatus: group.saleStatus, count: group._count })), quantities: quantities.map((group) => ({ unit: group.unit, quantity: group._sum.quantity?.toString() ?? '0' })) }
    },
  }
}
