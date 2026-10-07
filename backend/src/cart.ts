import { createHash } from 'node:crypto'
import { z } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { Prisma, type PrismaClient } from './generated/prisma/client.js'
import type { AuthUser } from './auth.js'
import { customerTransaction } from './customer.js'
import { publicImageUrl } from './admin-images.js'
import { AppError, ErrorCode, success } from './http.js'

export const cartQuantity = z.string().regex(/^\d+(?:\.\d{1,3})?$/).refine(value => Number(value) > 0 && Number(value) <= 1e9)
const entry = z.object({ productId: z.string().min(1).max(20), quantity: cartQuantity }).strict()
export const cartAdd = entry.extend({ operationId: z.uuid() })
export const cartSync = z.object({ operationId: z.uuid(), items: z.array(entry).min(1).max(100).refine(items => new Set(items.map(item => item.productId)).size === items.length) }).strict()
export const cartUpdate = z.object({ quantity: cartQuantity, expectedVersion: z.number().int().nonnegative() }).strict()
export const cartRemove = z.object({ items: z.array(z.object({ id: z.uuid(), expectedVersion: z.number().int().nonnegative() }).strict()).min(1).max(100) }).strict()
const conflict = () => new AppError(409, ErrorCode.CONFLICT, '장바구니가 변경되었습니다. 다시 확인해 주세요.')
const invalid = (message: string) => new AppError(400, ErrorCode.VALIDATION_ERROR, message)
const missing = () => new AppError(404, ErrorCode.NOT_FOUND, '장바구니 상품을 찾을 수 없습니다.')

export function createCartRepository(client: PrismaClient) {
  async function owner(transaction: Prisma.TransactionClient, actor: AuthUser) {
    const user = await transaction.user.findUnique({ where: { id: actor.id }, include: { customer: true } })
    if (!user || user.role !== 'CUSTOMER' || user.status !== 'ACTIVE' || user.sessionVersion !== (actor.sessionVersion ?? 0) || !user.customer || user.customer.status !== 'ACTIVE' || user.customerId !== actor.customerId || user.customer.accessVersion !== actor.customer?.accessVersion) throw new AppError(403, ErrorCode.FORBIDDEN, '활성 고객 회원만 이용할 수 있습니다.')
  }
  async function read(transaction: Prisma.TransactionClient, userId: string) {
    const cart = await transaction.cart.findUnique({ where: { userId }, include: { items: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], include: { product: { include: { asset: { include: { customer: true, category: true, images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } } } } } } } } })
    const categories = cart?.items.length ? await transaction.materialCategory.findMany() : []
    const path = (id: string) => { const names: string[] = []; const visited = new Set<string>(); let current = categories.find(category => category.id === id); while (current && !visited.has(current.id)) { visited.add(current.id); names.unshift(current.name); current = categories.find(category => category.id === current!.parentId) } return names.join(' > ') }
    const items = (cart?.items ?? []).map(item => {
      const product = item.product
      const asset = product.asset
      const available = product.listedQuantity.minus(product.reservedQuantity).minus(product.soldQuantity)
      const issues: string[] = []
      if (product.status !== 'AVAILABLE' || !product.publishedAt || asset.storageStatus !== 'STORED' || asset.saleStatus !== 'ON_SALE' || !['S', 'A', 'B'].includes(asset.grade ?? '') || asset.customer.status !== 'ACTIVE') issues.push('판매 중단')
      if (item.quantity.gt(available)) issues.push('재고 부족')
      if (item.quantity.lt(product.minimumOrderQuantity)) issues.push('최소 주문 수량 미달')
      const unitPrice = product.originalUnitPrice.mul(100 - product.discountRate).div(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
      return { id: item.id, productId: product.id, quantity: item.quantity.toString(), version: item.version, name: product.name, unit: asset.unit, grade: asset.grade, category: asset.category ? path(asset.category.id) : '', imageUrl: asset.images.map(image => publicImageUrl(image.url)).find(Boolean) ?? null, availableQuantity: available.toString(), minimumOrderQuantity: product.minimumOrderQuantity.toString(), unitPrice: unitPrice.toString(), originalUnitPrice: product.originalUnitPrice.toString(), issues, total: unitPrice.mul(item.quantity).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toString() }
    })
    return { id: cart?.id ?? null, version: cart?.version ?? 0, items }
  }
  async function transact<T>(actor: AuthUser, work: (transaction: Prisma.TransactionClient) => Promise<T>) {
    return customerTransaction(client, async transaction => { await owner(transaction, actor); return work(transaction) })
  }
  async function merge(actor: AuthUser, input: z.infer<typeof cartSync>, kind: 'ADD' | 'SYNC') {
    return transact(actor, async transaction => {
      const normalized = input.items.map(item => ({ productId: item.productId, quantity: new Prisma.Decimal(item.quantity).toString() })).sort((first, second) => first.productId.localeCompare(second.productId))
      const payloadHash = createHash('sha256').update(JSON.stringify({ kind, items: normalized })).digest('hex')
      const receipt = await transaction.cartOperation.findUnique({ where: { id: input.operationId }, include: { cart: true } })
      if (receipt) { if (receipt.cart.userId !== actor.id || receipt.payloadHash !== payloadHash) throw conflict(); return read(transaction, actor.id) }
      const cart = await transaction.cart.upsert({ where: { userId: actor.id }, create: { userId: actor.id }, update: {} })
      const existing = await transaction.cartItem.findMany({ where: { cartId: cart.id } })
      if (new Set([...existing.map(item => item.productId), ...normalized.map(item => item.productId)]).size > 100) throw invalid('장바구니는 최대 100종입니다.')
      for (const item of normalized) {
        const product = await transaction.product.findUnique({ where: { id: item.productId }, include: { asset: true } })
        if (!product || !product.publishedAt) throw missing()
        const quantity = new Prisma.Decimal(item.quantity).plus(existing.find(saved => saved.productId === item.productId)?.quantity ?? 0)
        validate(quantity, product.asset.unit)
        await transaction.cartItem.upsert({ where: { cartId_productId: { cartId: cart.id, productId: item.productId } }, create: { cartId: cart.id, productId: item.productId, quantity }, update: { quantity, version: { increment: 1 } } })
      }
      await transaction.cartOperation.create({ data: { id: input.operationId, cartId: cart.id, payloadHash } })
      await transaction.cart.update({ where: { id: cart.id }, data: { version: { increment: 1 } } })
      return read(transaction, actor.id)
    })
  }
  function validate(quantity: Prisma.Decimal, unit: string) { if (quantity.lte(0) || quantity.gt(1e9) || quantity.decimalPlaces() > 3 || (['EA', 'BOX', 'PIECE'].includes(unit) && !quantity.isInteger())) throw invalid('수량과 거래 단위를 확인해 주세요.') }
  return {
    list: (actor: AuthUser) => transact(actor, transaction => read(transaction, actor.id)),
    sync: (actor: AuthUser, input: z.infer<typeof cartSync>) => merge(actor, input, 'SYNC'),
    add: (actor: AuthUser, input: z.infer<typeof cartAdd>) => merge(actor, { operationId: input.operationId, items: [{ productId: input.productId, quantity: input.quantity }] }, 'ADD'),
    update: (actor: AuthUser, id: string, input: z.infer<typeof cartUpdate>) => transact(actor, async transaction => {
      const item = await transaction.cartItem.findFirst({ where: { id, cart: { userId: actor.id } }, include: { product: { include: { asset: true } } } })
      if (!item) throw missing()
      const quantity = new Prisma.Decimal(input.quantity)
      validate(quantity, item.product.asset.unit)
      if (item.version !== input.expectedVersion) throw conflict()
      if (!(await transaction.cartItem.updateMany({ where: { id, version: input.expectedVersion }, data: { quantity, version: { increment: 1 } } })).count) throw conflict()
      await transaction.cart.update({ where: { id: item.cartId }, data: { version: { increment: 1 } } })
      return read(transaction, actor.id)
    }),
    remove: (actor: AuthUser, input: z.infer<typeof cartRemove>) => transact(actor, async transaction => {
      const cart = await transaction.cart.findUnique({ where: { userId: actor.id } })
      if (!cart) throw missing()
      for (const target of input.items) {
        const item = await transaction.cartItem.findFirst({ where: { id: target.id, cartId: cart.id } })
        if (!item) throw missing()
        if (item.version !== target.expectedVersion) throw conflict()
        await transaction.cartItem.delete({ where: { id: item.id } })
      }
      await transaction.cart.update({ where: { id: cart.id }, data: { version: { increment: 1 } } })
      return read(transaction, actor.id)
    }),
  }
}
export type CartRepository = ReturnType<typeof createCartRepository>
export function cartHandlers(repository: CartRepository) {
  const respond = async (context: Context, work: Promise<Awaited<ReturnType<CartRepository['list']>>>) => { context.header('Cache-Control', 'private, no-store'); return success(context, await work) }
  return {
    list: (context: Context) => respond(context, repository.list(context.get('authUser'))),
    add: async (context: Context) => respond(context, repository.add(context.get('authUser'), cartAdd.parse(await context.req.json()))),
    sync: async (context: Context) => respond(context, repository.sync(context.get('authUser'), cartSync.parse(await context.req.json()))),
    update: async (context: Context) => respond(context, repository.update(context.get('authUser'), z.uuid().parse(context.req.param('id')), cartUpdate.parse(await context.req.json()))),
    remove: async (context: Context) => respond(context, repository.remove(context.get('authUser'), cartRemove.parse(await context.req.json()))),
    removeOne: async (context: Context) => respond(context, repository.remove(context.get('authUser'), { items: [{ id: z.uuid().parse(context.req.param('id')), expectedVersion: z.coerce.number().int().nonnegative().parse(context.req.query('version')) }] })),
  }
}