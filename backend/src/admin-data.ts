import type { PrismaClient } from './generated/prisma/client.js'
import type { Context } from 'hono'
import { success } from './http.js'

const unit = { EA: 'EA', BOX: 'Box', KG: 'kg', TON: 'ton', M: 'M', M3: 'm³', PIECE: '본' } as const
const storageStatus = { PENDING: '입고대기', STORED: '보관중', RELEASED: '출고완료' } as const
const saleStatus = { PENDING: '판매대기', ON_SALE: '판매중', SOLD: '판매완료' } as const
const productStatus = { DRAFT: '판매대기', AVAILABLE: '판매 중', OUT_OF_STOCK: '재고 없음' } as const
const receivingStatus = { REQUESTED: '입고 신청', APPROVED: '입고 승인', RECEIVED: '입고 완료', REJECTED: '입고 반려', CANCELLED: '취소' } as const
const receivingChannel = { ADMIN: '관리자 등록', WEBSITE: '홈페이지', KAKAO: '카카오톡', PORTAL: 'MRS고객포탈', OTHER: '기타' } as const
const receivingVolume = { UNDER_ONE_TON: '1톤 이하', TWO_POINT_FIVE_TONS: '2.5톤', FIVE_TONS_OR_MORE: '5톤 이상', OTHER: '기타' } as const
const inspectionStatus = { PENDING: '검수 대기', AWAITING_ACKNOWLEDGEMENT: '결과 확인 대기', COMPLETED: '검수 종료' } as const
const disposalStatus = { UNPROCESSED: '미처리', SCHEDULED: '처리 예정', COMPLETED: '폐기 완료' } as const

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
        items: items.map((item) => ({ id: item.id, name: item.name, category: item.categoryId, specification: item.specification, brand: item.brand, unit: unit[item.unit], inboundPrice: item.inboundPrice === null ? null : Number(item.inboundPrice), outboundPrice: item.outboundPrice === null ? null : Number(item.outboundPrice), standardPrice: item.standardPrice === null ? null : Number(item.standardPrice), enabled: item.enabled, note: item.note, images: item.images.map((image) => ({ id: image.id, name: image.name, url: image.url })) })),
        assets: assets.map((asset) => ({ id: asset.id, itemId: asset.itemId, receivingId: asset.receivingId, customerId: asset.customerId, receiptId: asset.receiptId, locationId: asset.locationId ?? '', name: asset.name, category: asset.categoryId, brand: asset.brand, grade: asset.grade, quantity: Number(asset.quantity), unit: unit[asset.unit], appraisal: asset.appraisal === null ? null : Number(asset.appraisal), status: storageStatus[asset.storageStatus], saleStatus: saleStatus[asset.saleStatus], specification: asset.specification, images: asset.images.map((image) => ({ id: image.id, name: image.name, url: image.url })), history: asset.history.map((entry) => ({ at: entry.createdAt.toISOString(), reason: entry.reason, changes: entry.changes })) })),
        receivings: receivings.map((receiving) => ({ id: receiving.id, customerId: receiving.customerId, siteId: receiving.siteId ?? receiving.id, siteName: receiving.siteName, managerName: receiving.managerName, managerPhone: receiving.managerPhone, date: receiving.requestedAt.toISOString(), channel: receivingChannel[receiving.channel], volume: receiving.volumeDescription || receivingVolume[receiving.volume], summary: receiving.summary, status: receivingStatus[receiving.status], scheduledAt: receiving.scheduledAt?.toISOString() ?? null, termsAt: receiving.termsAgreedAt.toISOString(), estimate: receiving.transportEstimate === null ? null : Number(receiving.transportEstimate), note: receiving.note })),
        inspections: inspections.map((inspection) => ({ id: inspection.id, receivingId: inspection.receivingId, date: inspection.createdAt.toISOString(), inspectedAt: inspection.inspectedAt?.toISOString() ?? null, notifiedAt: inspection.notifiedAt?.toISOString() ?? null, status: inspectionStatus[inspection.status], acknowledgedAt: inspection.acknowledgedAt?.toISOString() ?? null, disposalStatus: inspection.disposal ? disposalStatus[inspection.disposal.status] : '판정 대기', materials: inspection.items.map((item) => ({ assetId: item.assetId, name: item.name, grade: item.grade, unit: unit[item.unit], received: Number(item.receivedQuantity), usable: item.usableQuantity === null ? null : Number(item.usableQuantity), disposal: item.disposalQuantity === null ? null : Number(item.disposalQuantity), processed: item.disposal?.processedQuantity === null || item.disposal?.processedQuantity === undefined ? null : Number(item.disposal.processedQuantity), reason: item.reason })), evidence: inspection.disposal?.evidence ?? null })),
        products: products.map((product) => ({ id: product.id, assetId: product.assetId, name: product.name, price: Number(product.originalUnitPrice), discountRate: product.discountRate, unit: unit[product.asset.unit], status: productStatus[product.status] })),
        campaigns: campaigns.map((campaign) => ({ id: campaign.id, name: campaign.name, category: campaign.categoryId, description: campaign.description, enabled: campaign.enabled, order: campaign.sortOrder, startsAt: campaign.startsAt.toISOString(), endsAt: campaign.endsAt.toISOString() })),
      }
    },
  }
}

export type AdminDataRepository = ReturnType<typeof createAdminDataRepository>

export function loadAdminData(repository: AdminDataRepository) {
  return async (context: Context) => success(context, await repository.load())
}