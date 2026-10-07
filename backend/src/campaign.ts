import { randomUUID } from 'node:crypto'
import { z } from '@hono/zod-openapi'
import type { Context } from 'hono'
import type { AuthUser } from './auth.js'
import { Prisma, type PrismaClient, type MaterialCategory } from './generated/prisma/client.js'
import { customerTransaction } from './customer.js'
import { publicImageUrl } from './admin-images.js'
import { AppError, ErrorCode, success } from './http.js'

const fields = z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().min(1).max(1000), enabled: z.boolean(), order: z.number().int().min(0).max(9999), startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }), productIds: z.array(z.string().min(1).max(20)).max(100), reason: z.string().trim().min(1).max(500) }).strict()
const validate = (input: z.infer<typeof fields>, context: z.RefinementCtx) => {
  if (Date.parse(input.startsAt) >= Date.parse(input.endsAt)) context.addIssue({ code: 'custom', path: ['endsAt'], message: '종료 일시는 시작 일시 이후여야 합니다.' })
  if (new Set(input.productIds).size !== input.productIds.length) context.addIssue({ code: 'custom', path: ['productIds'], message: '동일 상품은 한 번만 편성할 수 있습니다.' })
  if (input.enabled && !input.productIds.length) context.addIssue({ code: 'custom', path: ['productIds'], message: '상품을 편성한 뒤 노출을 사용해 주세요.' })
}
export const campaignInput = fields.superRefine(validate)
export const campaignUpdate = fields.extend({ version: z.number().int().nonnegative() }).superRefine(validate)
export const campaignProductQuery = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), rows: z.coerce.number().int().min(1).max(100).default(20), q: z.string().trim().max(160).default(''), status: z.enum(['DRAFT', 'AVAILABLE', 'OUT_OF_STOCK']).optional() })
export const campaignProductInclude = { asset: { include: { customer: true, images: { orderBy: { sortOrder: 'asc' as const }, take: 1 } } } }
export const campaignInclude = { items: { orderBy: { sortOrder: 'asc' as const }, include: { product: { include: campaignProductInclude } } } }
type CampaignProductRecord = Prisma.ProductGetPayload<{ include: typeof campaignProductInclude }>

export function enabledMarketCategoryIds(categories: Pick<MaterialCategory, 'id' | 'parentId' | 'enabled'>[]) {
  return categories.filter(entry => {
    const visited = new Set<string>()
    let current: typeof entry | undefined = entry
    while (current) { if (!current.enabled || visited.has(current.id)) return false; visited.add(current.id); if (!current.parentId) return true; current = categories.find(parent => parent.id === current!.parentId) }
    return false
  }).map(entry => entry.id)
}
export function campaignProductPayload(product: CampaignProductRecord, categoryIds: string[]) {
  const quantity = product.listedQuantity.minus(product.reservedQuantity).minus(product.soldQuantity)
  const visible = product.status === 'AVAILABLE' && !!product.publishedAt && quantity.gt(0) && product.asset.storageStatus === 'STORED' && product.asset.saleStatus === 'ON_SALE' && ['S', 'A', 'B'].includes(product.asset.grade ?? '') && product.asset.customer.status === 'ACTIVE' && categoryIds.includes(product.asset.categoryId ?? '')
  return { id: product.id, name: product.name, unit: product.asset.unit, grade: product.asset.grade, status: product.status, unitPrice: product.originalUnitPrice.mul(100 - product.discountRate).div(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toString(), quantity: quantity.toString(), imageUrl: publicImageUrl(product.asset.images[0]?.url ?? '') ?? null, visible }
}
export function campaignPayload(record: Prisma.CampaignGetPayload<{ include: typeof campaignInclude }>, categoryIds: string[]) {
  const products = record.items.map(item => campaignProductPayload(item.product, categoryIds))
  return { id: record.id, name: record.name, description: record.description, enabled: record.enabled, order: record.sortOrder, startsAt: record.startsAt.toISOString(), endsAt: record.endsAt.toISOString(), version: record.version, productIds: products.map(product => product.id), products, productCount: products.length, visibleProductCount: products.filter(product => product.visible).length }
}
export function createCampaignRepository(client: PrismaClient) {
  return {
    products: (query: z.infer<typeof campaignProductQuery>) => client.$transaction(async transaction => {
      const where: Prisma.ProductWhereInput = { ...(query.status ? { status: query.status } : {}), ...(query.q ? { OR: [{ id: { contains: query.q } }, { name: { contains: query.q } }, { asset: { specification: { contains: query.q } } }] } : {}) }
      const categories = enabledMarketCategoryIds(await transaction.materialCategory.findMany())
      const [records, total] = await Promise.all([transaction.product.findMany({ where, skip: (query.page - 1) * query.rows, take: query.rows, include: campaignProductInclude, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] }), transaction.product.count({ where })])
      return { products: records.map(record => campaignProductPayload(record, categories)), pagination: { page: query.page, rows: query.rows, total } }
    }),
    save: (actor: AuthUser, input: z.infer<typeof campaignInput> | z.infer<typeof campaignUpdate>, id?: string) => customerTransaction(client, async transaction => {
      const account = await transaction.user.findUnique({ where: { id: actor.id } })
      if (!account || account.role !== 'ADMIN' || account.status !== 'ACTIVE' || account.sessionVersion !== (actor.sessionVersion ?? 0)) throw new AppError(403, ErrorCode.FORBIDDEN, '활성 관리자만 기획전을 저장할 수 있습니다.')
      const previous = id ? await transaction.campaign.findUnique({ where: { id }, include: campaignInclude }) : null
      if (id && !previous) throw new AppError(404, ErrorCode.NOT_FOUND, '기획전을 찾을 수 없습니다.')
      if (previous && (!('version' in input) || input.version !== previous.version)) throw new AppError(409, ErrorCode.CONFLICT, '기획전이 변경되었습니다. 새로 조회한 뒤 다시 저장해 주세요.')
      if (await transaction.product.count({ where: { id: { in: input.productIds } } }) !== input.productIds.length) throw new AppError(400, ErrorCode.VALIDATION_ERROR, '편성 상품을 찾을 수 없습니다. 상품 선택을 확인해 주세요.')
      const data = { name: input.name, description: input.description, enabled: input.enabled, sortOrder: input.order, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt) }
      const campaignId = id ?? `CAM-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`
      if (previous) {
        if ((await transaction.campaign.updateMany({ where: { id: campaignId, version: previous.version }, data: { ...data, version: { increment: 1 } } })).count !== 1) throw new AppError(409, ErrorCode.CONFLICT, '다른 관리자가 기획전을 변경했습니다.')
        await transaction.campaignProduct.deleteMany({ where: { campaignId } })
      } else await transaction.campaign.create({ data: { id: campaignId, ...data } })
      if (input.productIds.length) await transaction.campaignProduct.createMany({ data: input.productIds.map((productId, sortOrder) => ({ campaignId, productId, sortOrder })) })
      const saved = await transaction.campaign.findUniqueOrThrow({ where: { id: campaignId }, include: campaignInclude })
      const categories = enabledMarketCategoryIds(await transaction.materialCategory.findMany())
      const after = campaignPayload(saved, categories)
      await transaction.marketChange.create({ data: { id: randomUUID(), entityType: 'CAMPAIGN', entityId: campaignId, actorUserId: actor.id, reason: input.reason, changes: { before: previous ? campaignPayload(previous, categories) : null, after } } })
      return after
    })
  }
}
export type CampaignRepository = ReturnType<typeof createCampaignRepository>
export function campaignHandlers(repository: CampaignRepository) {
  return {
    products: async (context: Context) => { context.header('Cache-Control', 'private, no-store'); return success(context, await repository.products(campaignProductQuery.parse(context.req.query()))) },
    save: (editing: boolean) => async (context: Context) => { context.header('Cache-Control', 'private, no-store'); const input = (editing ? campaignUpdate : campaignInput).parse(await context.req.json()); return success(context, { campaign: await repository.save(context.get('authUser'), input, editing ? context.req.param('id') : undefined) }, editing ? 200 : 201) }
  }
}