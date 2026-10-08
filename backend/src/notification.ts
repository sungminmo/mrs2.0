import { z, type OpenAPIHono } from '@hono/zod-openapi'
import type { Context, MiddlewareHandler } from 'hono'
import type { AuthUser } from './auth.js'
import { Prisma, type PrismaClient } from './generated/prisma/client.js'
import { AppError, ErrorCode, success } from './http.js'

export const notificationTitles = {
  'receiving.created': '입고 신청이 접수되었습니다',
  'receiving.approved': '입고 신청이 승인되었습니다',
  'receiving.rejected': '입고 신청이 반려되었습니다',
  'receiving.received': '입고가 완료되어 검수를 기다리고 있습니다',
  'inspection.confirmed': '검수 결과가 도착했습니다',
  'inspection.amended': '검수 결과가 수정되었습니다',
  'inspection.acknowledged': '검수 결과 확인이 완료되었습니다',
  'disposal.consented': '폐기 대상 동의가 완료되었습니다',
  'sale.requested': '판매 요청이 접수되었습니다',
  'sale.inspected': '판매용 상세 검수가 완료되었습니다',
  'sale.approved': '판매가 승인되어 마켓에 등록되었습니다',
  'quote.created': '구매 견적 요청이 접수되었습니다',
  'offer.sent': '구매 견적 회신이 도착했습니다',
  'offer.withdrawn': '구매 견적 회신이 철회되었습니다',
  'offer.declined': '구매 견적 회신을 거절했습니다',
  'order.created': '견적 승인으로 출고 준비가 시작되었습니다',
  'shipment.dispatched': '주문 자재의 출고가 확정되었습니다',
  'shipment.delivered': '출고 건의 배송 완료가 등록되었습니다',
  'cancellation.requested': '미출고 잔량 취소가 요청되었습니다',
  'cancellation.approved': '미출고 잔량 취소가 승인되었습니다',
  'cancellation.rejected': '미출고 잔량 취소가 거절되었습니다',
  'cancellation.direct': '관리자가 미출고 잔량을 취소했습니다',
  'seller.asset.dispatched': '판매 자산의 출고 수량이 반영되었습니다',
} as const
export type NotificationKind = keyof typeof notificationTitles
const notificationKind = z.enum(Object.keys(notificationTitles) as [NotificationKind, ...NotificationKind[]])
const targetType = z.enum(['RECEIVING', 'INSPECTION', 'ASSET', 'QUOTE', 'ORDER'])
const notificationId = z.string().regex(/^[1-9]\d{0,19}$/).refine(value => BigInt(value) <= 18446744073709551615n)
const cursorSchema = z.object({ at: z.iso.datetime(), id: notificationId }).strict()
export const notificationQuery = z.object({ size: z.coerce.number().int().min(1).max(50).default(20), unreadOnly: z.enum(['true', 'false']).default('false'), cursor: z.string().min(1).max(200).optional() }).strict()
export const notificationReadInput = z.object({ ids: z.array(notificationId).min(1).max(100).refine(ids => new Set(ids).size === ids.length, '중복 알림 번호를 지정할 수 없습니다.') }).strict()
const summarySchema = z.object({ totalCount: z.number().int().nonnegative(), unreadCount: z.number().int().nonnegative(), windowDays: z.literal(90), asOf: z.iso.datetime() })
const itemSchema = z.object({ id: notificationId, kind: notificationKind, title: z.string(), description: z.string(), resourceCode: z.string(), occurredAt: z.iso.datetime(), createdAt: z.iso.datetime(), readAt: z.iso.datetime().nullable(), target: z.object({ type: targetType, id: z.string() }) })
const listSchema = z.object({ items: z.array(itemSchema), nextCursor: z.string().nullable(), hasMore: z.boolean(), windowDays: z.literal(90) })
const windowDays = 90 as const
const since = (now: Date) => new Date(now.getTime() - windowDays * 86400000)

export function decodeNotificationCursor(value?: string) {
  if (!value) return null
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('cursor')
    return cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')))
  } catch { throw new AppError(400, ErrorCode.VALIDATION_ERROR, '알림 페이지 위치가 올바르지 않습니다.') }
}

export async function emitNotification(transaction: Prisma.TransactionClient, event: { customerId: string; kind: NotificationKind; sourceId: string; targetType: z.infer<typeof targetType>; targetId: string; resourceCode?: string; description?: string }) {
  const sourceKey = `${event.kind}:${event.customerId}:${event.sourceId}`
  const data = { customerId: event.customerId, kind: event.kind, sourceKey, targetType: event.targetType, targetId: event.targetId, resourceCode: (event.resourceCode ?? event.targetId).slice(0, 80), title: notificationTitles[event.kind], description: (event.description ?? '관련 내역에서 현재 진행 상태를 확인해 주세요.').slice(0, 500) }
  return transaction.notification.upsert({ where: { sourceKey }, create: data, update: {} })
}

async function owner(transaction: Prisma.TransactionClient, user: AuthUser) {
  const actor = await transaction.user.findUnique({ where: { id: user.id }, include: { customer: true } })
  if (!actor || actor.role !== 'CUSTOMER' || actor.status !== 'ACTIVE' || !actor.customerId || actor.customerId !== user.customerId || actor.customer?.status !== 'ACTIVE' || actor.sessionVersion !== (user.sessionVersion ?? 0) || actor.customer.accessVersion !== user.customer?.accessVersion) throw new AppError(403, ErrorCode.FORBIDDEN, '활성 고객사 소속 계정이 필요합니다.')
  return actor
}

async function summary(transaction: Prisma.TransactionClient, customerId: string, userId: string, now: Date) {
  const rows = await transaction.$queryRaw<Array<{ total: bigint; unread: Prisma.Decimal | null }>>(Prisma.sql`SELECT COUNT(*) AS total, SUM(r.notificationId IS NULL) AS unread FROM notifications n LEFT JOIN notification_reads r ON r.notificationId = n.id AND r.userId = ${userId} WHERE n.customerId = ${customerId} AND n.createdAt >= ${since(now)} AND n.createdAt <= ${now}`)
  return { totalCount: Number(rows[0]?.total ?? 0), unreadCount: Number(rows[0]?.unread ?? 0), windowDays, asOf: now.toISOString() }
}

export function createNotificationRepository(client: PrismaClient) {
  return {
    summary: (user: AuthUser, now = new Date()) => client.$transaction(async transaction => { const actor = await owner(transaction, user); return summary(transaction, actor.customerId!, actor.id, now) }, { isolationLevel: 'ReadCommitted' }),
    list: (user: AuthUser, query: z.infer<typeof notificationQuery>, now = new Date()) => {
      const cursor = decodeNotificationCursor(query.cursor)
      return client.$transaction(async transaction => {
        const actor = await owner(transaction, user)
        const records = await transaction.notification.findMany({ where: { customerId: actor.customerId!, createdAt: { gte: since(now), lte: now }, ...(query.unreadOnly === 'true' ? { reads: { none: { userId: actor.id } } } : {}), ...(cursor ? { OR: [{ createdAt: { lt: new Date(cursor.at) } }, { createdAt: new Date(cursor.at), id: { lt: BigInt(cursor.id) } }] } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.size + 1, include: { reads: { where: { userId: actor.id }, select: { readAt: true } } } })
        const items = records.slice(0, query.size).map(record => itemSchema.parse({ id: record.id.toString(), kind: record.kind, title: record.title, description: record.description, resourceCode: record.resourceCode, occurredAt: record.occurredAt.toISOString(), createdAt: record.createdAt.toISOString(), readAt: record.reads[0]?.readAt.toISOString() ?? null, target: { type: record.targetType, id: record.targetId } }))
        const last = items.at(-1)
        const hasMore = records.length > query.size
        return { items, hasMore, nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ at: last.createdAt, id: last.id })).toString('base64url') : null, windowDays }
      }, { isolationLevel: 'ReadCommitted' })
    },
    read: (user: AuthUser, ids: string[], now = new Date()) => client.$transaction(async transaction => {
      const actor = await owner(transaction, user)
      const records = await transaction.notification.findMany({ where: { id: { in: ids.map(id => BigInt(id)) }, customerId: actor.customerId!, createdAt: { gte: since(now), lte: now } }, select: { id: true } })
      if (records.length !== ids.length) throw new AppError(404, ErrorCode.NOT_FOUND, '현재 고객사의 최근 알림을 찾을 수 없습니다.')
      await transaction.notificationRead.createMany({ data: records.map(record => ({ userId: actor.id, notificationId: record.id, readAt: now })), skipDuplicates: true })
      return summary(transaction, actor.customerId!, actor.id, new Date())
    }, { isolationLevel: 'ReadCommitted' }),
    readAll: (user: AuthUser, now = new Date()) => client.$transaction(async transaction => {
      const actor = await owner(transaction, user)
      await transaction.$executeRaw(Prisma.sql`INSERT INTO notification_reads (userId, notificationId, readAt) SELECT ${actor.id}, n.id, ${now} FROM notifications n WHERE n.customerId = ${actor.customerId} AND n.createdAt >= ${since(now)} AND n.createdAt <= ${now} ON DUPLICATE KEY UPDATE readAt = notification_reads.readAt`)
      return summary(transaction, actor.customerId!, actor.id, new Date())
    }, { isolationLevel: 'ReadCommitted' }),
  }
}
export type NotificationRepository = ReturnType<typeof createNotificationRepository>

async function notificationBody(context: Context) {
  try { return await context.req.json() }
  catch { throw new AppError(400, ErrorCode.VALIDATION_ERROR, '알림 요청은 올바른 JSON 형식이어야 합니다.') }
}

export function registerNotifications(app: OpenAPIHono, auth: MiddlewareHandler, repository: NotificationRepository) {
  const prefix = '/api/customer/notifications'
  app.use(prefix, async (context, next) => { await next(); context.header('Cache-Control', 'private, no-store') })
  app.use(`${prefix}/*`, async (context, next) => { await next(); context.header('Cache-Control', 'private, no-store') })
  app.get(`${prefix}/summary`, auth, async (context: Context) => { z.object({}).strict().parse(context.req.query()); return success(context, await repository.summary(context.get('authUser'))) })
  app.get(prefix, auth, async (context: Context) => success(context, await repository.list(context.get('authUser'), notificationQuery.parse(context.req.query()))))
  app.patch(`${prefix}/read`, auth, async (context: Context) => success(context, await repository.read(context.get('authUser'), notificationReadInput.parse(await notificationBody(context)).ids)))
  app.post(`${prefix}/read-all`, auth, async (context: Context) => { z.object({}).strict().parse(await notificationBody(context)); return success(context, await repository.readAll(context.get('authUser'))) })
  for (const [method, suffix, input, output] of [['get', '/summary', null, summarySchema], ['get', '', null, listSchema], ['patch', '/read', notificationReadInput, summarySchema], ['post', '/read-all', z.object({}).strict(), summarySchema]] as const) app.openAPIRegistry.registerPath({ method, path: `${prefix}${suffix}`, tags: ['Notifications'], summary: '고객사 최근 90일 업무 알림·개인별 읽음 (즉시 전달 보장 없음)', security: [{ BearerAuth: [] }], request: input ? { body: { required: true, content: { 'application/json': { schema: input } } } } : { query: suffix ? z.object({}).strict() : notificationQuery }, responses: { 200: { description: '처리 성공', content: { 'application/json': { schema: z.object({ success: z.literal(true), data: output }) } } }, 400: { description: '입력 오류' }, 401: { description: '고객 인증 필요' }, 403: { description: '고객사 접근 불가' }, 404: { description: '알림 없음 또는 타 고객사' } } })
}