import { createHash, randomUUID } from 'node:crypto'
import { OpenAPIHono, z } from '@hono/zod-openapi'
import type { Context, MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { AuthUser } from './auth.js'
import { Prisma, type PrismaClient } from './generated/prisma/client.js'
import { customerTransaction } from './customer.js'
import { emitNotification, type NotificationKind } from './notification.js'
import { cartQuantity } from './cart.js'
import { enabledMarketCategoryIds } from './campaign.js'
import { publicImageUrl } from './admin-images.js'
import { quotePayload, validateQuoteDate } from './quote.js'
import { AppError, ErrorCode, success } from './http.js'

const money = z
  .string()
  .regex(/^\d{1,13}$/)
  .refine((value) => new Prisma.Decimal(value).lte('1000000000000'))
export const outboundAction = z
  .object({
    operationId: z.uuid(),
    version: z.number().int().nonnegative(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict()
export const outboundSend = outboundAction.extend({
  expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
})
export const outboundOffer = outboundAction
  .extend({
    contactName: z.string().trim().min(1).max(80),
    phone: z.string().trim().min(1).max(40),
    email: z.union([z.literal(''), z.email().max(254)]).default(''),
    address: z.string().trim().max(300),
    deliveryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    deliveryMethod: z.enum(['DELIVERY', 'SELF_PICKUP']),
    expiresAt: z.iso.datetime({ offset: true }).nullable(),
    shippingFee: money,
    note: z.string().trim().max(1000),
    items: z
      .array(
        z
          .object({
            productId: z.string().min(1).max(20),
            sourceQuoteItemId: z.uuid().nullable(),
            quantity: cartQuantity,
            unitPrice: money,
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .refine(
    (input) =>
      new Set(input.items.map((item) => item.productId)).size ===
      input.items.length,
    '상품은 중복할 수 없습니다.',
  )
export const outboundOrderAction = outboundAction.extend({
  orderVersion: z.number().int().nonnegative(),
})
export const outboundShipment = outboundOrderAction
  .extend({
    scheduledAt: z.iso.datetime({ offset: true }).nullable(),
    carrier: z.string().trim().max(160),
    vehicle: z.string().trim().max(160),
    trackingNumber: z.string().trim().max(160),
    note: z.string().trim().max(1000),
    items: z
      .array(
        z.object({ orderItemId: z.uuid(), quantity: cartQuantity }).strict(),
      )
      .min(1)
      .max(100),
  })
  .refine(
    (input) =>
      new Set(input.items.map((item) => item.orderItemId)).size ===
      input.items.length,
    '상품은 중복할 수 없습니다.',
  )
export const outboundList = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(160).default(''),
})
type ActionInput = z.infer<typeof outboundAction>
type OfferInput = z.infer<typeof outboundOffer>
type OrderAction = z.infer<typeof outboundOrderAction>
type ShipmentInput = z.infer<typeof outboundShipment>
type Transaction = Prisma.TransactionClient
const offerInclude = { items: { orderBy: { sortOrder: 'asc' as const } } }
const orderInclude = {
  offer: { include: offerInclude },
  items: {
    include: {
      offerItem: { include: { asset: { select: { locationId: true } } } },
    },
    orderBy: { id: 'asc' as const },
  },
  shipments: {
    include: { items: true },
    orderBy: { createdAt: 'desc' as const },
  },
  cancellations: {
    include: { items: true },
    orderBy: { requestedAt: 'desc' as const },
  },
}
type OfferRecord = Prisma.QuoteOfferGetPayload<{ include: typeof offerInclude }>
type OrderRecord = Prisma.PurchaseOrderGetPayload<{
  include: typeof orderInclude
}>
const remaining = (item: {
  quantity: Prisma.Decimal
  shippedQuantity: Prisma.Decimal
  cancelledQuantity: Prisma.Decimal
}) => item.quantity.minus(item.shippedQuantity).minus(item.cancelledQuantity)
const invalid = (message: string) =>
  new AppError(400, ErrorCode.VALIDATION_ERROR, message)
const missing = () =>
  new AppError(404, ErrorCode.NOT_FOUND, '견적 또는 거래를 찾을 수 없습니다.')
const conflict = (message: string, code = 'FULFILLMENT_CHANGED') =>
  new AppError(409, ErrorCode.CONFLICT, message, [{ path: '', code, message }])
const code = (prefix: string) =>
  `${prefix}-${new Date(Date.now() + 9 * 3600000).toISOString().slice(2, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`

export function offerPayload(offer: OfferRecord, admin = false) {
  return {
    id: offer.id,
    quoteId: offer.quoteId,
    revision: offer.revision,
    status: offer.status,
    version: offer.version,
    expired:
      offer.status === 'SENT' &&
      !!offer.expiresAt &&
      offer.expiresAt.getTime() <= Date.now(),
    contactName: offer.contactName,
    phone: offer.phone,
    email: offer.email,
    address: offer.address,
    deliveryDate: offer.deliveryDate?.toISOString().slice(0, 10) ?? null,
    deliveryMethod: offer.deliveryMethod,
    note: offer.note,
    expiresAt: offer.expiresAt?.toISOString() ?? null,
    sentAt: offer.sentAt?.toISOString() ?? null,
    shippingFee: offer.shippingFee.toString(),
    itemTotal: offer.itemTotal.toString(),
    grandTotal: offer.grandTotal.toString(),
    items: offer.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      sourceQuoteItemId: item.sourceQuoteItemId,
      name: item.name,
      category: item.category,
      grade: item.grade,
      unit: item.unit,
      specification: item.specification,
      brand: item.brand,
      imageUrl: item.imageUrl,
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
      total: item.total.toString(),
      ...(admin
        ? {
            assetId: item.assetId,
            sellerCustomerId: item.sellerCustomerId,
            sellerName: item.sellerName,
          }
        : {}),
    })),
  }
}
export function orderPayload(order: OrderRecord, admin = false) {
  const pending = order.cancellations.some(
    (entry) => entry.status === 'PENDING',
  )
  const hasRemaining = order.items.some((item) => remaining(item).gt(0))
  const hasShipped = order.items.some((item) => item.shippedQuantity.gt(0))
  const awaitingDelivery = order.shipments.some(
    (entry) => entry.status === 'DISPATCHED',
  )
  const cancelledItemTotal = order.items
    .reduce(
      (sum, item) =>
        sum.plus(
          item.cancelledQuantity
            .mul(item.offerItem.unitPrice)
            .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP),
        ),
      new Prisma.Decimal(0),
    )
    .toString()
  return {
    id: order.id,
    code: order.code,
    quoteId: order.quoteId,
    version: order.version,
    approvedAt: order.approvedAt.toISOString(),
    closure: order.closure,
    closedAt: order.closedAt?.toISOString() ?? null,
    state:
      order.closure ??
      (pending
        ? 'CANCELLATION_PENDING'
        : hasRemaining
          ? hasShipped
            ? 'PARTIALLY_SHIPPED'
            : 'PREPARING'
          : awaitingDelivery
            ? 'IN_DELIVERY'
            : 'COMPLETED'),
    canCancel: hasRemaining && !pending && !order.closure,
    cancelledItemTotal,
    offer: offerPayload(order.offer, admin),
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      offerItemId: item.offerItemId,
      name: item.offerItem.name,
      unit: item.offerItem.unit,
      quantity: item.quantity.toString(),
      shippedQuantity: item.shippedQuantity.toString(),
      cancelledQuantity: item.cancelledQuantity.toString(),
      remainingQuantity: remaining(item).toString(),
      ...(admin ? { assetId: item.offerItem.assetId, locationId: item.offerItem.asset.locationId } : {}),
    })),
    shipments: order.shipments
      .filter(
        (entry) => admin || ['DISPATCHED', 'DELIVERED'].includes(entry.status),
      )
      .map((entry) => ({
        id: entry.id,
        code: entry.code,
        version: entry.version,
        status: entry.status,
        scheduledAt: entry.scheduledAt?.toISOString() ?? null,
        dispatchedAt: entry.dispatchedAt?.toISOString() ?? null,
        deliveredAt: entry.deliveredAt?.toISOString() ?? null,
        deliveryMethod: entry.deliveryMethod,
        address: entry.address,
        contactName: entry.contactName,
        phone: entry.phone,
        carrier: entry.carrier,
        vehicle: entry.vehicle,
        trackingNumber: entry.trackingNumber,
        note: entry.note,
        items: entry.items.map((item) => ({
          orderItemId: item.orderItemId,
          quantity: item.quantity.toString(),
        })),
      })),
    cancellations: order.cancellations.map((entry) => ({
      id: entry.id,
      version: entry.version,
      status: entry.status,
      reason: entry.reason,
      decisionReason: entry.decisionReason,
      requestedAt: entry.requestedAt.toISOString(),
      decidedAt: entry.decidedAt?.toISOString() ?? null,
      items: entry.items.map((item) => ({
        orderItemId: item.orderItemId,
        quantity: item.quantity.toString(),
      })),
    })),
  }
}

export function createOutboundRepository(client: PrismaClient) {
  async function authorize(
    transaction: Transaction,
    actor: AuthUser,
    manager = false,
  ) {
    const user = await transaction.user.findUnique({
      where: { id: actor.id },
      include: { customer: true },
    })
    if (
      !user ||
      user.role !== actor.role ||
      user.status !== 'ACTIVE' ||
      user.sessionVersion !== (actor.sessionVersion ?? 0)
    )
      throw new AppError(
        403,
        ErrorCode.FORBIDDEN,
        '활성 계정과 현재 세션을 확인해 주세요.',
      )
    if (
      user.role === 'CUSTOMER' &&
      (!user.customer ||
        user.customer.status !== 'ACTIVE' ||
        user.customerId !== actor.customerId ||
        user.customer.accessVersion !== actor.customer?.accessVersion ||
        (manager && user.customerRole !== 'MANAGER'))
    )
      throw new AppError(
        403,
        ErrorCode.FORBIDDEN,
        manager
          ? '활성 고객사 MANAGER만 처리할 수 있습니다.'
          : '활성 고객사만 조회할 수 있습니다.',
      )
    return user
  }
  async function quoteOwner(
    transaction: Transaction,
    actor: AuthUser,
    id: string,
  ) {
    const quote = await transaction.purchaseQuote.findFirst({
      where: {
        id,
        ...(actor.role === 'CUSTOMER' ? { customerId: actor.customerId! } : {}),
      },
      include: { items: true, order: true },
    })
    if (!quote) throw missing()
    return quote
  }
  async function readOrder(
    transaction: Transaction,
    actor: AuthUser,
    id: string,
  ) {
    const order = await transaction.purchaseOrder.findFirst({
      where: {
        id,
        ...(actor.role === 'CUSTOMER' ? { customerId: actor.customerId! } : {}),
      },
      include: orderInclude,
    })
    if (!order) throw missing()
    return order
  }
  async function lockOrder(
    transaction: Transaction,
    order: OrderRecord,
    version: number,
    allowClosed = false,
  ) {
    if (
      (!allowClosed && order.closure) ||
      (
        await transaction.purchaseOrder.updateMany({
          where: { id: order.id, version },
          data: { version: { increment: 1 } },
        })
      ).count !== 1
    )
      throw conflict('거래가 변경되었거나 종료되었습니다. 다시 조회해 주세요.')
  }
  async function stockBaseline(transaction: Transaction, productId: string) {
    const product = await transaction.product.findUniqueOrThrow({
      where: { id: productId },
      include: { asset: true },
    })
    const totals = await transaction.purchaseOrderItem.aggregate({
      where: { productId },
      _sum: { quantity: true, shippedQuantity: true, cancelledQuantity: true },
    })
    const shipped = totals._sum.shippedQuantity ?? new Prisma.Decimal(0)
    const reserved = (totals._sum.quantity ?? new Prisma.Decimal(0))
      .minus(shipped)
      .minus(totals._sum.cancelledQuantity ?? 0)
    if (
      !product.reservedQuantity.eq(reserved) ||
      !product.soldQuantity.eq(shipped) ||
      product.asset.quantity.lt(
        product.listedQuantity.minus(product.soldQuantity),
      )
    )
      throw conflict(
        '재고 원장과 현재 수량이 다릅니다. 관리자 확인이 필요합니다.',
        'STOCK_LEDGER_MISMATCH',
      )
    return product
  }
  async function snapshots(
    transaction: Transaction,
    quoteId: string,
    input: OfferInput,
  ) {
    const quote = await transaction.purchaseQuote.findUniqueOrThrow({
      where: { id: quoteId },
      include: { items: true },
    })
    const categories = await transaction.materialCategory.findMany()
    const enabled = enabledMarketCategoryIds(categories)
    const products = await transaction.product.findMany({
      where: { id: { in: input.items.map((item) => item.productId) } },
      include: {
        asset: {
          include: {
            customer: true,
            images: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    })
    return input.items.map((item, sortOrder) => {
      const product = products.find((entry) => entry.id === item.productId)
      if (
        !product ||
        (item.sourceQuoteItemId &&
          !quote.items.some((entry) => entry.id === item.sourceQuoteItemId))
      )
        throw invalid('상품 또는 원 요청 항목을 확인해 주세요.')
      const asset = product.asset
      if (
        product.status !== 'AVAILABLE' ||
        !product.publishedAt ||
        asset.storageStatus !== 'STORED' ||
        asset.saleStatus !== 'ON_SALE' ||
        !['S', 'A', 'B'].includes(asset.grade) ||
        asset.customer.status !== 'ACTIVE' ||
        !enabled.includes(asset.categoryId ?? '')
      )
        throw conflict(
          `${product.name}: 판매 가능한 상품이 아닙니다.`,
          'INVALID_PRODUCT',
        )
      const quantity = new Prisma.Decimal(item.quantity)
      if (['EA', 'BOX', 'PIECE'].includes(asset.unit) && !quantity.isInteger())
        throw invalid(`${product.name}: 정수 수량을 입력해 주세요.`)
      if (quantity.lt(product.minimumOrderQuantity))
        throw invalid(`${product.name}: 최소 주문 수량을 확인해 주세요.`)
      const path: string[] = []
      let category = categories.find((entry) => entry.id === asset.categoryId)
      while (category) {
        path.unshift(category.name)
        category = categories.find((entry) => entry.id === category!.parentId)
      }
      return {
        productId: product.id,
        assetId: asset.id,
        sellerCustomerId: asset.customerId,
        sellerName: asset.customer.name,
        sourceQuoteItemId: item.sourceQuoteItemId,
        sortOrder,
        name: product.name,
        category: path.join(' > '),
        grade: asset.grade,
        unit: asset.unit,
        specification: asset.specification,
        brand: asset.brand,
        imageUrl:
          asset.images
            .map((entry) => publicImageUrl(entry.url))
            .find(Boolean) ?? null,
        quantity,
        unitPrice: new Prisma.Decimal(item.unitPrice),
        total: new Prisma.Decimal(item.unitPrice)
          .mul(quantity)
          .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP),
      }
    })
  }
  async function validateOffer(transaction: Transaction, offer: OfferRecord) {
    if (
      !offer.items.length ||
      !offer.address.trim() ||
      !offer.contactName.trim() ||
      !offer.phone.trim()
    )
      throw invalid('상품 및 납품 주소·담당자·전화를 입력해 주세요.')
    validateQuoteDate(offer.deliveryDate?.toISOString().slice(0, 10) ?? null)
    const current = await snapshots(transaction, offer.quoteId, {
      ...offer,
      operationId: randomUUID(),
      reason: '회신 검증',
      version: offer.version,
      shippingFee: offer.shippingFee.toString(),
      expiresAt: offer.expiresAt?.toISOString() ?? null,
      deliveryDate: offer.deliveryDate?.toISOString().slice(0, 10) ?? null,
      items: offer.items.map((item) => ({
        productId: item.productId,
        sourceQuoteItemId: item.sourceQuoteItemId,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
      })),
    })
    for (const item of current.sort((first, second) =>
      first.productId.localeCompare(second.productId),
    )) {
      const previous = offer.items.find(
        (entry) => entry.productId === item.productId,
      )!
      if (
        [
          'assetId',
          'sellerCustomerId',
          'unit',
          'grade',
          'specification',
          'brand',
        ].some(
          (field) =>
            String(previous[field as keyof typeof previous]) !==
            String(item[field as keyof typeof item]),
        )
      )
        throw conflict(
          '상품 정보가 변경되었습니다. 새 회신을 작성해 주세요.',
          'OFFER_CHANGED',
        )
      const product = await stockBaseline(transaction, item.productId)
      if (
        product.listedQuantity
          .minus(product.reservedQuantity)
          .minus(product.soldQuantity)
          .lt(item.quantity)
      )
        throw conflict(
          `${item.name}: 가용 재고가 부족합니다.`,
          'INSUFFICIENT_STOCK',
        )
    }
  }
  async function finish(transaction: Transaction, orderId: string) {
    const order = await transaction.purchaseOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: orderInclude,
    })
    if (
      order.items.some((item) => remaining(item).gt(0)) ||
      order.shipments.some((entry) => entry.status === 'DISPATCHED')
    )
      return
    const hasShipped = order.items.some((item) => item.shippedQuantity.gt(0))
    const hasCancelled = order.items.some((item) =>
      item.cancelledQuantity.gt(0),
    )
    await transaction.purchaseOrder.update({
      where: { id: orderId },
      data: {
        closure: !hasShipped
          ? 'CANCELLED'
          : hasCancelled
            ? 'CLOSED_PARTIAL_CANCELLED'
            : 'COMPLETED',
        closedAt: new Date(),
      },
    })
  }
  async function cancelRemainder(transaction: Transaction, order: OrderRecord) {
    for (const item of [...order.items].sort((first, second) =>
      first.productId.localeCompare(second.productId),
    )) {
      const quantity = remaining(item)
      if (quantity.lte(0)) continue
      await stockBaseline(transaction, item.productId)
      if (
        (
          await transaction.product.updateMany({
            where: { id: item.productId, reservedQuantity: { gte: quantity } },
            data: { reservedQuantity: { decrement: quantity } },
          })
        ).count !== 1
      )
        throw conflict('예약 수량을 확인해 주세요.')
      await transaction.purchaseOrderItem.update({
        where: { id: item.id },
        data: { cancelledQuantity: { increment: quantity } },
      })
    }
    await transaction.shipment.updateMany({
      where: { orderId: order.id, status: 'DRAFT' },
      data: { status: 'CANCELLED', version: { increment: 1 } },
    })
    await finish(transaction, order.id)
  }
  async function execute(
    transaction: Transaction,
    actor: AuthUser,
    action: string,
    id: string,
    input: ActionInput | OfferInput | OrderAction | ShipmentInput,
  ) {
    const customerActions = ['accept', 'decline', 'request-cancellation']
    if (
      actor.role === 'CUSTOMER'
        ? !customerActions.includes(action)
        : customerActions.includes(action)
    )
      throw new AppError(
        403,
        ErrorCode.FORBIDDEN,
        '이 작업을 수행할 수 없습니다.',
      )
    const account = await authorize(transaction, actor, action !== 'accept')
    const payloadHash = createHash('sha256')
      .update(JSON.stringify(input))
      .digest('hex')
    const receipt = await transaction.fulfillmentOperation.findUnique({
      where: { operationId: input.operationId },
    })
    if (receipt) {
      if (
        receipt.actorUserId !== actor.id ||
        receipt.action !== action ||
        receipt.targetId !== id ||
        receipt.payloadHash !== payloadHash
      )
        throw conflict(
          '다른 작업에 사용한 요청 ID입니다.',
          'OPERATION_CONFLICT',
        )
      if (actor.role === 'CUSTOMER')
        await quoteOwner(
          transaction,
          actor,
          (receipt.result as { quoteId: string }).quoteId,
        )
      return {
        ...(receipt.result as {
          quoteId: string
          offerId?: string
          orderId?: string
          shipmentId?: string
          cancellationId?: string
        }),
        replayed: true,
      }
    }
    let quoteId = ''
    let orderId: string | undefined
    let resourceId = id
    let targetType = 'OFFER'
    let before:
      ReturnType<typeof offerPayload> | ReturnType<typeof orderPayload> | null =
      null
    let result: {
      quoteId: string
      offerId?: string
      orderId?: string
      shipmentId?: string
      cancellationId?: string
    }
    if (
      [
        'create-offer',
        'update-offer',
        'delete-offer',
        'send',
        'withdraw',
        'accept',
        'decline',
      ].includes(action)
    ) {
      const initial =
        action === 'create-offer'
          ? null
          : await transaction.quoteOffer.findUnique({
              where: { id },
              include: offerInclude,
            })
      if (action !== 'create-offer' && !initial) throw missing()
      quoteId = initial?.quoteId ?? id
      await transaction.$queryRaw`SELECT id FROM purchase_quotes WHERE id = ${quoteId} FOR UPDATE`
      const quote = await quoteOwner(transaction, actor, quoteId)
      if (quote.order)
        throw conflict('이미 승인된 요청입니다. 거래 내역에서 확인해 주세요.')
      const offer = initial
        ? await transaction.quoteOffer.findUniqueOrThrow({
            where: { id },
            include: offerInclude,
          })
        : null
      before = offer ? offerPayload(offer, true) : null
      if (offer && offer.version !== input.version)
        throw conflict('회신이 변경되었습니다.', 'OFFER_CHANGED')
      if (action === 'create-offer' || action === 'update-offer') {
        if (offer && offer.status !== 'DRAFT')
          throw conflict('초안만 편집할 수 있습니다.')
        if (!offer && input.version !== 0)
          throw conflict('새 회신의 버전은 0입니다.')
        const fields = outboundOffer.parse(input)
        if (fields.deliveryDate) validateQuoteDate(fields.deliveryDate)
        const items = await snapshots(transaction, quoteId, fields)
        const itemTotal = items.reduce(
          (sum, item) => sum.plus(item.total),
          new Prisma.Decimal(0),
        )
        const data = {
          contactName: fields.contactName,
          phone: fields.phone,
          email: fields.email,
          address: fields.address,
          deliveryDate: fields.deliveryDate
            ? new Date(`${fields.deliveryDate}T00:00:00Z`)
            : null,
          deliveryMethod: fields.deliveryMethod,
          expiresAt: fields.expiresAt ? new Date(fields.expiresAt) : null,
          shippingFee: fields.shippingFee,
          note: fields.note,
          itemTotal,
          grandTotal: itemTotal.plus(fields.shippingFee),
        }
        if (offer) {
          await transaction.quoteOffer.update({
            where: { id },
            data: { ...data, version: { increment: 1 } },
          })
          await transaction.quoteOfferItem.deleteMany({
            where: { offerId: id },
          })
          await transaction.quoteOfferItem.createMany({
            data: items.map((item) => ({ ...item, offerId: id })),
          })
        } else {
          const highest = await transaction.quoteOffer.aggregate({
            where: { quoteId },
            _max: { revision: true },
          })
          resourceId = (
            await transaction.quoteOffer.create({
              data: {
                ...data,
                quoteId,
                revision: (highest._max.revision ?? 0) + 1,
                createdById: actor.id,
                items: { create: items },
              },
            })
          ).id
        }
      } else if (action === 'delete-offer') {
        if (offer!.status !== 'DRAFT')
          throw conflict('초안만 삭제할 수 있습니다.')
        await transaction.quoteOfferItem.deleteMany({ where: { offerId: id } })
        await transaction.quoteOffer.delete({ where: { id } })
      } else if (action === 'send') {
        if (offer!.status !== 'DRAFT')
          throw conflict('초안만 회신할 수 있습니다.')
        if (
          await transaction.quoteOffer.findFirst({
            where: {
              quoteId,
              revision: { gt: offer!.revision },
              sentAt: { not: null },
            },
          })
        )
          throw conflict(
            '이미 발송한 회신보다 오래된 초안입니다. 새 회신을 작성해 주세요.',
            'OFFER_CHANGED',
          )
        await validateOffer(transaction, offer!)
        const now = new Date()
        const fields = outboundSend.parse(input)
        const expiresAt =
          fields.expiresAt === undefined
            ? new Date(now.getTime() + 72 * 3600000)
            : fields.expiresAt === null
              ? null
              : new Date(fields.expiresAt)
        if (expiresAt && expiresAt <= now)
          throw conflict(
            '만료일은 회신 시점 이후로 지정해 주세요.',
            'OFFER_EXPIRED',
          )
        await transaction.quoteOffer.updateMany({
          where: { quoteId, status: 'SENT' },
          data: { status: 'SUPERSEDED', version: { increment: 1 } },
        })
        await transaction.quoteOffer.update({
          where: { id },
          data: {
            status: 'SENT',
            sentAt: now,
            expiresAt,
            sentById: actor.id,
            version: { increment: 1 },
          },
        })
      } else {
        if (offer!.status !== 'SENT')
          throw conflict('현재 회신만 처리할 수 있습니다.', 'OFFER_CHANGED')
        const latest = await transaction.quoteOffer.findFirst({
          where: { quoteId, status: 'SENT' },
          orderBy: { revision: 'desc' },
        })
        if (latest?.id !== id)
          throw conflict('최신 회신을 확인해 주세요.', 'OFFER_CHANGED')
        if (
          action !== 'withdraw' &&
          offer!.expiresAt &&
          offer!.expiresAt.getTime() <= Date.now()
        )
          throw conflict('회신이 만료되었습니다.', 'OFFER_EXPIRED')
        if (action === 'accept') {
          await validateOffer(transaction, offer!)
          for (const item of [...offer!.items].sort((first, second) =>
            first.productId.localeCompare(second.productId),
          )) {
            const product = await stockBaseline(transaction, item.productId)
            if (
              (
                await transaction.product.updateMany({
                  where: {
                    id: product.id,
                    reservedQuantity: product.reservedQuantity,
                    soldQuantity: product.soldQuantity,
                    listedQuantity: product.listedQuantity,
                  },
                  data: { reservedQuantity: { increment: item.quantity } },
                })
              ).count !== 1
            )
              throw conflict('재고가 변경되었습니다.', 'INSUFFICIENT_STOCK')
          }
          orderId = (
            await transaction.purchaseOrder.create({
              data: {
                code: code('ORD'),
                quoteId,
                offerId: id,
                customerId: account.customerId!,
                approvedById: actor.id,
                items: {
                  create: offer!.items.map((item) => ({
                    offerItemId: item.id,
                    productId: item.productId,
                    quantity: item.quantity,
                  })),
                },
              },
            })
          ).id
          await transaction.quoteOffer.update({
            where: { id },
            data: { status: 'ACCEPTED', version: { increment: 1 } },
          })
        } else
          await transaction.quoteOffer.update({
            where: { id },
            data: {
              status: action === 'withdraw' ? 'WITHDRAWN' : 'DECLINED',
              version: { increment: 1 },
            },
          })
      }
      result = { quoteId, offerId: resourceId, ...(orderId ? { orderId } : {}) }
    } else {
      const shipment = [
        'update-shipment',
        'cancel-shipment',
        'dispatch',
        'deliver',
      ].includes(action)
        ? await transaction.shipment.findUnique({
            where: { id },
            include: { items: true },
          })
        : null
      const cancellation = [
        'approve-cancellation',
        'reject-cancellation',
      ].includes(action)
        ? await transaction.orderCancellation.findUnique({
            where: { id },
            include: { items: true },
          })
        : null
      if (
        (['update-shipment', 'cancel-shipment', 'dispatch', 'deliver'].includes(
          action,
        ) &&
          !shipment) ||
        (['approve-cancellation', 'reject-cancellation'].includes(action) &&
          !cancellation)
      )
        throw missing()
      orderId = shipment?.orderId ?? cancellation?.orderId ?? id
      const order = await readOrder(transaction, actor, orderId)
      before = orderPayload(order, true)
      quoteId = order.quoteId
      const orderVersion =
        'orderVersion' in input ? input.orderVersion : input.version
      await lockOrder(transaction, order, orderVersion)
      if (shipment && shipment.version !== input.version)
        throw conflict('출고가 변경되었습니다.')
      if (cancellation && cancellation.version !== input.version)
        throw conflict('취소 요청이 변경되었습니다.')
      const pending = order.cancellations.find(
        (entry) => entry.status === 'PENDING',
      )
      if (
        pending &&
        ![
          'deliver',
          'approve-cancellation',
          'reject-cancellation',
          'cancel-shipment',
        ].includes(action)
      )
        throw conflict(
          '취소 요청 처리 중에는 출고를 진행할 수 없습니다.',
          'CANCELLATION_PENDING',
        )
      if (action === 'create-shipment' || action === 'update-shipment') {
        targetType = 'SHIPMENT'
        if (shipment && shipment.status !== 'DRAFT')
          throw conflict('출고 초안만 수정할 수 있습니다.')
        const fields = outboundShipment.parse(input)
        for (const entry of fields.items) {
          const item = order.items.find((item) => item.id === entry.orderItemId)
          if (!item) throw invalid('이 거래의 상품만 출고할 수 있습니다.')
          const allocated = order.shipments
            .filter(
              (record) =>
                record.status === 'DRAFT' && record.id !== shipment?.id,
            )
            .flatMap((record) => record.items)
            .filter((row) => row.orderItemId === item.id)
            .reduce((sum, row) => sum.plus(row.quantity), new Prisma.Decimal(0))
          const quantity = new Prisma.Decimal(entry.quantity)
          if (
            ['EA', 'BOX', 'PIECE'].includes(item.offerItem.unit) &&
            !quantity.isInteger()
          )
            throw invalid('정수 단위 상품의 출고 수량을 확인해 주세요.')
          if (quantity.plus(allocated).gt(remaining(item)))
            throw conflict(
              '잔여보다 많은 수량을 출고 초안에 배정할 수 없습니다.',
              'INVALID_SHIPMENT',
            )
        }
        const data = {
          scheduledAt: fields.scheduledAt ? new Date(fields.scheduledAt) : null,
          carrier: fields.carrier,
          vehicle: fields.vehicle,
          trackingNumber: fields.trackingNumber,
          note: fields.note,
        }
        if (shipment) {
          await transaction.shipment.update({
            where: { id },
            data: { ...data, version: { increment: 1 } },
          })
          await transaction.shipmentItem.deleteMany({
            where: { shipmentId: id },
          })
          await transaction.shipmentItem.createMany({
            data: fields.items.map((item) => ({
              ...item,
              shipmentId: id,
              orderId: order.id,
            })),
          })
        } else {
          resourceId = (
            await transaction.shipment.create({
              data: {
                ...data,
                code: code('SHP'),
                orderId: order.id,
                createdById: actor.id,
                deliveryMethod: order.offer.deliveryMethod,
                address: order.offer.address,
                contactName: order.offer.contactName,
                phone: order.offer.phone,
              },
            })
          ).id
          await transaction.shipmentItem.createMany({
            data: fields.items.map((item) => ({
              ...item,
              shipmentId: resourceId,
              orderId: order.id,
            })),
          })
        }
      } else if (action === 'dispatch') {
        targetType = 'SHIPMENT'
        if (shipment!.status !== 'DRAFT' || !shipment!.items.length)
          throw conflict('상품이 있는 출고 초안만 확정할 수 있습니다.')
        for (const entry of [...shipment!.items].sort((first, second) =>
          first.orderItemId.localeCompare(second.orderItemId),
        )) {
          const item = order.items.find(
            (item) => item.id === entry.orderItemId,
          )!
          const product = await stockBaseline(transaction, item.productId)
          const asset = product.asset
          if (
            remaining(item).lt(entry.quantity) ||
            asset.id !== item.offerItem.assetId ||
            asset.customerId !== item.offerItem.sellerCustomerId ||
            asset.unit !== item.offerItem.unit ||
            asset.grade !== item.offerItem.grade ||
            asset.specification !== item.offerItem.specification ||
            asset.brand !== item.offerItem.brand ||
            asset.storageStatus !== 'STORED' ||
            asset.quantity.lt(entry.quantity)
          )
            throw conflict(
              '승인 상품 정보 또는 예약·실물 재고를 확인해 주세요.',
              'INVALID_SHIPMENT',
            )
          if (
            (
              await transaction.product.updateMany({
                where: {
                  id: product.id,
                  reservedQuantity: { gte: entry.quantity },
                },
                data: {
                  reservedQuantity: { decrement: entry.quantity },
                  soldQuantity: { increment: entry.quantity },
                  ...(product.listedQuantity
                    .minus(product.soldQuantity)
                    .eq(entry.quantity)
                    ? { status: 'OUT_OF_STOCK' as const }
                    : {}),
                },
              })
            ).count !== 1
          )
            throw conflict('재고가 변경되었습니다.')
          const nextQuantity = asset.quantity.minus(entry.quantity)
          const noSaleStock = product.listedQuantity
            .minus(product.soldQuantity)
            .eq(entry.quantity)
          const next = await transaction.asset.update({
            where: { id: asset.id },
            data: {
              quantity: nextQuantity,
              ...(nextQuantity.isZero()
                ? {
                    storageStatus: 'RELEASED',
                    saleStatus: 'SOLD',
                    locationId: null,
                  }
                : noSaleStock
                  ? { saleStatus: 'PENDING' }
                  : {}),
            },
          })
          await transaction.purchaseOrderItem.update({
            where: { id: item.id },
            data: { shippedQuantity: { increment: entry.quantity } },
          })
          await emitNotification(transaction, { customerId: asset.customerId, kind: 'seller.asset.dispatched', sourceId: `${input.operationId}:${asset.id}`, targetType: 'ASSET', targetId: asset.id, description: `${asset.name}: 출고 ${entry.quantity.toString()} ${item.offerItem.unit}, 잔여 ${nextQuantity.toString()} ${item.offerItem.unit}` })
          await transaction.assetChange.create({
            data: {
              id: randomUUID(),
              assetId: asset.id,
              reason: `${shipment!.code} 출고: ${input.reason}`.slice(0, 500),
              changes: {
                quantity: {
                  before: asset.quantity.toString(),
                  after: next.quantity.toString(),
                },
                storageStatus: {
                  before: asset.storageStatus,
                  after: next.storageStatus,
                },
                saleStatus: {
                  before: asset.saleStatus,
                  after: next.saleStatus,
                },
                locationId: {
                  before: asset.locationId,
                  after: next.locationId,
                },
              },
            },
          })
        }
        await transaction.shipment.update({
          where: { id },
          data: {
            status: 'DISPATCHED',
            dispatchedAt: new Date(),
            dispatchedById: actor.id,
            version: { increment: 1 },
          },
        })
      } else if (action === 'deliver' || action === 'cancel-shipment') {
        targetType = 'SHIPMENT'
        if (
          shipment!.status !== (action === 'deliver' ? 'DISPATCHED' : 'DRAFT')
        )
          throw conflict('출고 상태가 변경되었습니다.')
        await transaction.shipment.update({
          where: { id },
          data:
            action === 'deliver'
              ? {
                  status: 'DELIVERED',
                  deliveredAt: new Date(),
                  deliveredById: actor.id,
                  version: { increment: 1 },
                }
              : { status: 'CANCELLED', version: { increment: 1 } },
        })
        if (action === 'deliver') await finish(transaction, order.id)
      } else if (
        action === 'request-cancellation' ||
        action === 'cancel-order'
      ) {
        targetType = 'CANCELLATION'
        const items = order.items.filter((item) => remaining(item).gt(0))
        if (pending || !items.length)
          throw conflict('취소할 잔여 수량이 없거나 이미 요청 중입니다.')
        const now = new Date()
        resourceId = (
          await transaction.orderCancellation.create({
            data: {
              orderId: order.id,
              requestedById: actor.id,
              requestedAt: now,
              reason: input.reason,
              ...(action === 'cancel-order'
                ? {
                    status: 'APPROVED',
                    decidedById: actor.id,
                    decidedAt: now,
                    decisionReason: input.reason,
                  }
                : {}),
            },
          })
        ).id
        await transaction.orderCancellationItem.createMany({
          data: items.map((item) => ({
            cancellationId: resourceId,
            orderId: order.id,
            orderItemId: item.id,
            quantity: remaining(item),
          })),
        })
        if (action === 'cancel-order') await cancelRemainder(transaction, order)
      } else if (
        action === 'approve-cancellation' ||
        action === 'reject-cancellation'
      ) {
        targetType = 'CANCELLATION'
        if (cancellation!.status !== 'PENDING' || pending?.id !== id)
          throw conflict('진행 중인 취소 요청만 처리할 수 있습니다.')
        for (const item of order.items.filter((item) => remaining(item).gt(0)))
          if (
            !cancellation!.items.some(
              (entry) =>
                entry.orderItemId === item.id &&
                entry.quantity.eq(remaining(item)),
            )
          )
            throw conflict('취소 대상 잔량이 변경되었습니다.')
        if (action === 'approve-cancellation')
          await cancelRemainder(transaction, order)
        await transaction.orderCancellation.update({
          where: { id },
          data: {
            status: action === 'approve-cancellation' ? 'APPROVED' : 'REJECTED',
            decidedById: actor.id,
            decidedAt: new Date(),
            decisionReason: input.reason,
            version: { increment: 1 },
          },
        })
      } else throw invalid('지원하지 않는 작업입니다.')
      result = {
        quoteId,
        orderId,
        ...(targetType === 'SHIPMENT'
          ? { shipmentId: resourceId }
          : { cancellationId: resourceId }),
      }
    }
    const currentOffer = !orderId
      ? await transaction.quoteOffer.findUnique({
          where: { id: resourceId },
          include: offerInclude,
        })
      : null
    const after = orderId
      ? orderPayload(await readOrder(transaction, actor, orderId), true)
      : currentOffer
        ? offerPayload(currentOffer, true)
        : null
    await transaction.fulfillmentChange.create({
      data: {
        quoteId,
        orderId,
        targetType,
        targetId: resourceId,
        actorUserId: actor.id,
        action,
        reason: input.reason,
        changes: JSON.parse(JSON.stringify({ before, after, input, result })),
      },
    })
    const notificationKinds: Record<string, NotificationKind> = { send: 'offer.sent', withdraw: 'offer.withdrawn', decline: 'offer.declined', accept: 'order.created', dispatch: 'shipment.dispatched', deliver: 'shipment.delivered', 'request-cancellation': 'cancellation.requested', 'approve-cancellation': 'cancellation.approved', 'reject-cancellation': 'cancellation.rejected', 'cancel-order': 'cancellation.direct' }
    const notificationKind = notificationKinds[action]
    if (notificationKind) {
      const quote = await transaction.purchaseQuote.findUniqueOrThrow({ where: { id: quoteId } })
      const order = orderId ? await transaction.purchaseOrder.findUniqueOrThrow({ where: { id: orderId } }) : null
      await emitNotification(transaction, { customerId: quote.customerId, kind: notificationKind, sourceId: input.operationId, targetType: order ? 'ORDER' : 'QUOTE', targetId: order?.id ?? quote.id, resourceCode: order?.code ?? quote.code })
    }
    await transaction.fulfillmentOperation.create({
      data: {
        operationId: input.operationId,
        actorUserId: actor.id,
        action,
        targetId: id,
        payloadHash,
        resultResourceId: resourceId,
        result,
      },
    })
    return { ...result, replayed: false }
  }
  return {
    command: (
      actor: AuthUser,
      action: string,
      id: string,
      input: ActionInput | OfferInput | OrderAction | ShipmentInput,
    ) =>
      customerTransaction(
        client,
        (transaction) => execute(transaction, actor, action, id, input),
        { timeout: 20000 },
      ),
    offers: (actor: AuthUser, quoteId: string) =>
      customerTransaction(client, async (transaction) => {
        await authorize(transaction, actor)
        const quote = await quoteOwner(transaction, actor, quoteId)
        const offers = await transaction.quoteOffer.findMany({
          where: {
            quoteId,
            ...(actor.role === 'CUSTOMER'
              ? { status: { not: 'DRAFT' as const } }
              : {}),
          },
          include: offerInclude,
          orderBy: { revision: 'desc' },
        })
        const { order, ...request } = quote
        return {
          quote: quotePayload(request),
          offers: offers.map((offer) =>
            offerPayload(offer, actor.role === 'ADMIN'),
          ),
          order: order
            ? orderPayload(
                await readOrder(transaction, actor, order.id),
                actor.role === 'ADMIN',
              )
            : null,
        }
      }),
    detail: (actor: AuthUser, id: string) =>
      customerTransaction(client, async (transaction) => {
        await authorize(transaction, actor)
        return orderPayload(
          await readOrder(transaction, actor, id),
          actor.role === 'ADMIN',
        )
      }),
    list: (actor: AuthUser, query: z.infer<typeof outboundList>) =>
      customerTransaction(client, async (transaction) => {
        await authorize(transaction, actor)
        const where: Prisma.PurchaseOrderWhereInput = {
          ...(actor.role === 'CUSTOMER'
            ? { customerId: actor.customerId! }
            : {}),
          ...(query.q
            ? {
                OR: [
                  { code: { contains: query.q } },
                  { quote: { code: { contains: query.q } } },
                  { offer: { contactName: { contains: query.q } } },
                ],
              }
            : {}),
        }
        const search = `%${query.q.replace(/[\\%_]/g, '\\$&')}%`
        const grouped = await transaction.$queryRaw<Array<{ state: string; count: bigint }>>(Prisma.sql`SELECT COALESCE(o.closure, CASE WHEN EXISTS (SELECT 1 FROM order_cancellations c WHERE c.orderId = o.id AND c.status = 'PENDING') THEN 'CANCELLATION_PENDING' WHEN EXISTS (SELECT 1 FROM purchase_order_items i WHERE i.orderId = o.id AND i.quantity > i.shippedQuantity + i.cancelledQuantity) THEN CASE WHEN EXISTS (SELECT 1 FROM purchase_order_items i WHERE i.orderId = o.id AND i.shippedQuantity > 0) THEN 'PARTIALLY_SHIPPED' ELSE 'PREPARING' END WHEN EXISTS (SELECT 1 FROM shipments s WHERE s.orderId = o.id AND s.status = 'DISPATCHED') THEN 'IN_DELIVERY' ELSE 'COMPLETED' END) AS state, COUNT(*) AS count FROM purchase_orders o JOIN purchase_quotes q ON q.id = o.quoteId JOIN quote_offers f ON f.id = o.offerId WHERE 1 = 1 ${actor.role === 'CUSTOMER' ? Prisma.sql`AND o.customerId = ${actor.customerId!}` : Prisma.empty} ${query.q ? Prisma.sql`AND (o.code LIKE ${search} OR q.code LIKE ${search} OR f.contactName LIKE ${search})` : Prisma.empty} GROUP BY state`)
        const summary = Object.fromEntries(['PREPARING', 'PARTIALLY_SHIPPED', 'IN_DELIVERY', 'CANCELLATION_PENDING', 'COMPLETED', 'CANCELLED', 'CLOSED_PARTIAL_CANCELLED'].map(state => [state, Number(grouped.find(entry => entry.state === state)?.count ?? 0)]))
        const [records, total] = await Promise.all([
          transaction.purchaseOrder.findMany({
            where,
            skip: (query.page - 1) * query.size,
            take: query.size,
            include: orderInclude,
            orderBy: [{ approvedAt: 'desc' }, { id: 'asc' }],
          }),
          transaction.purchaseOrder.count({ where }),
        ])
        return {
          summary,
          records: records.map((order) =>
            orderPayload(order, actor.role === 'ADMIN'),
          ),
          total,
          page: query.page,
          size: query.size,
        }
      }),
  }
}
export type OutboundRepository = ReturnType<typeof createOutboundRepository>

export function registerOutbound(
  app: OpenAPIHono,
  repository: OutboundRepository,
  customerAuth: MiddlewareHandler,
  adminAuth: MiddlewareHandler,
) {
  const routes = [
    ['post', '/api/admin/quotes/:id/offers', 'create-offer', outboundOffer],
    ['put', '/api/admin/offers/:id', 'update-offer', outboundOffer],
    ['post', '/api/admin/offers/:id/delete', 'delete-offer', outboundAction],
    ['post', '/api/admin/offers/:id/send', 'send', outboundSend],
    ['post', '/api/admin/offers/:id/withdraw', 'withdraw', outboundAction],
    ['post', '/api/customer/offers/:id/accept', 'accept', outboundAction],
    ['post', '/api/customer/offers/:id/decline', 'decline', outboundAction],
    [
      'post',
      '/api/customer/orders/:id/cancellations',
      'request-cancellation',
      outboundAction,
    ],
    ['post', '/api/admin/orders/:id/cancel', 'cancel-order', outboundAction],
    [
      'post',
      '/api/admin/orders/:id/shipments',
      'create-shipment',
      outboundShipment,
    ],
    ['put', '/api/admin/shipments/:id', 'update-shipment', outboundShipment],
    [
      'post',
      '/api/admin/shipments/:id/cancel',
      'cancel-shipment',
      outboundOrderAction,
    ],
    [
      'post',
      '/api/admin/shipments/:id/dispatch',
      'dispatch',
      outboundOrderAction,
    ],
    [
      'post',
      '/api/admin/shipments/:id/deliver',
      'deliver',
      outboundOrderAction,
    ],
    [
      'post',
      '/api/admin/cancellations/:id/approve',
      'approve-cancellation',
      outboundOrderAction,
    ],
    [
      'post',
      '/api/admin/cancellations/:id/reject',
      'reject-cancellation',
      outboundOrderAction,
    ],
  ] as const
  for (const [method, path, action, schema] of routes) {
    app.on(
      method.toUpperCase(),
      path,
      path.includes('/admin/') ? adminAuth : customerAuth,
      bodyLimit({ maxSize: 65536 }),
      async (context: Context) => {
        context.header('Cache-Control', 'private, no-store')
        return success(
          context,
          await repository.command(
            context.get('authUser'),
            action,
            z.uuid().parse(context.req.param('id')),
            schema.parse(await context.req.json()),
          ),
        )
      },
    )
    app.openAPIRegistry.registerPath({
      method,
      path: path.replace(':id', '{id}'),
      tags: ['Outbound'],
      summary: action,
      security: [{ BearerAuth: [] }],
      request: {
        params: z.object({ id: z.uuid() }),
        body: { required: true, content: { 'application/json': { schema } } },
      },
      responses: {
        200: { description: '저장 또는 동일 작업 재시도' },
        400: { description: '입력 오류' },
        401: { description: '인증 필요' },
        403: { description: '권한·활성 상태 오류' },
        404: { description: '자료 없음 또는 타 고객사' },
        409: { description: '버전·재고·만료·상태 충돌' },
      },
    })
  }
  for (const scope of ['admin', 'customer'] as const) {
    const auth = scope === 'admin' ? adminAuth : customerAuth
    app.get(
      `/api/${scope}/quotes/:id/offers`,
      auth,
      async (context: Context) => {
        context.header('Cache-Control', 'private, no-store')
        return success(
          context,
          await repository.offers(
            context.get('authUser'),
            z.uuid().parse(context.req.param('id')),
          ),
        )
      },
    )
    app.get(`/api/${scope}/orders`, auth, async (context: Context) => {
      context.header('Cache-Control', 'private, no-store')
      return success(
        context,
        await repository.list(
          context.get('authUser'),
          outboundList.parse(context.req.query()),
        ),
      )
    })
    app.get(`/api/${scope}/orders/:id`, auth, async (context: Context) => {
      context.header('Cache-Control', 'private, no-store')
      return success(context, {
        order: await repository.detail(
          context.get('authUser'),
          z.uuid().parse(context.req.param('id')),
        ),
      })
    })
    for (const path of [
      `/api/${scope}/quotes/{id}/offers`,
      `/api/${scope}/orders`,
      `/api/${scope}/orders/{id}`,
    ])
      app.openAPIRegistry.registerPath({
        method: 'get',
        path,
        tags: ['Outbound'],
        summary: '견적 회신·승인 거래·출고 내역',
        security: [{ BearerAuth: [] }],
        request: path.includes('{id}')
          ? { params: z.object({ id: z.uuid() }) }
          : { query: outboundList },
        responses: {
          200: { description: '구매 고객사 격리 조회' },
          401: { description: '인증 필요' },
          403: { description: '활성 계정 필요' },
          404: { description: '자료 없음 또는 타 고객사' },
        },
      })
  }
}
