import { z } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { Prisma, type PrismaClient } from './generated/prisma/client.js'
import { publicImageUrl } from './admin-images.js'
import { success } from './http.js'

export const marketQuery = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), size: z.coerce.number().int().min(1).max(100).default(20), q: z.string().trim().max(160).optional() })

export function createMarketRepository(client: PrismaClient) {
  return {
    list: async (query: z.output<typeof marketQuery>) => client.$transaction(async (transaction) => {
      const available = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM products WHERE listedQuantity > reservedQuantity + soldQuantity`)
      const where: Prisma.ProductWhereInput = { id: { in: available.map((entry) => entry.id) }, status: 'AVAILABLE', publishedAt: { not: null }, asset: { storageStatus: 'STORED', saleStatus: 'ON_SALE', grade: { in: ['S', 'A', 'B'] }, customer: { status: 'ACTIVE' } }, ...(query.q ? { name: { contains: query.q } } : {}) }
      const total = await transaction.product.count({ where })
      const products = await transaction.product.findMany({ where, skip: (query.page - 1) * query.size, take: query.size, orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }], include: { asset: { include: { category: true, images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } } } } })
      return { products: products.map((product) => ({ id: product.id, name: product.name, unitPrice: product.originalUnitPrice.mul(100 - product.discountRate).div(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toString(), originalUnitPrice: product.originalUnitPrice.toString(), discountRate: product.discountRate, quantity: product.listedQuantity.minus(product.reservedQuantity).minus(product.soldQuantity).toString(), minimumOrderQuantity: product.minimumOrderQuantity.toString(), unit: product.asset.unit, category: product.asset.category ? { id: product.asset.category.id, name: product.asset.category.name } : null, grade: product.asset.grade, brand: product.asset.brand, specification: product.asset.specification, imageUrl: product.asset.images.map((image) => publicImageUrl(image.url)).find(Boolean) ?? null, deliveryNotice: product.deliveryNotice })), page: query.page, size: query.size, total }
    }),
  }
}

export type MarketRepository = ReturnType<typeof createMarketRepository>
export function listMarketProducts(repository: MarketRepository) {
  return async (context: Context) => success(context, await repository.list(marketQuery.parse(context.req.query())))
}