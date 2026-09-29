import type { PrismaClient } from './generated/prisma/client.js'
import type { Context } from 'hono'
import { z } from 'zod'
import { AppError, ErrorCode, success } from './http.js'

const unit = { EA: 'EA', SET: 'Set', ROLL: '롤', BAR: '봉', SURFACE: '면', BOX: 'Box', KG: 'kg', TON: 'ton', M: 'M', M3: 'm³', PIECE: '본', PAIR: '켤레', GROUP: '조', SHEET: '장', SETUP: '식', CASE: '건', CONTAINER: '통', BUNDLE: '묶음', UNIT: '대', BAG: '포', PACK: '곽', CARTON: '갑', OTHER: '기타' } as const
type ItemUnit = keyof typeof unit
const databaseUnit = Object.fromEntries(Object.entries(unit).map(([key, value]) => [value, key])) as Record<(typeof unit)[ItemUnit], ItemUnit>
const storageStatus = { PENDING: '입고대기', STORED: '보관중', RELEASED: '출고완료' } as const
const saleStatus = { PENDING: '판매대기', ON_SALE: '판매중', SOLD: '판매완료' } as const
const productStatus = { DRAFT: '판매대기', AVAILABLE: '판매 중', OUT_OF_STOCK: '재고 없음' } as const
const receivingStatus = { REQUESTED: '입고 신청', APPROVED: '입고 승인', RECEIVED: '입고 완료', REJECTED: '입고 반려', CANCELLED: '취소' } as const
const receivingChannel = { ADMIN: '관리자 등록', WEBSITE: '홈페이지', KAKAO: '카카오톡', PORTAL: 'MRS고객포탈', OTHER: '기타' } as const
const receivingVolume = { UNDER_ONE_TON: '1톤 이하', TWO_POINT_FIVE_TONS: '2.5톤', FIVE_TONS_OR_MORE: '5톤 이상', OTHER: '기타' } as const
const inspectionStatus = { PENDING: '검수 대기', AWAITING_ACKNOWLEDGEMENT: '결과 확인 대기', COMPLETED: '검수 종료' } as const
const disposalStatus = { UNPROCESSED: '미처리', SCHEDULED: '처리 예정', COMPLETED: '폐기 완료' } as const
const itemBatchSize = 1000

function chunks<T>(values: T[]) {
  return Array.from({ length: Math.ceil(values.length / itemBatchSize) }, (_, index) => values.slice(index * itemBatchSize, (index + 1) * itemBatchSize))
}

export function createAdminDataRepository(client: PrismaClient) {
  return {
    load: async () => {
      const [categories, items, assets, receivings, inspections, products, campaigns] = await Promise.all([
        client.materialCategory.findMany({ orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }] }),
        client.masterItem.findMany({ include: { images: { orderBy: { sortOrder: 'asc' } } }, orderBy: { id: 'asc' } }),
        client.asset.findMany({ include: { images: { orderBy: { sortOrder: 'asc' } }, history: { orderBy: { createdAt: 'asc' } } }, orderBy: { id: 'asc' } }),
        client.receiving.findMany({ orderBy: { requestedAt: 'desc' } }),
        client.inspection.findMany({ include: { items: { include: { disposal: true }, orderBy: { sortOrder: 'asc' } }, disposal: true }, orderBy: { createdAt: 'desc' } }),
        client.product.findMany({ include: { asset: true }, orderBy: { id: 'asc' } }),
        client.campaign.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
      ])
      return {
        categories: categories.map((category) => ({ id: category.id, parentId: category.parentId, name: category.name, enabled: category.enabled, order: category.sortOrder })),
        items: items.map(itemPayload),
        assets: assets.map((asset) => ({ id: asset.id, itemId: asset.itemId, receivingId: asset.receivingId, customerId: asset.customerId, receiptId: asset.receiptId, locationId: asset.locationId ?? '', name: asset.name, category: asset.categoryId, brand: asset.brand, grade: asset.grade, quantity: Number(asset.quantity), unit: unit[asset.unit], appraisal: asset.appraisal === null ? null : Number(asset.appraisal), status: storageStatus[asset.storageStatus], saleStatus: saleStatus[asset.saleStatus], specification: asset.specification, images: asset.images.map((image) => ({ id: image.id, name: image.name, url: image.url })), history: asset.history.map((entry) => ({ at: entry.createdAt.toISOString(), reason: entry.reason, changes: entry.changes })) })),
        receivings: receivings.map((receiving) => ({ id: receiving.id, customerId: receiving.customerId, siteId: receiving.siteId ?? receiving.id, siteName: receiving.siteName, managerName: receiving.managerName, managerPhone: receiving.managerPhone, date: receiving.requestedAt.toISOString(), channel: receivingChannel[receiving.channel], volume: receiving.volumeDescription || receivingVolume[receiving.volume], summary: receiving.summary, status: receivingStatus[receiving.status], scheduledAt: receiving.scheduledAt?.toISOString() ?? null, termsAt: receiving.termsAgreedAt.toISOString(), estimate: receiving.transportEstimate === null ? null : Number(receiving.transportEstimate), note: receiving.note })),
        inspections: inspections.map((inspection) => ({ id: inspection.id, receivingId: inspection.receivingId, date: inspection.createdAt.toISOString(), inspectedAt: inspection.inspectedAt?.toISOString() ?? null, notifiedAt: inspection.notifiedAt?.toISOString() ?? null, status: inspectionStatus[inspection.status], acknowledgedAt: inspection.acknowledgedAt?.toISOString() ?? null, disposalStatus: inspection.disposal ? disposalStatus[inspection.disposal.status] : '판정 대기', materials: inspection.items.map((item) => ({ assetId: item.assetId, name: item.name, grade: item.grade, unit: unit[item.unit], received: Number(item.receivedQuantity), usable: item.usableQuantity === null ? null : Number(item.usableQuantity), disposal: item.disposalQuantity === null ? null : Number(item.disposalQuantity), processed: item.disposal?.processedQuantity === null || item.disposal?.processedQuantity === undefined ? null : Number(item.disposal.processedQuantity), reason: item.reason })), evidence: inspection.disposal?.evidence ?? null })),
        products: products.map((product) => ({ id: product.id, assetId: product.assetId, name: product.name, price: Number(product.originalUnitPrice), discountRate: product.discountRate, unit: unit[product.asset.unit], status: productStatus[product.status] })),
        campaigns: campaigns.map((campaign) => ({ id: campaign.id, name: campaign.name, category: campaign.categoryId, description: campaign.description, enabled: campaign.enabled, order: campaign.sortOrder, startsAt: campaign.startsAt.toISOString(), endsAt: campaign.endsAt.toISOString() })),
      }
    },
    createItems: (items: AdminItemInput[]) => client.$transaction(async (transaction) => {
      const records = items.map((item) => ({
          id: item.id,
          name: item.name,
          categoryId: item.category,
          specification: item.specification,
          brand: item.brand,
          unit: item.unit,
          inboundPrice: item.inboundPrice,
          outboundPrice: item.outboundPrice,
          standardPrice: item.standardPrice,
          enabled: item.enabled,
          note: item.note,
      }))
      for (const batch of chunks(records)) await transaction.masterItem.createMany({ data: batch })
      const images = items.flatMap((item) => item.images.map((image, sortOrder) => ({ ...image, masterItemId: item.id, sortOrder })))
      for (const batch of chunks(images)) await transaction.masterItemImage.createMany({ data: batch })
      const created = []
      for (const ids of chunks(items.map((item) => item.id))) created.push(...await transaction.masterItem.findMany({ where: { id: { in: ids } }, include: { images: { orderBy: { sortOrder: 'asc' } } } }))
      const byId = new Map(created.map((item) => [item.id, item]))
      return items.map((item) => itemPayload(byId.get(item.id)!))
    }, { maxWait: 10_000, timeout: 120_000 }),
    saveCategory: (category: AdminCategoryInput) => client.$transaction(async (transaction) => {
      const categories = await transaction.materialCategory.findMany({ select: { id: true, parentId: true, name: true, enabled: true, sortOrder: true } })
      validateCategory(category, categories)
      const saved = await transaction.materialCategory.upsert({
        where: { id: category.id },
        create: { id: category.id, parentId: category.parentId, name: category.name, enabled: category.enabled, sortOrder: category.order },
        update: { name: category.name, enabled: category.enabled, sortOrder: category.order },
      })
      return categoryPayload(saved)
    }),
  }
}

export type AdminDataRepository = ReturnType<typeof createAdminDataRepository>

export function loadAdminData(repository: AdminDataRepository) {
  return async (context: Context) => success(context, await repository.load())
}

const imageInput = z.object({ id: z.uuid(), name: z.string().trim().min(1).max(255), url: z.string().min(1).max(7_000_000) })
const itemUnit = z.enum(Object.values(unit) as [(typeof unit)[ItemUnit], ...(typeof unit)[ItemUnit][]])
const itemInput = z.object({
  id: z.string().regex(/^\d{6}$/),
  name: z.string().trim().max(160),
  category: z.union([z.string().regex(/^\d{6}$/), z.literal('')]).transform((value) => value || null),
  specification: z.string().trim().max(255),
  brand: z.string().trim().max(160),
  unit: z.union([itemUnit, z.literal('')]).transform((value) => value ? databaseUnit[value] : null),
  inboundPrice: z.number().min(0).max(1e12).nullable(),
  outboundPrice: z.number().min(0).max(1e12).nullable(),
  standardPrice: z.number().min(0).max(1e12).nullable(),
  enabled: z.boolean(),
  note: z.string().trim().max(65535),
  images: z.array(imageInput).max(1),
})

const categoryInput = z.object({
  parentId: z.string().regex(/^\d{6}$/).nullable(),
  name: z.string().trim().min(1).max(80),
  enabled: z.boolean(),
  order: z.number().int().min(0).max(9999),
})

type AdminItemInput = z.output<typeof itemInput>
type AdminCategoryInput = z.output<typeof categoryInput> & { id: string }

function itemPayload(item: { id: string; name: string; categoryId: string | null; specification: string; brand: string; unit: ItemUnit | null; inboundPrice: { toString(): string } | number | null; outboundPrice: { toString(): string } | number | null; standardPrice: { toString(): string } | number | null; enabled: boolean; note: string; images: { id: string; name: string; url: string }[] }) {
  return { id: item.id, name: item.name, category: item.categoryId ?? '', specification: item.specification, brand: item.brand, unit: item.unit ? unit[item.unit] : '', inboundPrice: item.inboundPrice === null ? null : Number(item.inboundPrice), outboundPrice: item.outboundPrice === null ? null : Number(item.outboundPrice), standardPrice: item.standardPrice === null ? null : Number(item.standardPrice), enabled: item.enabled, note: item.note, images: item.images.map((image) => ({ id: image.id, name: image.name, url: image.url })) }
}

function categoryPayload(category: { id: string; parentId: string | null; name: string; enabled: boolean; sortOrder: number }) {
  return { id: category.id, parentId: category.parentId, name: category.name, enabled: category.enabled, order: category.sortOrder }
}

function validateCategory(category: AdminCategoryInput, categories: { id: string; parentId: string | null; name: string; enabled: boolean; sortOrder: number }[]) {
  const existing = categories.find((entry) => entry.id === category.id)
  if (existing && existing.parentId !== category.parentId) throw new Error('등록된 카테고리의 상위 분류는 변경할 수 없습니다.')
  if (categories.some((entry) => entry.id !== category.id && entry.parentId === category.parentId && entry.name.trim().toLocaleLowerCase('ko-KR') === category.name.toLocaleLowerCase('ko-KR'))) throw new Error('같은 상위 분류에 동일한 이름이 있습니다.')
  const parent = category.parentId ? categories.find((entry) => entry.id === category.parentId) : null
  if (category.parentId && !parent) throw new Error('상위 카테고리를 찾을 수 없습니다.')
  const grandparent = parent?.parentId ? categories.find((entry) => entry.id === parent.parentId) : null
  if (parent?.parentId && !grandparent || grandparent?.parentId) throw new Error('카테고리는 최대 3차까지 생성할 수 있습니다.')
  if (!parent && !/^\d{2}0000$/.test(category.id)) throw new Error('대분류 코드 형식이 올바르지 않습니다.')
  if (parent && !grandparent && (category.id.slice(0, 2) !== parent.id.slice(0, 2) || !category.id.endsWith('00'))) throw new Error('중분류 코드 형식이 올바르지 않습니다.')
  if (parent && grandparent && category.id.slice(0, 4) !== parent.id.slice(0, 4)) throw new Error('소분류 코드 형식이 올바르지 않습니다.')
  const parentEnabled = parent?.enabled && (!grandparent || grandparent.enabled)
  if (category.enabled && parent && !parentEnabled && !(existing?.enabled && existing.parentId === category.parentId)) throw new Error('미사용 상위 분류 아래에 사용 카테고리를 저장할 수 없습니다.')
}

export function createAdminItems(repository: AdminDataRepository) {
  return async (context: Context) => {
    const input = z.object({ items: z.array(itemInput).min(1).max(50_000) }).parse(await context.req.json())
    if (new Set(input.items.map((item) => item.id)).size !== input.items.length) throw new AppError(409, ErrorCode.CONFLICT, '요청에 중복된 품목코드가 포함되어 있습니다.')
    try {
      return success(context, { items: await repository.createItems(input.items) }, 201)
    } catch {
      throw new AppError(409, ErrorCode.CONFLICT, '품목을 등록하지 못했습니다. 품목코드, 카테고리 및 중복 데이터를 확인해 주세요.')
    }
  }
}

export function saveAdminCategory(repository: AdminDataRepository) {
  return async (context: Context) => {
    const id = z.string().regex(/^\d{6}$/).parse(context.req.param('id'))
    const input = categoryInput.parse(await context.req.json())
    try {
      return success(context, { category: await repository.saveCategory({ id, ...input }) })
    } catch {
      throw new AppError(409, ErrorCode.CONFLICT, '카테고리를 저장하지 못했습니다. 코드, 상위 분류 및 중복 이름을 확인해 주세요.')
    }
  }
}