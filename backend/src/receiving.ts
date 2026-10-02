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
const imageInclude = { images: { orderBy: { sortOrder: 'asc' as const } } }

export function createReceivingRepository(client: PrismaClient) {
  return {
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
      const where = { customerId, ...(query.status ? { status: query.status } : {}), ...(query.q ? { OR: [{ id: { contains: query.q } }, { siteName: { contains: query.q } }, { managerName: { contains: query.q } }] } : {}) }
      const [records, totalElements] = await client.$transaction([
        client.receiving.findMany({ where, skip: (query.page - 1) * query.size, take: query.size, orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }] }),
        client.receiving.count({ where }),
      ])
      return { records, totalElements }
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
    terms: (context: Context) => { owner(context); return success(context, receivingTerms) },
    list: async (context: Context) => {
      const user = owner(context)
      const query = receivingQuery.parse(context.req.query())
      const { records, totalElements } = await repository.list(user.customerId, query)
      return context.json({ data: records, meta: { page: query.page, size: query.size, totalElements, totalPages: Math.ceil(totalElements / query.size) } })
    },
    detail: async (context: Context) => {
      const user = owner(context)
      const id = z.string().min(1).max(20).parse(context.req.param('id'))
      const receiving = await repository.detail(user.customerId, id)
      if (!receiving) throw new AppError(404, ErrorCode.NOT_FOUND, '입고 신청을 찾을 수 없습니다.')
      return success(context, { receiving })
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
        return success(context, { receiving: await repository.create(user, input, images) }, 201)
      } catch (error) {
        for (const key of uploaded) {
          try { if (!storage?.remove) throw new Error('Cleanup unavailable'); await storage.remove(key) } catch { console.error('receiving.image.cleanup_failed') }
        }
        throw error
      } finally { active -= 1 }
    },
  }
}