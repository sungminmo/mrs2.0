import { randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Context } from 'hono'
import type { PrismaClient } from './generated/prisma/client.js'
import type { AuthUser } from './auth.js'
import { customerTransaction } from './customer.js'
import { imageOrigin, prepareImage, type ImageStorage } from './admin-images.js'
import { AppError, ErrorCode, success } from './http.js'

export const receivingTerms = {
  version: 'receiving-disposal-2026-10-02',
  text: '입고 후 검수에서 재사용 불가 판정된 자재는 당사 규정에 따라 자동 폐기 처리되며, 폐기 비용이 청구될 수 있음에 동의합니다.',
}
export const receivingInput = z.object({
  siteName: z.string().trim().min(1).max(120),
  managerName: z.string().trim().min(1).max(80),
  managerPhone: z.string().trim().min(1).max(30),
  volume: z.enum(['UNDER_ONE_TON', 'TWO_POINT_FIVE_TONS', 'FIVE_TONS_OR_MORE']),
  note: z.string().trim().max(1000).default(''),
  disposalTerms: z.literal('true'),
}).strict()
export const receivingQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(160).default(''),
  status: z.enum(['REQUESTED', 'APPROVED', 'RECEIVED', 'REJECTED', 'CANCELLED']).optional(),
}).strict()
type Input = z.infer<typeof receivingInput>
type Query = z.infer<typeof receivingQuery>
type Image = { id: string; name: string; url: string }
export const receivingDecision = z.object({ action: z.enum(['approve', 'reject']), reason: z.string().trim().min(1).max(1000) }).strict()
const imageInclude = { images: { orderBy: { sortOrder: 'asc' as const } }, history: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] } }
export function receivingDecisionSummary(history: { reason: string; createdAt: Date; changes: unknown }[]) {
  for (const entry of history.toReversed()) {
    const parsed = z.object({ status: z.object({ after: z.enum(['APPROVED', 'REJECTED']) }) }).safeParse(entry.changes)
    if (parsed.success) return { status: parsed.data.status.after, reason: entry.reason, at: entry.createdAt.toISOString() }
  }
  return null
}
function receivingPayload<T extends { history: { reason: string; createdAt: Date; changes: unknown }[] }>(record: T) {
  const { history, ...fields } = record
  return { ...fields, decision: receivingDecisionSummary(history) }
}

export function createReceivingRepository(client: PrismaClient) {
  return {
    review: (id: string, input: z.infer<typeof receivingDecision>, user: AuthUser) => customerTransaction(client, async (transaction) => {
      const actor = await transaction.user.findUnique({ where: { id: user.id } })
      if (!actor || actor.role !== 'ADMIN' || actor.status !== 'ACTIVE' || actor.sessionVersion !== (user.sessionVersion ?? 0)) throw new AppError(403, ErrorCode.FORBIDDEN, '활성 관리자 권한이 필요합니다.')
      const previous = await transaction.receiving.findUnique({ where: { id } })
      if (!previous) throw new AppError(404, ErrorCode.NOT_FOUND, '입고 신청을 찾을 수 없습니다.')
      if (previous.status !== 'REQUESTED') throw new AppError(409, ErrorCode.CONFLICT, '이미 처리된 입고 신청입니다. 최신 상태를 확인해 주세요.')
      const status = input.action === 'approve' ? 'APPROVED' : 'REJECTED'
      const changed = await transaction.receiving.updateMany({ where: { id, status: 'REQUESTED' }, data: { status } })
      if (changed.count !== 1) throw new AppError(409, ErrorCode.CONFLICT, '다른 관리자가 먼저 처리했습니다. 최신 상태를 확인해 주세요.')
      await transaction.receivingChange.create({ data: { receivingId: id, stage: 'RECEIVING', actorUserId: actor.id, reason: input.reason, changes: { status: { before: previous.status, after: status } } } })
      return transaction.receiving.findUniqueOrThrow({ where: { id }, include: imageInclude })
    }),
    create: (user: AuthUser, input: Input, images: Image[]) => customerTransaction(client, async (transaction) => {
      const current = await transaction.user.findUnique({ where: { id: user.id }, include: { customer: true } })
      if (!current || current.role !== 'CUSTOMER' || current.status !== 'ACTIVE' || !current.customerId || current.customerId !== user.customerId || current.customer?.status !== 'ACTIVE' || current.sessionVersion !== (user.sessionVersion ?? 0) || current.customer.accessVersion !== user.customer?.accessVersion) throw new AppError(403, ErrorCode.FORBIDDEN, '고객사 승인 또는 소속 확인이 필요합니다.')
      const { disposalTerms: _terms, ...fields } = input
      const receiving = await transaction.receiving.create({
        data: { ...fields, id: `REQ-${randomBytes(8).toString('hex')}`, customerId: current.customerId, channel: 'PORTAL', status: 'REQUESTED', summary: `${input.siteName} 입고 신청`, termsAgreedAt: new Date(), termsVersion: receivingTerms.version, termsText: receivingTerms.text, images: { create: images.map((image, sortOrder) => ({ ...image, sortOrder })) } },
        include: imageInclude,
      })
      await transaction.receivingChange.create({ data: { receivingId: receiving.id, stage: 'RECEIVING', actorUserId: user.id, reason: '고객 포털 입고 신청 접수', changes: { status: { before: null, after: 'REQUESTED' }, siteName: input.siteName, termsVersion: receivingTerms.version, imageCount: images.length } } })
      return receiving
    }),
    list: async (customerId: string, query: Query) => {
      const scope = { customerId, ...(query.q ? { OR: [{ id: { contains: query.q } }, { siteName: { contains: query.q } }, { managerName: { contains: query.q } }] } : {}) }
      const where = { ...scope, ...(query.status ? { status: query.status } : {}) }
      const [records, totalElements, grouped] = await client.$transaction([
        client.receiving.findMany({ where, skip: (query.page - 1) * query.size, take: query.size, orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }] }),
        client.receiving.count({ where }),
        client.receiving.groupBy({ by: ['status'], where: scope, _count: true }),
      ], { isolationLevel: 'RepeatableRead' })
      const summary = Object.fromEntries(['REQUESTED', 'APPROVED', 'RECEIVED', 'REJECTED', 'CANCELLED'].map(status => [status, grouped.find(entry => entry.status === status)?._count ?? 0]))
      return { records, totalElements, summary }
    },
    detail: (customerId: string, id: string) => client.receiving.findFirst({ where: { id, customerId }, include: imageInclude }),
  }
}
export type ReceivingRepository = ReturnType<typeof createReceivingRepository>
function owner(context: Context) {
  const user = context.get('authUser') as AuthUser
  if (!user.customerId) throw new AppError(403, ErrorCode.FORBIDDEN, '고객사 소속 확인이 필요합니다.')
  context.header('Cache-Control', 'no-store')
  return user as AuthUser & { customerId: string }
}
export function receivingHandlers(repository: ReceivingRepository, storage?: ImageStorage) {
  let active = 0
  return {
    review: async (context: Context) => {
      context.header('Cache-Control', 'no-store')
      const id = z.string().min(1).max(20).parse(context.req.param('id'))
      const input = receivingDecision.parse(await context.req.json())
      return success(context, { receiving: receivingPayload(await repository.review(id, input, context.get('authUser') as AuthUser)) })
    },
    terms: (context: Context) => { owner(context); return success(context, receivingTerms) },
    list: async (context: Context) => {
      const user = owner(context)
      const query = receivingQuery.parse(context.req.query())
      const { records, totalElements, summary } = await repository.list(user.customerId, query)
      return context.json({ data: records, meta: { page: query.page, size: query.size, totalElements, totalPages: Math.ceil(totalElements / query.size) }, summary })
    },
    detail: async (context: Context) => {
      const user = owner(context)
      const id = z.string().min(1).max(20).parse(context.req.param('id'))
      const receiving = await repository.detail(user.customerId, id)
      if (!receiving) throw new AppError(404, ErrorCode.NOT_FOUND, '입고 신청을 찾을 수 없습니다.')
      return success(context, { receiving: receivingPayload(receiving) })
    },
    create: async (context: Context) => {
      const user = owner(context)
      if (active >= 2) throw new AppError(429, ErrorCode.RATE_LIMITED, '입고 신청을 처리 중입니다. 잠시 후 다시 시도해 주세요.')
      active += 1
      const uploaded: string[] = []
      try {
        let form: FormData
        try { form = await context.req.formData() } catch { throw new AppError(400, ErrorCode.VALIDATION_ERROR, '입고 신청을 multipart/form-data로 전송해 주세요.') }
        const fields: Record<string, unknown> = {}
        for (const [key, value] of form) {
          if (key === 'photos') continue
          if (key in fields || typeof value !== 'string') throw new AppError(400, ErrorCode.VALIDATION_ERROR, '중복되거나 잘못된 신청 항목입니다.')
          fields[key] = value
        }
        const input = receivingInput.parse(fields)
        const files = form.getAll('photos')
        if (files.length > 5 || files.some((file) => !(file instanceof File))) throw new AppError(400, ErrorCode.VALIDATION_ERROR, '사진은 최대 5장까지 등록할 수 있습니다.')
        if (files.length && !storage) throw new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, '사진 저장 서비스를 사용할 수 없습니다.')
        const prepared: { file: File; body: Buffer }[] = []
        for (const file of files as File[]) prepared.push({ file, body: await prepareImage(file) })
        const images: Image[] = []
        for (const { file, body } of prepared) {
          const id = randomUUID()
          const key = `receivings/${user.customerId}/${user.id}/${id}.webp`
          uploaded.push(key)
          try { await storage!.put(key, body) } catch { throw new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, '사진 저장에 실패했습니다. 잠시 후 다시 신청해 주세요.') }
          images.push({ id, name: file.name || `${id}.webp`, url: `${imageOrigin}/${key}` })
        }
        return success(context, { receiving: receivingPayload(await repository.create(user, input, images)) }, 201)
      } catch (error) {
        for (const key of uploaded) {
          try { if (!storage?.remove) throw new Error('Cleanup unavailable'); await storage.remove(key) } catch { console.error('receiving.image.cleanup_failed') }
        }
        throw error
      } finally { active -= 1 }
    },
  }
}