import { createHash, randomUUID } from 'node:crypto'
import { z } from '@hono/zod-openapi'
import type { Context } from 'hono'
import type { AuthUser } from './auth.js'
import { Prisma, type PrismaClient } from './generated/prisma/client.js'
import { customerTransaction } from './customer.js'
import { emitNotification } from './notification.js'
import { publicImageUrl } from './admin-images.js'
import { cartQuantity } from './cart.js'
import { AppError, ErrorCode, success } from './http.js'

const itemInput = z.object({ productId: z.string().min(1).max(20), quantity: cartQuantity, cartItemId: z.uuid().optional(), expectedVersion: z.number().int().nonnegative().optional() }).strict()
export const quotePreviewInput = z.object({ source: z.enum(['cart', 'product']), items: z.array(itemInput).min(1).max(100) }).strict().superRefine((input, context) => {
  if (new Set(input.items.map(item => item.productId)).size !== input.items.length) context.addIssue({ code: 'custom', message: '동일 상품은 한 번만 요청할 수 있습니다.' })
  for (const item of input.items) if (input.source === 'cart' ? !item.cartItemId || item.expectedVersion === undefined : item.cartItemId !== undefined || item.expectedVersion !== undefined) context.addIssue({ code: 'custom', message: '장바구니 항목과 버전을 확인해 주세요.' })
})
export const quoteCreateInput = quotePreviewInput.extend({ operationId: z.uuid(), expectedSnapshot: z.string().regex(/^[a-f0-9]{64}$/), contact: z.object({ name: z.string().trim().min(1).max(80), phone: z.string().trim().min(1).max(40), email: z.union([z.literal(''), z.email().max(254)]).default('') }).strict(), address: z.string().trim().max(300).default(''), deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null), note: z.string().trim().max(1000).default('') })
export const quoteListQuery = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), size: z.coerce.number().int().min(1).max(100).default(20), q: z.string().trim().max(160).default(''), responseStatus: z.enum(['WAITING', 'SENT', 'EXPIRED', 'DECLINED', 'WITHDRAWN', 'ACCEPTED', 'SUPERSEDED']).optional() }).strict()
export type QuotePreviewInput = z.infer<typeof quotePreviewInput>
export type QuoteCreateInput = z.infer<typeof quoteCreateInput>
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const conflict = (message: string, code = 'QUOTE_CHANGED') => new AppError(409, ErrorCode.CONFLICT, message, [{ path: '', code, message }])
export function validateQuoteDate(value: string | null) {
  if (!value) return
  const date = new Date(`${value}T00:00:00Z`)
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value < today) throw new AppError(400, ErrorCode.VALIDATION_ERROR, '희망 납기일은 오늘 이후의 실제 날짜로 입력해 주세요.')
}
const quoteInclude = { items: { orderBy: { sortOrder: 'asc' as const } } }
export function quotePayload(quote: Prisma.PurchaseQuoteGetPayload<{ include: typeof quoteInclude }>) {
  return { ...quote, deliveryDate: quote.deliveryDate?.toISOString().slice(0, 10) ?? null, createdAt: quote.createdAt.toISOString(), total: quote.total.toString(), originalTotal: quote.originalTotal.toString(), items: quote.items.map(item => ({ ...item, quantity: item.quantity.toString(), unitPrice: item.unitPrice.toString(), originalUnitPrice: item.originalUnitPrice.toString(), originalTotal: item.originalTotal.toString(), total: item.total.toString() })), operationId: undefined, payloadHash: undefined }
}
export function createQuoteRepository(client: PrismaClient) {
  async function owner(transaction: Prisma.TransactionClient, actor: AuthUser) {
    const user = await transaction.user.findUnique({ where: { id: actor.id }, include: { customer: true } })
    if (!user || user.role !== 'CUSTOMER' || user.status !== 'ACTIVE' || user.sessionVersion !== (actor.sessionVersion ?? 0) || !user.customer || user.customer.status !== 'ACTIVE' || user.customerId !== actor.customerId || user.customer.accessVersion !== actor.customer?.accessVersion) throw new AppError(403, ErrorCode.FORBIDDEN, '활성 고객 회원만 견적을 요청할 수 있습니다.')
    return user.customer
  }
  async function preview(transaction: Prisma.TransactionClient, actor: AuthUser, input: QuotePreviewInput) {
    const customer = await owner(transaction, actor)
    if (input.source === 'cart') for (const item of input.items) {
      const saved = await transaction.cartItem.findFirst({ where: { id: item.cartItemId, cart: { userId: actor.id } } })
      if (!saved || saved.productId !== item.productId || saved.version !== item.expectedVersion || !saved.quantity.eq(item.quantity)) throw conflict('장바구니가 변경되었습니다. 수량을 다시 확인해 주세요.', 'CART_CHANGED')
    }
    const products = await transaction.product.findMany({ where: { id: { in: input.items.map(item => item.productId) } }, include: { asset: { include: { customer: true, images: { orderBy: { sortOrder: 'asc' } } } } } })
    const categories = await transaction.materialCategory.findMany()
    const items = input.items.map((entry, sortOrder) => {
      const product = products.find(product => product.id === entry.productId)
      if (!product) throw conflict('요청 상품을 찾을 수 없습니다.', 'INVALID_PRODUCT')
      const asset = product.asset
      const names: string[] = []
      const visited = new Set<string>()
      let category = categories.find(category => category.id === asset.categoryId)
      let enabled = !!category
      while (category) { if (!category.enabled || visited.has(category.id)) { enabled = false; break } visited.add(category.id); names.unshift(category.name); if (!category.parentId) break; category = categories.find(parent => parent.id === category!.parentId); if (!category) enabled = false }
      const quantity = new Prisma.Decimal(entry.quantity)
      if (!enabled || product.status !== 'AVAILABLE' || !product.publishedAt || asset.storageStatus !== 'STORED' || asset.saleStatus !== 'ON_SALE' || !['S', 'A', 'B'].includes(asset.grade ?? '') || asset.customer.status !== 'ACTIVE') throw conflict(`${product.name}: 현재 판매 중인 상품이 아닙니다.`, 'INVALID_PRODUCT')
      if (['EA', 'BOX', 'PIECE'].includes(asset.unit) && !quantity.isInteger()) throw new AppError(400, ErrorCode.VALIDATION_ERROR, `${product.name}: 정수 수량을 입력해 주세요.`)
      if (quantity.lt(product.minimumOrderQuantity) || quantity.gt(product.listedQuantity.minus(product.reservedQuantity).minus(product.soldQuantity))) throw conflict(`${product.name}: 최소 수량 또는 판매 가능 재고를 확인해 주세요.`, 'INVALID_QUANTITY')
      const unitPrice = product.originalUnitPrice.mul(100 - product.discountRate).div(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
      return { productId: product.id, sortOrder, name: product.name, category: names.join(' > '), grade: asset.grade!, unit: asset.unit, brand: asset.brand, specification: asset.specification, imageUrl: asset.images.map(image => publicImageUrl(image.url)).find(Boolean) ?? null, quantity: quantity.toString(), originalUnitPrice: product.originalUnitPrice.toString(), discountRate: product.discountRate, unitPrice: unitPrice.toString(), originalTotal: product.originalUnitPrice.mul(quantity).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toString(), total: unitPrice.mul(quantity).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toString() }
    })
    return { company: customer.name, items, total: items.reduce((sum, item) => sum.plus(item.total), new Prisma.Decimal(0)).toString(), originalTotal: items.reduce((sum, item) => sum.plus(item.originalTotal), new Prisma.Decimal(0)).toString(), snapshot: hash({ company: customer.name, items }) }
  }
  const transact = <T>(work: (transaction: Prisma.TransactionClient) => Promise<T>) => customerTransaction(client, work)
  return {
    preview: (actor: AuthUser, input: QuotePreviewInput) => transact(transaction => preview(transaction, actor, input)),
    create: (actor: AuthUser, input: QuoteCreateInput) => transact(async transaction => {
      await owner(transaction, actor)
      const normalized = { ...input, items: input.items.map(item => ({ ...item, quantity: new Prisma.Decimal(item.quantity).toString() })) }
      const payloadHash = hash(normalized)
      const existing = await transaction.purchaseQuote.findUnique({ where: { operationId: input.operationId }, include: quoteInclude })
      if (existing) { if (existing.customerId !== actor.customerId || existing.actorUserId !== actor.id || existing.payloadHash !== payloadHash) throw conflict('다른 요청에 사용된 접수 ID입니다.', 'OPERATION_CONFLICT'); return { quote: quotePayload(existing), replayed: true } }
      validateQuoteDate(input.deliveryDate)
      const current = await preview(transaction, actor, input)
      if (input.expectedSnapshot !== current.snapshot) return { changed: current }
      const quote = await transaction.purchaseQuote.create({ data: { code: `QUO-${new Date(Date.now() + 9 * 3600000).toISOString().slice(2, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`, customerId: actor.customerId!, actorUserId: actor.id, operationId: input.operationId, payloadHash, company: current.company, contactName: input.contact.name, phone: input.contact.phone, email: input.contact.email, address: input.address, deliveryDate: input.deliveryDate ? new Date(`${input.deliveryDate}T00:00:00Z`) : null, note: input.note, total: current.total, originalTotal: current.originalTotal, items: { create: current.items } }, include: quoteInclude })
      if (input.source === 'cart') {
        const cart = await transaction.cart.findUniqueOrThrow({ where: { userId: actor.id } })
        for (const item of input.items) if ((await transaction.cartItem.deleteMany({ where: { id: item.cartItemId, cartId: cart.id, version: item.expectedVersion, quantity: item.quantity } })).count !== 1) throw conflict('장바구니 수량이 변경되었습니다.', 'CART_CHANGED')
        await transaction.cart.update({ where: { id: cart.id }, data: { version: { increment: 1 } } })
      }
      await emitNotification(transaction, { customerId: quote.customerId, kind: 'quote.created', sourceId: quote.id, targetType: 'QUOTE', targetId: quote.id, resourceCode: quote.code })
      return { quote: quotePayload(quote), replayed: false }
    }),
    list: (actor: AuthUser, query: z.infer<typeof quoteListQuery>) => transact(async transaction => {
      await owner(transaction, actor)
      const now = new Date()
      const search = `%${query.q.replace(/[\\%_]/g, '\\$&')}%`
      const scope = Prisma.sql`FROM purchase_quotes q LEFT JOIN quote_offers o ON o.quoteId = q.id AND o.status <> 'DRAFT' AND o.sentAt IS NOT NULL AND NOT EXISTS (SELECT 1 FROM quote_offers newer WHERE newer.quoteId = q.id AND newer.status <> 'DRAFT' AND newer.sentAt IS NOT NULL AND newer.revision > o.revision) WHERE q.customerId = ${actor.customerId!} ${query.q ? Prisma.sql`AND (q.code LIKE ${search} OR q.contactName LIKE ${search} OR EXISTS (SELECT 1 FROM purchase_quote_items i WHERE i.quoteId = q.id AND i.name LIKE ${search}))` : Prisma.empty}`
      const state = Prisma.sql`CASE WHEN o.id IS NULL THEN 'WAITING' WHEN o.status = 'SENT' AND o.expiresAt IS NOT NULL AND o.expiresAt <= ${now} THEN 'EXPIRED' ELSE o.status END`
      const grouped = await transaction.$queryRaw<Array<{ status: string; count: bigint }>>(Prisma.sql`SELECT ${state} AS status, COUNT(*) AS count ${scope} GROUP BY status`)
      const summary = Object.fromEntries(['WAITING', 'SENT', 'EXPIRED', 'DECLINED', 'WITHDRAWN', 'ACCEPTED', 'SUPERSEDED'].map(status => [status, Number(grouped.find(entry => entry.status === status)?.count ?? 0)]))
      const total = query.responseStatus ? summary[query.responseStatus]! : Object.values(summary).reduce((sum, count) => sum + count, 0)
      const ids = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT q.id ${scope} ${query.responseStatus ? Prisma.sql`AND ${state} = ${query.responseStatus}` : Prisma.empty} ORDER BY q.createdAt DESC, q.id ASC LIMIT ${query.size} OFFSET ${(query.page - 1) * query.size}`)
      const records = await transaction.purchaseQuote.findMany({ where: { id: { in: ids.map(entry => entry.id) }, customerId: actor.customerId! }, include: { items: { orderBy: { sortOrder: 'asc' }, take: 1 }, offers: { where: { status: { not: 'DRAFT' }, sentAt: { not: null } }, orderBy: { revision: 'desc' }, take: 1, select: { id: true, revision: true, status: true, expiresAt: true, sentAt: true } }, order: { select: { id: true, code: true } } } })
      return { records: ids.map(entry => {
        const { offers, order, ...quote } = records.find(record => record.id === entry.id)!
        const latest = offers[0]
        return { ...quotePayload(quote), responseStatus: latest ? latest.status === 'SENT' && latest.expiresAt && latest.expiresAt <= now ? 'EXPIRED' : latest.status : 'WAITING', latestOffer: latest ? { ...latest, expiresAt: latest.expiresAt?.toISOString() ?? null, sentAt: latest.sentAt?.toISOString() ?? null } : null, order }
      }), page: query.page, size: query.size, total, summary }
    }),
    detail: (actor: AuthUser, id: string) => transact(async transaction => { await owner(transaction, actor); const quote = await transaction.purchaseQuote.findFirst({ where: { id, customerId: actor.customerId! }, include: quoteInclude }); if (!quote) throw new AppError(404, ErrorCode.NOT_FOUND, '견적 요청을 찾을 수 없습니다.'); return quotePayload(quote) })
  }
}
export type QuoteRepository = ReturnType<typeof createQuoteRepository>
export function quoteHandlers(repository: QuoteRepository) {
  const privateResponse = (context: Context) => context.header('Cache-Control', 'private, no-store')
  return {
    preview: async (context: Context) => { privateResponse(context); return success(context, await repository.preview(context.get('authUser'), quotePreviewInput.parse(await context.req.json()))) },
    create: async (context: Context) => { privateResponse(context); const result = await repository.create(context.get('authUser'), quoteCreateInput.parse(await context.req.json())); if ('changed' in result) return context.json({ success: false, error: { code: 'QUOTE_CHANGED', message: '상품 정보 또는 가격이 변경되었습니다. 최신 금액을 확인하고 다시 제출해 주세요.' }, preview: result.changed }, 409); return success(context, result, result.replayed ? 200 : 201) },
    list: async (context: Context) => { privateResponse(context); return success(context, await repository.list(context.get('authUser'), quoteListQuery.parse(context.req.query()))) },
    detail: async (context: Context) => { privateResponse(context); return success(context, await repository.detail(context.get('authUser'), z.uuid().parse(context.req.param('id')))) }
  }
}