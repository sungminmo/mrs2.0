import { randomBytes, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import type { Context } from 'hono'
import { Prisma, ItemUnit } from './generated/prisma/client.js'
import type { PrismaClient } from './generated/prisma/client.js'
import type { AuthUser } from './auth.js'
import { customerTransaction } from './customer.js'
import { publicImageUrl } from './admin-images.js'
import { AppError, ErrorCode, success } from './http.js'

const invalid = (message: string) => new AppError(400, ErrorCode.VALIDATION_ERROR, message)
const conflict = () => new AppError(409, ErrorCode.CONFLICT, '상태가 변경되었거나 수정할 수 없습니다. 새로고침 후 확인해 주세요.')
export const inspectionReason = z.string().trim().min(1).max(500)
export const inspectionVersion = z.object({ version: z.number().int().min(0) }).strict()
export const inspectionPhoto = z.object({ id: z.uuid(), name: z.string().min(1).max(255), url: z.string().max(2048).refine((value) => publicImageUrl(value) !== null) }).strict()
const quantity = z.string().regex(/^\d{1,10}(?:\.\d{1,3})?$/).refine((value) => /^\d{1,10}(?:\.\d{1,3})?$/.test(value) && new Prisma.Decimal(value).lte(1e9), '수량은 10억 이하입니다.')
export const inspectionRow = z.object({
  id: z.uuid(), itemId: z.union([z.string().regex(/^\d{6}$/), z.literal('')]).default(''),
  name: z.string().trim().max(160), specification: z.string().trim().max(500), brand: z.string().trim().max(160).default(''),
  categoryId: z.union([z.string().regex(/^\d{6}$/), z.literal('')]), unit: z.union([z.enum(ItemUnit), z.literal('')]),
  grade: z.enum(['S', 'A', 'B', 'F', '']), received: z.union([quantity, z.literal('')]), usable: z.union([quantity, z.literal('')]), disposal: z.union([quantity, z.literal('')]),
  reason: z.string().trim().max(1000).default(''), locationId: z.string().trim().max(20).default(''), photos: z.array(inspectionPhoto).max(8).default([]),
}).strict()
export const inspectionWrite = inspectionVersion.extend({ rows: z.array(inspectionRow).max(1000), reason: inspectionReason })
export const receiveInput = z.object({ receivedAt: z.iso.datetime({ offset: true }).refine((value) => new Date(value).getTime() <= Date.now(), '미래 입고일은 사용할 수 없습니다.'), reason: inspectionReason }).strict()
export const inspectionListQuery = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), size: z.coerce.number().int().min(1).max(100).default(20), q: z.string().trim().max(160).default('') }).strict()
type Row = z.infer<typeof inspectionRow>
type Write = z.infer<typeof inspectionWrite>
type Tx = Prisma.TransactionClient
const include = { receiving: true, items: { orderBy: { sortOrder: 'asc' as const }, include: { images: { orderBy: { sortOrder: 'asc' as const } }, asset: { include: { images: { orderBy: { sortOrder: 'asc' as const } }, history: { orderBy: { id: 'asc' as const } }, product: true } } } }, disposal: { include: { items: true, costLines: true, comments: true } } }
type Report = Prisma.InspectionGetPayload<{ include: typeof include }>
const baseline = (asset: NonNullable<Report['items'][number]['asset']>) => JSON.parse(JSON.stringify(asset)) as Prisma.InputJsonValue
export const disposalConsentText = '검수 결과에 표시된 자재와 수량의 폐기에 동의합니다. 이 동의에는 비용 청구 동의가 포함되지 않습니다.'

async function administrator(tx: Tx, user: AuthUser) {
  const actor = await tx.user.findUnique({ where: { id: user.id } })
  if (!actor || actor.role !== 'ADMIN' || actor.status !== 'ACTIVE' || actor.sessionVersion !== (user.sessionVersion ?? 0)) throw new AppError(403, ErrorCode.FORBIDDEN, '활성 관리자 권한이 필요합니다.')
}
async function report(tx: Tx, id: string, version: number) {
  const current = await tx.inspection.findUnique({ where: { id }, include })
  if (!current) throw new AppError(404, ErrorCode.NOT_FOUND, '검수 결과서를 찾을 수 없습니다.')
  if (current.version !== version) throw conflict()
  return current
}
async function audit(tx: Tx, current: Report, actor: string, reason: string, action: string, changes: Prisma.InputJsonValue) {
  await tx.receivingChange.create({ data: { receivingId: current.receivingId, actorUserId: actor, stage: action === 'disposal.consent' ? 'DISPOSAL' : 'INSPECTION', reason, changes: { action, version: current.version + 1, data: changes } } })
}
function editable(current: Report) {
  return current.status === 'AWAITING_ACKNOWLEDGEMENT' && !current.acknowledgedAt && !current.disposal?.consentedAt && (!current.disposal || current.disposal.status === 'UNPROCESSED' && current.disposal.costStatus === 'UNESTIMATED' && !current.disposal.comments.length && !current.disposal.costLines.length && !current.disposal.scheduledAt && !current.disposal.completedAt && !current.disposal.evidence && current.disposal.items.every((entry) => entry.processedQuantity === null)) && current.items.every((entry) => !entry.assetId || entry.asset && entry.assetBaseline && isDeepStrictEqual(baseline(entry.asset), entry.assetBaseline))
}
function rows(current: Report): Row[] {
  return current.items.map((entry) => ({ id: entry.id, itemId: entry.itemId ?? '', name: entry.name, specification: entry.specification, brand: entry.brand, categoryId: entry.categoryId ?? '', unit: entry.unit, grade: entry.grade ?? '', received: entry.receivedQuantity.toString(), usable: entry.usableQuantity?.toString() ?? '', disposal: entry.disposalQuantity?.toString() ?? '', reason: entry.reason, locationId: entry.locationId ?? '', photos: entry.images.map((image) => ({ id: image.id, name: image.caption || '검수 사진', url: image.url })) }))
}
function payload(current: Report, admin: boolean) {
  return { id: current.id, receivingId: current.receivingId, siteName: current.receiving.siteName, customerId: current.receiving.customerId, receivedAt: current.receiving.receivedAt, status: current.status, version: current.version, inspectedAt: current.inspectedAt, acknowledgedAt: current.acknowledgedAt, consentedAt: current.disposal?.consentedAt ?? null, disposalStatus: current.disposal?.status ?? null, consentText: disposalConsentText, rows: admin && current.status === 'PENDING' && current.draftData ? current.draftData : rows(current), assets: current.items.flatMap((entry) => entry.assetId ? [{ rowId: entry.id, id: entry.assetId }] : []), ...(admin ? { editable: current.status === 'PENDING' || editable(current), editBlock: '고객 확인 또는 자산 후속 변경 이후에는 수정할 수 없습니다.' } : {}) }
}
async function validateRows(tx: Tx, input: Row[], current: Report, amend: boolean) {
  if (!input.length || !input.some((entry) => entry.usable && new Prisma.Decimal(entry.usable).gt(0))) throw invalid('재사용 가능한 자산이 한 개 이상 필요합니다. 전량 폐기 결과서는 이번에 지원하지 않습니다.')
  if (new Set(input.map((entry) => entry.id)).size !== input.length) throw invalid('중복 검수 행입니다.')
  if (amend && (input.length !== current.items.length || input.some((entry, index) => current.items[index]?.id !== entry.id))) throw invalid('확정 후 행 추가·삭제·순서 변경은 허용하지 않습니다.')
  const categories = await tx.materialCategory.findMany()
  for (const [index, entry] of input.entries()) {
    if (!entry.name || !entry.unit || !entry.grade || !entry.received || !entry.usable || !entry.disposal) throw invalid(`${index + 1}행: 필수 입력을 확인해 주세요.`)
    const received = new Prisma.Decimal(entry.received), usable = new Prisma.Decimal(entry.usable), disposal = new Prisma.Decimal(entry.disposal)
    if (!received.gt(0) || !received.eq(usable.plus(disposal)) || entry.grade === 'F' && !usable.isZero() || disposal.gt(0) && !entry.reason) throw invalid(`${index + 1}행: 수량 합계·F등급·폐기 사유를 확인해 주세요.`)
    if (['EA', 'BOX', 'PIECE'].includes(entry.unit) && [received, usable, disposal].some((value) => !value.isInteger())) throw invalid(`${index + 1}행: EA·Box·본 단위는 정수 수량입니다.`)
    const previous = current.items.find((value) => value.id === entry.id)
    if (amend && (!previous || (previous.itemId ?? '') !== entry.itemId || previous.unit !== entry.unit || Boolean(previous.assetId) !== usable.gt(0))) throw invalid('확정 후 품목·단위·재사용 여부를 변경할 수 없습니다.')
    const category = categories.find((value) => value.id === entry.categoryId)
    const parent = categories.find((value) => value.id === category?.parentId), root = categories.find((value) => value.id === parent?.parentId)
    if (entry.categoryId && (!category || !parent || !root || root.parentId || categories.some((value) => value.parentId === category.id) || !(category.enabled && parent.enabled && root.enabled) && !(amend && previous?.categoryId === entry.categoryId))) throw invalid(`${index + 1}행: 활성 3차 카테고리가 필요합니다.`)
    if (entry.itemId) {
      const item = await tx.masterItem.findUnique({ where: { id: entry.itemId } })
      if (!item || item.unit !== entry.unit || !item.enabled && !amend) throw invalid(`${index + 1}행: 사용 품목과 기준 단위를 확인해 주세요.`)
    }
    if (usable.gt(0)) {
      const location = await tx.location.findUnique({ where: { id: entry.locationId } })
      if (!location || !location.enabled && !(amend && previous?.locationId === entry.locationId)) throw invalid(`${index + 1}행: 사용 중인 로케이션이 필요합니다.`)
    }
    if (new Set(entry.photos.map((image) => image.url)).size !== entry.photos.length) throw invalid('동일 사진을 중복 등록할 수 없습니다.')
  }
}

export function createInspectionRepository(client: PrismaClient) {
  return {
    receive: (id: string, input: z.infer<typeof receiveInput>, user: AuthUser) => customerTransaction(client, async (tx) => {
      await administrator(tx, user)
      const changed = await tx.receiving.updateMany({ where: { id, status: 'APPROVED' }, data: { status: 'RECEIVED', receivedAt: new Date(input.receivedAt) } })
      if (changed.count !== 1) throw conflict()
      const created = await tx.inspection.create({ data: { id: `RCV-${randomBytes(8).toString('hex')}`, receivingId: id }, include })
      await tx.receivingChange.create({ data: { receivingId: id, actorUserId: user.id, stage: 'RECEIVING', reason: input.reason, changes: { status: { before: 'APPROVED', after: 'RECEIVED' }, receivedAt: input.receivedAt, inspectionId: created.id } } })
      return payload(created, true)
    }),
    detail: async (id: string, customerId?: string) => {
      const current = await client.inspection.findFirst({ where: { id, ...(customerId ? { receiving: { customerId }, status: { not: 'PENDING' } } : {}) }, include })
      if (!current) throw new AppError(404, ErrorCode.NOT_FOUND, '검수 결과서를 찾을 수 없습니다.')
      return payload(current, !customerId)
    },
    list: async (customerId: string, query: z.infer<typeof inspectionListQuery>) => {
      const where: Prisma.InspectionWhereInput = { receiving: { customerId }, status: { not: 'PENDING' }, ...(query.q ? { OR: [{ id: { contains: query.q } }, { receiving: { siteName: { contains: query.q } } }] } : {}) }
      const [data, totalElements] = await client.$transaction([client.inspection.findMany({ where, include: { receiving: true, disposal: true }, skip: (query.page - 1) * query.size, take: query.size, orderBy: [{ inspectedAt: 'desc' }, { id: 'asc' }] }), client.inspection.count({ where })])
      return { data: data.map((entry) => ({ id: entry.id, receivingId: entry.receivingId, siteName: entry.receiving.siteName, receivedAt: entry.receiving.receivedAt, status: entry.status, consentedAt: entry.disposal?.consentedAt ?? null })), meta: { page: query.page, size: query.size, totalElements, totalPages: Math.ceil(totalElements / query.size) } }
    },
    draft: (id: string, input: Write, user: AuthUser) => customerTransaction(client, async (tx) => {
      await administrator(tx, user)
      const current = await report(tx, id, input.version)
      if (current.status !== 'PENDING') throw conflict()
      await tx.inspection.update({ where: { id }, data: { draftData: input.rows, version: { increment: 1 } } })
      await audit(tx, current, user.id, input.reason, 'inspection.draft', { rowCount: input.rows.length })
      return payload(await tx.inspection.findUniqueOrThrow({ where: { id }, include }), true)
    }),
    save: (id: string, input: Write, user: AuthUser, amend: boolean) => customerTransaction(client, async (tx) => {
      await administrator(tx, user)
      const current = await report(tx, id, input.version)
      if (current.receiving.status !== 'RECEIVED' || (amend ? !editable(current) : current.status !== 'PENDING')) throw conflict()
      await validateRows(tx, input.rows, current, amend)
      let nextCode = 0
      const dateCode = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: '2-digit', month: '2-digit', day: '2-digit' }).format(current.receiving.receivedAt!).replaceAll('-', '')
      if (!amend) {
        const count = input.rows.filter((entry) => new Prisma.Decimal(entry.usable).gt(0)).length
        const existing = await tx.asset.findFirst({ where: { id: { startsWith: `${dateCode}-` } }, orderBy: { id: 'desc' } })
        const highest = Number(existing?.id.slice(-4) ?? 0)
        const sequence = await tx.assetSequence.upsert({ where: { dateCode }, create: { dateCode, last: highest }, update: {} })
        nextCode = Math.max(sequence.last, highest) + 1
        if (nextCode + count - 1 > 9999) throw invalid('해당 입고일의 자산번호 한도를 초과했습니다.')
        await tx.assetSequence.update({ where: { dateCode }, data: { last: nextCode + count - 1 } })
      }
      if (amend && current.disposal) {
        await tx.disposalItem.deleteMany({ where: { inspectionId: id } })
        await tx.disposal.delete({ where: { inspectionId: id } })
      }
      for (const [sortOrder, entry] of input.rows.entries()) {
        const previous = current.items.find((value) => value.id === entry.id)
        const usable = new Prisma.Decimal(entry.usable)
        const assetId = usable.gt(0) ? previous?.assetId ?? `${dateCode}-${String(nextCode++).padStart(4, '0')}` : null
        if (assetId) {
          const fields = { itemId: entry.itemId || null, categoryId: entry.categoryId || null, name: entry.name, specification: entry.specification, brand: entry.brand, grade: entry.grade as 'S' | 'A' | 'B', unit: entry.unit as ItemUnit, quantity: usable, locationId: entry.locationId }
          if (amend) {
            await tx.asset.update({ where: { id: assetId }, data: fields })
            await tx.assetImage.deleteMany({ where: { assetId } })
            await tx.assetChange.create({ data: { id: randomUUID(), assetId, reason: input.reason, changes: [['검수 결과', JSON.stringify(rows(current).find((value) => value.id === entry.id)), JSON.stringify(entry)]] } })
          } else await tx.asset.create({ data: { ...fields, id: assetId, receivingId: current.receivingId, receiptId: id, customerId: current.receiving.customerId, storageStatus: 'STORED', saleStatus: 'PENDING' } })
          if (entry.photos.length) await tx.assetImage.createMany({ data: entry.photos.map((image, index) => ({ id: randomUUID(), assetId, name: image.name, url: image.url, sortOrder: index })) })
        }
        const data = { itemId: entry.itemId || null, categoryId: entry.categoryId || null, brand: entry.brand, locationId: entry.locationId || null, name: entry.name, specification: entry.specification, unit: entry.unit as ItemUnit, grade: entry.grade as 'S' | 'A' | 'B' | 'F', receivedQuantity: entry.received, usableQuantity: entry.usable, disposalQuantity: entry.disposal, reason: entry.reason, sortOrder, assetId }
        if (amend) { await tx.inspectionItem.update({ where: { id: entry.id }, data }); await tx.inspectionItemImage.deleteMany({ where: { inspectionItemId: entry.id } }) }
        else await tx.inspectionItem.create({ data: { ...data, id: entry.id, inspectionId: id } })
        if (entry.photos.length) await tx.inspectionItemImage.createMany({ data: entry.photos.map((image, index) => ({ id: randomUUID(), inspectionItemId: entry.id, url: image.url, caption: image.name, sortOrder: index })) })
        if (assetId) {
          const asset = await tx.asset.findUniqueOrThrow({ where: { id: assetId }, include: { images: { orderBy: { sortOrder: 'asc' } }, history: { orderBy: { id: 'asc' } }, product: true } })
          await tx.inspectionItem.update({ where: { id: entry.id }, data: { assetBaseline: baseline(asset) } })
        }
      }
      const targets = input.rows.filter((entry) => new Prisma.Decimal(entry.disposal).gt(0))
      if (targets.length) await tx.disposal.create({ data: { inspectionId: id, items: { create: targets.map((entry) => ({ inspectionItemId: entry.id })) } } })
      await tx.inspection.update({ where: { id }, data: { status: 'AWAITING_ACKNOWLEDGEMENT', inspectorUserId: user.id, inspectedAt: new Date(), draftData: Prisma.DbNull, version: { increment: 1 } } })
      await audit(tx, current, user.id, input.reason, amend ? 'inspection.amend' : 'inspection.confirm', { before: rows(current), after: input.rows })
      return payload(await tx.inspection.findUniqueOrThrow({ where: { id }, include }), true)
    }, { timeout: 120_000 }),
    customerAction: (id: string, version: number, user: AuthUser, consent: boolean) => customerTransaction(client, async (tx) => {
      const actor = await tx.user.findUnique({ where: { id: user.id }, include: { customer: true } })
      if (!actor || actor.role !== 'CUSTOMER' || actor.status !== 'ACTIVE' || actor.customerRole !== 'MANAGER' || !actor.customerId || actor.customerId !== user.customerId || actor.customer?.status !== 'ACTIVE' || actor.sessionVersion !== (user.sessionVersion ?? 0) || actor.customer.accessVersion !== user.customer?.accessVersion) throw new AppError(403, ErrorCode.FORBIDDEN, '활성 고객사 MANAGER만 확인·동의할 수 있습니다.')
      const current = await tx.inspection.findFirst({ where: { id, receiving: { customerId: actor.customerId }, status: { not: 'PENDING' } }, include })
      if (!current) throw new AppError(404, ErrorCode.NOT_FOUND, '검수 결과서를 찾을 수 없습니다.')
      if (current.version !== version) throw conflict()
      if (consent) {
        if (!current.acknowledgedAt || !current.disposal) throw invalid('검수 결과 확인 후 폐기 대상에 동의할 수 있습니다.')
        if (current.disposal.consentedAt) return payload(current, false)
        await tx.disposal.update({ where: { inspectionId: id }, data: { consentedAt: new Date() } })
      } else {
        if (current.acknowledgedAt) return payload(current, false)
        await tx.inspection.update({ where: { id }, data: { status: 'COMPLETED', acknowledgedAt: new Date() } })
      }
      await tx.inspection.update({ where: { id }, data: { version: { increment: 1 } } })
      await audit(tx, current, user.id, consent ? '고객 폐기 대상 동의' : '고객 검수 결과 확인', consent ? 'disposal.consent' : 'inspection.acknowledge', consent ? { text: disposalConsentText, termsVersion: 'disposal-material-only-2026-10-02', targets: rows(current).filter((entry) => new Prisma.Decimal(entry.disposal).gt(0)) } : { status: 'COMPLETED' })
      return payload(await tx.inspection.findUniqueOrThrow({ where: { id }, include }), false)
    }),
  }
}
export type InspectionRepository = ReturnType<typeof createInspectionRepository>
export function inspectionHandlers(repository: InspectionRepository) {
  const user = (context: Context) => { context.header('Cache-Control', 'no-store'); return context.get('authUser') as AuthUser }
  const id = (context: Context) => z.string().min(1).max(20).parse(context.req.param('id'))
  return {
    receive: async (context: Context) => success(context, { inspection: await repository.receive(id(context), receiveInput.parse(await context.req.json()), user(context)) }, 201),
    detail: async (context: Context) => { user(context); return success(context, { inspection: await repository.detail(id(context)) }) },
    draft: async (context: Context) => success(context, { inspection: await repository.draft(id(context), inspectionWrite.parse(await context.req.json()), user(context)) }),
    save: (amend: boolean) => async (context: Context) => success(context, { inspection: await repository.save(id(context), inspectionWrite.parse(await context.req.json()), user(context), amend) }),
    customerDetail: async (context: Context) => success(context, { inspection: await repository.detail(id(context), user(context).customerId!) }),
    list: async (context: Context) => context.json(await repository.list(user(context).customerId!, inspectionListQuery.parse(context.req.query()))),
    customerAction: (consent: boolean) => async (context: Context) => { const input = (consent ? inspectionVersion.extend({ agreed: z.literal(true) }) : inspectionVersion).parse(await context.req.json()); return success(context, { inspection: await repository.customerAction(id(context), input.version, user(context), consent) }) },
  }
}