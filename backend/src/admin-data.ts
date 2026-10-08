import { randomUUID } from 'node:crypto'
import { customerTransaction } from './customer.js'
import { emitNotification } from './notification.js'
import { publicImageUrl } from './admin-images.js'
import { receivingDecisionSummary } from './receiving.js'
import { campaignInclude, campaignPayload, enabledMarketCategoryIds } from './campaign.js'
import type { PrismaClient, Prisma } from './generated/prisma/client.js'
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

export const adminDataQuery = z.object({
  scope: z.enum(['items', 'assets', 'locations', 'receivings', 'inspections', 'disposals', 'sales', 'products', 'quotes', 'campaigns', 'categories', 'dashboard']).default('items'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  rows: z.coerce.number().int().min(1).max(100).default(25),
  id: z.string().max(80).optional(), q: z.string().max(160).default(''),
  status: z.string().max(40).default(''), customer: z.string().max(80).default(''),
  category: z.string().regex(/^\d{6}$/).optional(), grade: z.enum(['S', 'A', 'B', 'F']).optional(),
  saleStatus: z.string().max(40).optional(), itemId: z.string().max(6).optional(), locationId: z.string().max(80).optional(),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(), sort: z.enum(['recent', 'name']).default('recent'),
})
type AdminDataQuery = z.infer<typeof adminDataQuery>
const enumKey = <T extends Record<string, string>>(values: T, value: string) => Object.keys(values).find((key) => values[key] === value) as keyof T | undefined

function chunks<T>(values: T[]) {
  return Array.from({ length: Math.ceil(values.length / itemBatchSize) }, (_, index) => values.slice(index * itemBatchSize, (index + 1) * itemBatchSize))
}

export function createAdminDataRepository(client: PrismaClient) {
  return {
    load: async (query: AdminDataQuery = adminDataQuery.parse({})) => {
      const { scope, page, rows, id, q, status, customer, category } = query
      const categories = await client.materialCategory.findMany({ orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }] })
      const descendants = category ? [category] : []
      for (let index = 0; index < descendants.length; index++) for (const entry of categories) if (entry.parentId === descendants[index] && !descendants.includes(entry.id)) descendants.push(entry.id)
      const categoryWhere = category ? { categoryId: { in: descendants } } : {}
      const search = q.trim() ? { OR: [{ id: { contains: q.trim() } }, { name: { contains: q.trim() } }] } : {}
      const dates = query.period ? { gte: new Date(`${query.period}-01T00:00:00Z`), lt: new Date(Date.UTC(Number(query.period.slice(0, 4)), Number(query.period.slice(5)), 1)) } : undefined
      if (scope === 'quotes') {
        const where: Prisma.PurchaseQuoteWhereInput = id ? { id } : { ...(customer ? { customerId: customer } : {}), ...(dates ? { createdAt: dates } : {}), ...(status && status !== '접수 완료' ? { id: 'no-matching-status' } : {}), ...(q.trim() ? { OR: [{ code: { contains: q.trim() } }, { company: { contains: q.trim() } }, { contactName: { contains: q.trim() } }, { items: { some: { name: { contains: q.trim() } } } }] } : {}) }
        const records = await client.purchaseQuote.findMany({ where, skip: id ? 0 : (page - 1) * rows, take: id ? 1 : rows, include: { items: { orderBy: { sortOrder: 'asc' }, take: id ? 100 : 0 }, _count: { select: { items: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] })
        const customers = await client.customer.findMany({ where: { id: { in: records.map(record => record.customerId) } }, select: { id: true, name: true, representativeName: true, phone: true, status: true } })
        return { categories: categories.map(category => ({ id: category.id, parentId: category.parentId, name: category.name, enabled: category.enabled, order: category.sortOrder })), items: [], assets: [], receivings: [], inspections: [], products: [], campaigns: [], sales: [], locations: [], customers, pagination: { page, rows, total: await client.purchaseQuote.count({ where }) }, quotes: records.map(record => ({ id: record.id, code: record.code, customerId: record.customerId, company: record.company, contactName: record.contactName, phone: record.phone, email: record.email, actorUserId: record.actorUserId, date: record.createdAt.toISOString(), dueAt: record.deliveryDate?.toISOString().slice(0, 10) ?? '', status: '접수 완료', itemCount: record._count.items, total: record.total.toString(), address: record.address, note: record.note, lines: record.items.map(item => ({ productId: item.productId, name: item.name, quantity: item.quantity.toString(), unit: item.unit, unitPrice: item.unitPrice.toString(), total: item.total.toString(), category: item.category, grade: item.grade, specification: item.specification })) })) }
      }
      const itemWhere: Prisma.MasterItemWhereInput = id ? { id } : { ...search, ...categoryWhere, ...(status ? { enabled: status === '사용' } : {}) }
      const assetWhere: Prisma.AssetWhereInput = id ? { id } : { ...search, ...categoryWhere, ...(customer ? { customerId: customer } : {}), ...(status ? { storageStatus: enumKey(storageStatus, status) ?? 'PENDING' } : {}), ...(query.saleStatus ? { saleStatus: enumKey(saleStatus, query.saleStatus) ?? 'PENDING' } : {}), ...(query.grade ? { grade: query.grade } : {}), ...(query.itemId ? { itemId: query.itemId } : {}), ...(query.locationId ? { locationId: query.locationId } : {}), ...(dates ? { createdAt: dates } : {}) }
      const receivingWhere: Prisma.ReceivingWhereInput = id ? { id } : { ...(q.trim() ? { OR: [{ id: { contains: q.trim() } }, { summary: { contains: q.trim() } }, { siteName: { contains: q.trim() } }] } : {}), ...(customer ? { customerId: customer } : {}), ...(status ? { status: enumKey(receivingStatus, status) ?? 'REQUESTED' } : {}), ...(dates ? { requestedAt: dates } : {}) }
      const inspectionWhere: Prisma.InspectionWhereInput = { ...(id ? { id } : { ...(q.trim() ? { OR: [{ id: { contains: q.trim() } }, { receivingId: { contains: q.trim() } }] } : {}), ...(customer ? { receiving: { customerId: customer } } : {}), ...(dates ? { createdAt: dates } : {}), ...(scope === 'inspections' && status ? { status: enumKey(inspectionStatus, status) ?? 'PENDING' } : {}) }), ...(scope === 'disposals' ? { items: { some: { disposalQuantity: { gt: 0 } } }, ...(status ? { disposal: { status: enumKey(disposalStatus, status) ?? 'UNPROCESSED' } } : {}) } : {}) }
      const productWhere: Prisma.ProductWhereInput = id ? { id } : { ...search, ...(status ? { status: enumKey(productStatus, status) ?? 'DRAFT' } : {}), ...(category || customer ? { asset: { ...categoryWhere, ...(customer ? { customerId: customer } : {}) } } : {}) }
      const now = new Date()
      const campaignWhere: Prisma.CampaignWhereInput = id ? { id } : { ...search, ...(dates ? { startsAt: dates } : {}), ...(status ? status === '중지' ? { enabled: false } : { enabled: true, ...(status === '예약' ? { startsAt: { gt: now } } : status === '종료' ? { endsAt: { lte: now } } : { startsAt: { lte: now }, endsAt: { gt: now } }) } : {}) }
      const paging = { skip: id ? 0 : (page - 1) * rows, take: id ? 1 : rows }
      const saleLabels = { PENDING: '승인 대기', APPROVED: '승인 완료', REJECTED: '반려' } as const
      const salesWhere: Prisma.SaleRequestWhereInput = id ? { id } : { ...(q.trim() ? { OR: [{ id: { contains: q.trim() } }, { asset: { name: { contains: q.trim() } } }] } : {}), ...(status ? { status: enumKey(saleLabels, status) ?? 'PENDING' } : {}), ...(customer ? { asset: { customerId: customer } } : {}), ...(dates ? { createdAt: dates } : {}) }
      const sales = scope === 'sales' ? await client.saleRequest.findMany({ where: salesWhere, ...paging, orderBy: query.sort === 'name' ? [{ asset: { name: 'asc' } }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'asc' }] }) : []
      const locationAssets = scope === 'locations' && id ? await client.asset.findMany({ where: { locationId: id, storageStatus: 'STORED', quantity: { gt: 0 } }, skip: (page - 1) * rows, take: rows, include: { images: { take: 0 }, history: { take: 0 } }, orderBy: { id: 'asc' } }) : []
      const locationWhere = id ? { id } : { ...search, ...(status ? { enabled: status === '사용' } : {}) }
      const locations = scope === 'locations' || scope === 'assets' && id ? await client.location.findMany({ where: scope === 'locations' ? locationWhere : { OR: [{ enabled: true }, { assets: { some: { id } } }] }, ...(scope === 'locations' ? paging : {}), include: { _count: { select: { assets: { where: { storageStatus: 'STORED', quantity: { gt: 0 } } } } } }, orderBy: { id: 'asc' } }) : []
      const [items, pageAssets, pageReceivings, inspections, products, campaigns] = await Promise.all([
        scope === 'items' ? client.masterItem.findMany({ where: itemWhere, ...paging, include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } }, orderBy: query.sort === 'name' ? [{ name: 'asc' }, { id: 'asc' }] : { id: 'asc' } }) : [],
        scope === 'assets' ? client.asset.findMany({ where: assetWhere, ...paging, include: { images: { orderBy: { sortOrder: 'asc' }, take: id ? 8 : 1 }, history: { orderBy: { createdAt: 'asc' }, take: id ? 100 : 0 } }, orderBy: query.sort === 'name' ? [{ name: 'asc' }, { id: 'asc' }] : { id: 'asc' } }) : [],
        scope === 'receivings' || scope === 'dashboard' ? client.receiving.findMany({ where: scope === 'dashboard' ? { status: { in: ['REQUESTED', 'APPROVED'] } } : receivingWhere, ...(scope === 'dashboard' ? { skip: 0, take: 10 } : paging), include: { images: { orderBy: { sortOrder: 'asc' }, take: scope === 'receivings' && id ? 5 : 0 }, history: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: scope === 'receivings' && id ? undefined : 0 } }, orderBy: query.sort === 'name' ? [{ summary: 'asc' }, { id: 'asc' }] : [{ requestedAt: 'desc' }, { id: 'asc' }] }) : [],
        scope === 'inspections' || scope === 'disposals' ? client.inspection.findMany({ where: inspectionWhere, ...paging, include: { items: { include: { disposal: true }, orderBy: { sortOrder: 'asc' } }, disposal: true }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] }) : [],
        scope === 'products' ? client.product.findMany({ where: productWhere, ...paging, include: { asset: true }, orderBy: query.sort === 'name' ? [{ name: 'asc' }, { id: 'asc' }] : { id: 'asc' } }) : [],
        scope === 'campaigns' || scope === 'dashboard' ? client.campaign.findMany({ where: campaignWhere, ...(scope === 'dashboard' ? { skip: 0, take: 5 } : paging), include: campaignInclude, orderBy: query.sort === 'name' ? [{ name: 'asc' }, { id: 'asc' }] : [{ sortOrder: 'asc' }, { id: 'asc' }] }) : [],
      ])
      const assets = scope === 'products' || scope === 'sales' ? await client.asset.findMany({ where: { id: { in: scope === 'sales' ? sales.map((request) => request.assetId) : products.map((product) => product.assetId) } }, include: { images: { take: 0 }, history: { take: 0 } } }) : scope === 'locations' ? locationAssets : pageAssets
      const receivings = scope === 'inspections' || scope === 'disposals' ? await client.receiving.findMany({ where: { id: { in: inspections.map((inspection) => inspection.receivingId) } }, include: { images: { take: 0 }, history: { take: 0 } } }) : pageReceivings
      const customerIds = [...new Set([...assets.map((asset) => asset.customerId), ...receivings.map((receiving) => receiving.customerId)])]
      const customers = customerIds.length ? await client.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true, representativeName: true, phone: true, status: true } }) : []
      const metrics = scope === 'dashboard' ? {
        'receiving/requests': await client.receiving.count({ where: { status: 'REQUESTED' } }),
        'receiving/primary': await client.inspection.count({ where: { status: 'PENDING' } }),
      } : undefined
      const total = await (scope === 'sales' ? client.saleRequest.count({ where: salesWhere }) : scope === 'locations' ? client.location.count({ where: locationWhere }) : scope === 'items' ? client.masterItem.count({ where: itemWhere }) : scope === 'assets' ? client.asset.count({ where: assetWhere }) : scope === 'receivings' ? client.receiving.count({ where: receivingWhere }) : scope === 'inspections' || scope === 'disposals' ? client.inspection.count({ where: inspectionWhere }) : scope === 'products' ? client.product.count({ where: productWhere }) : scope === 'campaigns' ? client.campaign.count({ where: campaignWhere }) : Promise.resolve(categories.length))
      const categoryIds = scope === 'categories' && id ? [id] : []
      for (let index = 0; index < categoryIds.length; index++) for (const entry of categories) if (entry.parentId === categoryIds[index] && !categoryIds.includes(entry.id)) categoryIds.push(entry.id)
      const categoryCounts = categoryIds.length ? { items: await client.masterItem.count({ where: { categoryId: { in: categoryIds } } }), assets: await client.asset.count({ where: { categoryId: { in: categoryIds } } }) } : undefined
      const inspectionCounts = new Map(await Promise.all(inspections.map(async (inspection) => [inspection.id, await client.asset.count({ where: { receiptId: inspection.id } })] as const)))
      const receivingInspections = receivings.length ? await client.inspection.findMany({ where: { receivingId: { in: receivings.map((entry) => entry.id) } }, select: { id: true, receivingId: true } }) : []
      const payload = {
        sales: sales.map((request) => ({ id: request.id, assetId: request.assetId, date: request.createdAt.toISOString(), quantity: Number(request.quantity), desiredAmount: Number(request.desiredAmount), status: saleLabels[request.status as keyof typeof saleLabels], inspection: request.inspection === 'COMPLETED' ? '판매용 정밀 검수 완료' : '판매용 정밀 검수 대기' })),
        pagination: { page, rows, total },
        customers, metrics, categoryCounts,
        locations: locations.map(({ _count, ...entry }) => ({ ...entry, assetCount: _count.assets, status: _count.assets ? '사용 중' : '비어 있음', rate: null })),
        categories: categories.map((category) => ({ id: category.id, parentId: category.parentId, name: category.name, enabled: category.enabled, order: category.sortOrder })),
        items: items.map(itemPayload),
        assets: assets.map((asset) => ({ updatedAt: asset.updatedAt.toISOString(), id: asset.id, itemId: asset.itemId, receivingId: asset.receivingId, customerId: asset.customerId, receiptId: asset.receiptId, locationId: asset.locationId ?? '', name: asset.name, category: asset.categoryId ?? '', brand: asset.brand, grade: asset.grade, quantity: Number(asset.quantity), unit: unit[asset.unit], appraisal: asset.appraisal === null ? null : Number(asset.appraisal), status: storageStatus[asset.storageStatus], saleStatus: saleStatus[asset.saleStatus], specification: asset.specification, images: asset.images.map((image) => ({ id: image.id, name: image.name, url: image.url })), history: asset.history.map((entry) => ({ at: entry.createdAt.toISOString(), reason: entry.reason, changes: entry.changes })) })),
        receivings: receivings.map((receiving) => ({ id: receiving.id, customerId: receiving.customerId, siteId: receiving.siteId ?? receiving.id, siteName: receiving.siteName, managerName: receiving.managerName, managerPhone: receiving.managerPhone, date: receiving.requestedAt.toISOString(), channel: receivingChannel[receiving.channel], volume: receiving.volumeDescription || receivingVolume[receiving.volume], summary: receiving.summary, status: receivingStatus[receiving.status], scheduledAt: receiving.scheduledAt?.toISOString() ?? null, termsAt: receiving.termsAgreedAt.toISOString(), estimate: receiving.transportEstimate === null ? null : Number(receiving.transportEstimate), note: receiving.note, ...(scope === 'receivings' && id ? { images: receiving.images.map(({ id: imageId, name, url }) => ({ id: imageId, name, url })), termsVersion: receiving.termsVersion, termsText: receiving.termsText, decision: receivingDecisionSummary(receiving.history) } : {}) })),
        inspections: inspections.map((inspection) => ({ id: inspection.id, receivingId: inspection.receivingId, date: inspection.createdAt.toISOString(), inspectedAt: inspection.inspectedAt?.toISOString() ?? null, notifiedAt: inspection.notifiedAt?.toISOString() ?? null, status: inspectionStatus[inspection.status], acknowledgedAt: inspection.acknowledgedAt?.toISOString() ?? null, disposalStatus: inspection.disposal ? disposalStatus[inspection.disposal.status] : '판정 대기', materials: inspection.items.map((item) => ({ assetId: item.assetId, name: item.name, grade: item.grade, unit: unit[item.unit], received: Number(item.receivedQuantity), usable: item.usableQuantity === null ? null : Number(item.usableQuantity), disposal: item.disposalQuantity === null ? null : Number(item.disposalQuantity), processed: item.disposal?.processedQuantity === null || item.disposal?.processedQuantity === undefined ? null : Number(item.disposal.processedQuantity), reason: item.reason })), evidence: inspection.disposal?.evidence ?? null })),
        products: products.map((product) => ({ id: product.id, assetId: product.assetId, name: product.name, price: Number(product.originalUnitPrice), discountRate: product.discountRate, unit: unit[product.asset.unit], status: productStatus[product.status] })),
        campaigns: campaigns.map(campaign => campaignPayload(campaign, enabledMarketCategoryIds(categories))),
      }
      return { ...payload, receivings: payload.receivings.map((entry) => ({ ...entry, inspectionId: receivingInspections.find((inspection) => inspection.receivingId === entry.id)?.id ?? null })), inspections: payload.inspections.map((inspection) => ({ ...inspection, assetCount: inspectionCounts.get(inspection.id) ?? 0 })) }
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
    updateItem: (previousId: string, item: AdminItemUpdate, actor: string) => customerTransaction(client, async (transaction) => {
      const previous = await transaction.masterItem.findUnique({ where: { id: previousId }, include: { images: { orderBy: { sortOrder: 'asc' } } } })
      if (!previous) throw new AppError(404, ErrorCode.NOT_FOUND, '품목을 찾을 수 없습니다.')
      if (previous.unit !== item.unit && await transaction.asset.count({ where: { itemId: previousId } })) throw new AppError(409, ErrorCode.CONFLICT, '연결 자산이 있어 기준 단위를 변경할 수 없습니다.')
      for (const image of item.images) if (!publicImageUrl(image.url) && !previous.images.some((entry) => entry.id === image.id && entry.name === image.name && entry.url === image.url)) throw new AppError(400, ErrorCode.VALIDATION_ERROR, '새 이미지는 S3 업로드 주소를 사용해 주세요.')
      const { images, category, ...fields } = item
      await transaction.masterItem.update({ where: { id: previousId }, data: { ...fields, categoryId: category } })
      await transaction.masterItemImage.deleteMany({ where: { masterItemId: item.id } })
      if (images.length) await transaction.masterItemImage.createMany({ data: images.map((image, sortOrder) => ({ ...image, masterItemId: item.id, sortOrder })) })
      const saved = await transaction.masterItem.findUniqueOrThrow({ where: { id: item.id }, include: { images: { orderBy: { sortOrder: 'asc' } } } })
      await transaction.customerChange.create({ data: { actorUserId: actor, action: 'item.update', reason: '품목 정보 수정', changes: { before: itemPayload(previous), after: itemPayload(saved) } } })
      return itemPayload(saved)
    }),
    updateAsset: (id: string, input: z.output<typeof assetUpdateInput>) => customerTransaction(client, async (transaction) => {
      const previous = await transaction.asset.findUnique({ where: { id }, include: { product: true, saleRequest: true } })
      if (!previous) throw new AppError(404, ErrorCode.NOT_FOUND, '자산을 찾을 수 없습니다.')
      if (previous.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new AppError(409, ErrorCode.CONFLICT, '자산이 변경되었습니다. 새로고침 후 다시 수정해 주세요.')
      const { expectedUpdatedAt, reason, category, status, saleStatus: saleLabel, ...fields } = input
      const storage = enumKey(storageStatus, status)!
      const sale = enumKey(saleStatus, saleLabel)!
      const invalid = (message: string) => new AppError(400, ErrorCode.VALIDATION_ERROR, message)
      if (['EA', 'BOX', 'PIECE'].includes(previous.unit) && !Number.isInteger(fields.quantity)) throw invalid('EA·Box·본 수량은 정수로 입력해 주세요.')
      if (storage === 'RELEASED' ? fields.quantity !== 0 : fields.quantity <= 0) throw invalid('출고완료 수량은 0, 나머지 상태의 수량은 0보다 커야 합니다.')
      if ((fields.grade === 'F' || storage === 'PENDING') && sale !== 'PENDING' || sale === 'ON_SALE' && storage !== 'STORED') throw invalid('등급·보관 상태·판매 상태 조합을 확인해 주세요.')
      if (category && category !== previous.categoryId) {
        const selected = await transaction.materialCategory.findUnique({ where: { id: category }, include: { parent: { include: { parent: true } } } })
        if (!selected?.enabled || selected.parent && !selected.parent.enabled || selected.parent?.parent && !selected.parent.parent.enabled) throw invalid('사용 중인 카테고리를 선택해 주세요.')
      }
      if (fields.locationId) {
        const location = await transaction.location.findUnique({ where: { id: fields.locationId } })
        if (!location || !location.enabled && previous.locationId !== fields.locationId) throw invalid('사용 중인 로케이션을 선택해 주세요.')
      } else if (storage === 'STORED') throw invalid('보관중 자산의 로케이션을 선택해 주세요.')
      if (previous.product && (Number(previous.quantity) !== fields.quantity || previous.grade !== fields.grade || previous.storageStatus !== storage || previous.saleStatus !== sale)) throw new AppError(409, ErrorCode.CONFLICT, '연결 상품이 있는 자산의 수량·등급·상태는 마켓 업무에서 변경해 주세요.')
      if (previous.saleRequest && (Number(previous.quantity) !== fields.quantity || previous.storageStatus !== storage || previous.saleStatus !== sale || fields.grade === 'F')) throw new AppError(409, ErrorCode.CONFLICT, '판매 요청된 자산의 수량·보관/판매 상태 및 F등급 변경은 제한됩니다.')
      const data = { ...fields, categoryId: category || null, storageStatus: storage, saleStatus: sale }
      const labels: Record<string, string> = { appraisal: '개당 평가금액', name: '자산명', specification: '규격', brand: '브랜드', quantity: '현재 수량', grade: '등급', locationId: '로케이션', categoryId: '카테고리', storageStatus: '보관 상태', saleStatus: '판매 상태' }
      const display = (key: string, value: unknown) => key === 'storageStatus' ? storageStatus[value as keyof typeof storageStatus] ?? '미등록' : key === 'saleStatus' ? saleStatus[value as keyof typeof saleStatus] ?? '미등록' : String(value ?? '') || '미등록'
      const changes = Object.entries(data).filter(([key, value]) => String(previous[key as keyof typeof previous] ?? '') !== String(value ?? '')).map(([key, value]) => [labels[key] ?? key, display(key, previous[key as keyof typeof previous]), display(key, value)])
      if (changes.length) {
        await transaction.asset.update({ where: { id }, data })
        await transaction.assetChange.create({ data: { id: randomUUID(), assetId: id, reason, changes } })
      }
    }),
    completeSaleInspection: (id: string, expectedUpdatedAt: string, user: { id: string; sessionVersion?: number }) => customerTransaction(client, async (transaction) => {
      const actor = await transaction.user.findUnique({ where: { id: user.id } })
      if (!actor || actor.role !== 'ADMIN' || actor.status !== 'ACTIVE' || actor.sessionVersion !== (user.sessionVersion ?? 0)) throw new AppError(403, ErrorCode.FORBIDDEN, '활성 관리자 권한이 필요합니다.')
      const request = await transaction.saleRequest.findUnique({ where: { id }, include: { asset: true } })
      if (!request) throw new AppError(404, ErrorCode.NOT_FOUND, '판매 요청을 찾을 수 없습니다.')
      const asset = request.asset
      if (request.inspection !== 'PENDING' || request.status !== 'PENDING' || asset.updatedAt.toISOString() !== expectedUpdatedAt) throw new AppError(409, ErrorCode.CONFLICT, '요청 또는 자산이 변경되었습니다. 새로고침 후 확인해 주세요.')
      if (!asset.itemId || !asset.categoryId || !asset.specification.trim() || !asset.brand.trim() || !['S', 'A', 'B'].includes(asset.grade) || asset.appraisal === null || asset.storageStatus !== 'STORED' || asset.saleStatus !== 'PENDING' || !request.quantity.gt(0) || !request.quantity.equals(asset.quantity)) throw new AppError(400, ErrorCode.VALIDATION_ERROR, '자산 상세화 항목 등록과 판매 요청 수량 확인을 완료해 주세요.')
      const changed = await transaction.saleRequest.updateMany({ where: { id, inspection: 'PENDING', status: 'PENDING' }, data: { inspection: 'COMPLETED' } })
      if (changed.count !== 1) throw new AppError(409, ErrorCode.CONFLICT, '상세 검수 상태가 변경되었습니다.')
      await transaction.assetChange.create({ data: { id: randomUUID(), assetId: asset.id, reason: '판매 요청 상세 검수 완료', changes: [['상세 검수 상태', '상세 검수 대기', '상세 검수 완료']] } })
      await transaction.customerChange.create({ data: { actorUserId: actor.id, customerId: asset.customerId, action: 'sale.inspection.complete', reason: '판매 요청 상세 검수 완료', changes: { requestId: id, assetId: asset.id, quantity: request.quantity.toString(), appraisal: asset.appraisal.toString(), before: 'PENDING', after: 'COMPLETED' } } })
      await emitNotification(transaction, { customerId: asset.customerId, kind: 'sale.inspected', sourceId: id, targetType: 'ASSET', targetId: asset.id, description: `${asset.name} 판매용 상세 검수가 완료되었습니다.` })
      return { id, inspection: 'COMPLETED' }
    }),
    approveSale: (id: string, input: z.output<typeof saleApprovalInput>, user: { id: string; sessionVersion?: number }) => customerTransaction(client, async (transaction) => {
      const actor = await transaction.user.findUnique({ where: { id: user.id } })
      if (!actor || actor.role !== 'ADMIN' || actor.status !== 'ACTIVE' || actor.sessionVersion !== (user.sessionVersion ?? 0)) throw new AppError(403, ErrorCode.FORBIDDEN, '활성 관리자 권한이 필요합니다.')
      const request = await transaction.saleRequest.findUnique({ where: { id }, include: { asset: { include: { product: true, customer: true } } } })
      if (!request) throw new AppError(404, ErrorCode.NOT_FOUND, '판매 요청을 찾을 수 없습니다.')
      const asset = request.asset
      if (request.status !== 'PENDING' || request.inspection !== 'COMPLETED' || asset.product || asset.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new AppError(409, ErrorCode.CONFLICT, '상세 검수 완료·승인 대기 상태와 최신 자산을 확인해 주세요.')
      if (asset.customer.status !== 'ACTIVE' || !asset.itemId || !asset.categoryId || !asset.specification.trim() || !asset.brand.trim() || !['S', 'A', 'B'].includes(asset.grade) || asset.appraisal === null || asset.storageStatus !== 'STORED' || asset.saleStatus !== 'PENDING' || !request.quantity.gt(0) || !request.quantity.equals(asset.quantity)) throw new AppError(400, ErrorCode.VALIDATION_ERROR, '고객사 상태·자산 상세화 정보·판매 가능 수량을 확인해 주세요.')
      const changed = await transaction.saleRequest.updateMany({ where: { id, status: 'PENDING', inspection: 'COMPLETED' }, data: { status: 'APPROVED' } })
      if (changed.count !== 1) throw new AppError(409, ErrorCode.CONFLICT, '판매 요청 상태가 변경되었습니다.')
      const product = await transaction.product.create({ data: { id: `PRD-${asset.id}`, assetId: asset.id, name: asset.name, originalUnitPrice: input.unitPrice, listedQuantity: request.quantity, minimumOrderQuantity: request.quantity.lt(1) ? request.quantity : 1, status: 'AVAILABLE', publishedAt: new Date() } })
      await transaction.asset.update({ where: { id: asset.id }, data: { saleStatus: 'ON_SALE' } })
      await transaction.assetChange.create({ data: { id: randomUUID(), assetId: asset.id, reason: input.reason, changes: [['판매 요청 승인 상태', '승인 대기', '승인 완료'], ['판매 상태', '판매대기', '판매중'], ['마켓 상품', '미등록', product.id]] } })
      await transaction.marketChange.create({ data: { id: randomUUID(), entityType: 'PRODUCT', entityId: product.id, actorUserId: actor.id, reason: input.reason, changes: { requestId: id, status: { before: null, after: 'AVAILABLE' }, unitPrice: input.unitPrice, listedQuantity: request.quantity.toString() } } })
      await transaction.customerChange.create({ data: { actorUserId: actor.id, customerId: asset.customerId, action: 'sale.approve', reason: input.reason, changes: { requestId: id, productId: product.id, before: 'PENDING', after: 'APPROVED' } } })
      await emitNotification(transaction, { customerId: asset.customerId, kind: 'sale.approved', sourceId: id, targetType: 'ASSET', targetId: asset.id, description: `${asset.name} 자산이 마켓에 판매 등록되었습니다.` })
      return { id, status: 'APPROVED', productId: product.id }
    }),
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
  return async (context: Context) => success(context, await repository.load(adminDataQuery.parse(context.req.query())))
}

const imageInput = z.object({ id: z.uuid(), name: z.string().trim().min(1).max(255), url: z.string().min(1).max(2048).refine((value) => publicImageUrl(value) !== null, 'S3 업로드 이미지 주소를 사용해 주세요.') })
const itemUnit = z.enum(Object.values(unit) as [(typeof unit)[ItemUnit], ...(typeof unit)[ItemUnit][]])
export const assetUpdateInput = z.object({
  expectedUpdatedAt: z.iso.datetime(), reason: z.string().trim().min(1).max(500),
  name: z.string().trim().min(1).max(160), specification: z.string().trim().max(500), brand: z.string().trim().max(160),
  category: z.union([z.string().regex(/^\d{6}$/), z.literal('')]).default(''),
  appraisal: z.number().int().min(0).max(1e12).nullable().optional(),
  quantity: z.number().min(0).max(1e9).refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 0.0001),
  grade: z.enum(['S', 'A', 'B', 'F']), locationId: z.string().max(20).transform((value) => value || null),
  status: z.enum(['입고대기', '보관중', '출고완료']), saleStatus: z.enum(['판매대기', '판매중', '판매완료']),
}).strict()
export const itemInput = z.object({
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

export const categoryInput = z.object({
  parentId: z.string().regex(/^\d{6}$/).nullable(),
  name: z.string().trim().min(1).max(80),
  enabled: z.boolean(),
  order: z.number().int().min(0).max(9999),
})

type AdminItemInput = z.output<typeof itemInput>
export const itemUpdateInput = itemInput.extend({ images: z.array(z.object({ id: z.string().min(1).max(36), name: z.string().min(1).max(255), url: z.string().min(1).max(7_000_000) })).max(1) })
type AdminItemUpdate = z.output<typeof itemUpdateInput>
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

export function updateAdminItem(repository: AdminDataRepository) {
  return async (context: Context) => {
    const id = z.string().regex(/^\d{6}$/).parse(context.req.param('id'))
    const item = itemUpdateInput.parse(await context.req.json())
    try {
      return success(context, { item: await repository.updateItem(id, item, (context.get('authUser') as { id: string }).id) })
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2003') throw new AppError(400, ErrorCode.VALIDATION_ERROR, '카테고리 또는 이미지 연결 정보를 확인해 주세요.')
      throw error
    }
  }
}

export function updateAdminAsset(repository: AdminDataRepository) {
  return async (context: Context) => {
    const id = z.string().regex(/^\d{6}-\d{4}$/).parse(context.req.param('id'))
    await repository.updateAsset(id, assetUpdateInput.parse(await context.req.json()))
    const data = await repository.load(adminDataQuery.parse({ scope: 'assets', id }))
    return success(context, { asset: data.assets[0] })
  }
}

export const saleInspectionCompleteInput = z.object({ expectedUpdatedAt: z.iso.datetime() }).strict()
export const saleApprovalInput = z.object({ expectedUpdatedAt: z.iso.datetime(), unitPrice: z.number().int().min(1).max(1000000000000), reason: z.string().trim().min(1).max(500) }).strict()
export function approveAdminSale(repository: AdminDataRepository) {
  return async (context: Context) => {
    const id = z.uuid().parse(context.req.param('id'))
    return success(context, { request: await repository.approveSale(id, saleApprovalInput.parse(await context.req.json()), context.get('authUser')) })
  }
}
export function completeAdminSaleInspection(repository: AdminDataRepository) {
  return async (context: Context) => {
    const id = z.uuid().parse(context.req.param('id'))
    const input = saleInspectionCompleteInput.parse(await context.req.json())
    return success(context, { request: await repository.completeSaleInspection(id, input.expectedUpdatedAt, context.get('authUser')) })
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