import { z } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { Prisma, type PrismaClient } from './generated/prisma/client.js'
import { publicImageUrl } from './admin-images.js'
import { AppError, ErrorCode, success } from './http.js'
import { campaignInclude, campaignProductPayload, enabledMarketCategoryIds } from './campaign.js'

export const marketQuery = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), size: z.coerce.number().int().min(1).max(100).default(20), q: z.string().trim().max(160).optional(), categoryId: z.string().regex(/^\d{6}$/).optional(), grade: z.enum(['S', 'A', 'B']).optional(), campaignId: z.string().min(1).max(20).optional(), discountOnly: z.enum(['true']).optional(), sort: z.enum(['latest', 'price', 'discount', 'campaign']).default('campaign') })

export function createMarketRepository(client: PrismaClient) {
  return {
    list: async (query: z.output<typeof marketQuery>, includePrices = false) => client.$transaction(async (transaction) => {
      const categories = await transaction.materialCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
      const chain = (id: string) => { const result: typeof categories = []; let current = categories.find((entry) => entry.id === id); while (current && !result.some((entry) => entry.id === current!.id)) { result.unshift(current); current = categories.find((entry) => entry.id === current!.parentId) } return result }
      const descendants = (id: string) => categories.filter((entry) => chain(entry.id).some((parent) => parent.id === id)).map((entry) => entry.id)
      const now = new Date()
      const enabledCategories = enabledMarketCategoryIds(categories)
      const campaigns = (await transaction.campaign.findMany({ where: { enabled: true, startsAt: { lte: now }, endsAt: { gt: now } }, include: campaignInclude, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })).filter(entry => entry.items.some(item => campaignProductPayload(item.product, enabledCategories).visible))
      const campaign = campaigns.find((entry) => entry.id === query.campaignId)
      const categoryIds = query.categoryId ? descendants(query.categoryId) : undefined
      const campaignIds = query.campaignId ? campaign?.items.map(item => item.productId) ?? [] : undefined
      const filteredCategories = enabledCategories.filter(id => !categoryIds || categoryIds.includes(id))
      const available = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM products WHERE listedQuantity > reservedQuantity + soldQuantity ORDER BY ROUND(originalUnitPrice * (100 - discountRate) / 100), id`)
      const where: Prisma.ProductWhereInput = { id: { in: available.map(entry => entry.id).filter(id => !campaignIds || campaignIds.includes(id)) }, status: 'AVAILABLE', publishedAt: { not: null }, ...(query.discountOnly ? { discountRate: { gte: 40 } } : {}), asset: { storageStatus: 'STORED', saleStatus: 'ON_SALE', grade: query.grade ?? { in: ['S', 'A', 'B'] }, customer: { status: 'ACTIVE' }, categoryId: { in: filteredCategories } }, ...(query.q ? { OR: [{ name: { contains: query.q } }, { asset: { category: { name: { contains: query.q } } } }] } : {}) }
      const total = await transaction.product.count({ where })
      const matchingIds = query.sort === 'price' || query.sort === 'campaign' && campaign ? new Set((await transaction.product.findMany({ where, select: { id: true } })).map((entry) => entry.id)) : null
      const orderedIds = query.sort === 'campaign' && campaignIds ? campaignIds : available.map(entry => entry.id)
      const priceIds = matchingIds ? orderedIds.filter(id => matchingIds.has(id)).slice((query.page - 1) * query.size, query.page * query.size) : null
      const products = await transaction.product.findMany({ where: priceIds ? { ...where, id: { in: priceIds } } : where, ...(priceIds ? {} : { skip: (query.page - 1) * query.size, take: query.size }), orderBy: query.sort === 'discount' ? [{ discountRate: 'desc' }, { id: 'asc' }] : [{ publishedAt: 'desc' }, { id: 'asc' }], include: { asset: { include: { category: true, images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } } } } })
      if (priceIds) products.sort((first, second) => priceIds.indexOf(first.id) - priceIds.indexOf(second.id))
      return { products: products.map((product) => ({ id: product.id, name: product.name, ...(includePrices ? { unitPrice: product.originalUnitPrice.mul(100 - product.discountRate).div(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toString(), originalUnitPrice: product.originalUnitPrice.toString() } : {}), discountRate: product.discountRate, quantity: product.listedQuantity.minus(product.reservedQuantity).minus(product.soldQuantity).toString(), minimumOrderQuantity: product.minimumOrderQuantity.toString(), unit: product.asset.unit, category: product.asset.category ? { id: product.asset.category.id, name: product.asset.category.name, path: chain(product.asset.category.id).map((entry) => entry.name).join(' > ') } : null, grade: product.asset.grade, brand: product.asset.brand, specification: product.asset.specification, imageUrl: product.asset.images.map((image) => publicImageUrl(image.url)).find(Boolean) ?? null, deliveryNotice: product.deliveryNotice })), categories: categories.map((entry) => ({ id: entry.id, parentId: entry.parentId, name: entry.name, enabled: entry.enabled, order: entry.sortOrder })), campaigns: campaigns.map((entry) => ({ id: entry.id, title: entry.name, description: entry.description, imageUrl: entry.items.map(item => campaignProductPayload(item.product, enabledCategories)).find(product => product.visible && product.imageUrl)?.imageUrl ?? null, enabled: true, order: entry.sortOrder, startsAt: entry.startsAt.toISOString(), endsAt: entry.endsAt.toISOString() })), page: query.page, size: query.size, total }
    }),
  }
}

export type MarketRepository = ReturnType<typeof createMarketRepository>
export function listMarketProducts(repository: MarketRepository, includePrices = false) {
  return async (context: Context) => {
    const query = marketQuery.parse(context.req.query())
    if (!includePrices && query.sort === 'price') throw new AppError(400, ErrorCode.VALIDATION_ERROR, '가격 정렬은 로그인 후 사용할 수 있습니다.')
    const data = await repository.list(query, includePrices)
    context.header('Cache-Control', 'private, no-store')
    return success(context, { ...data, products: data.products.map(({ unitPrice, originalUnitPrice, ...product }) => includePrices ? { ...product, unitPrice, originalUnitPrice } : product) })
  }
}