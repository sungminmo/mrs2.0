import { authenticatedFetch, readAuthSession } from './authSession'
import { adminAuthenticatedFetch, readAdminSession } from './adminAuthSession'
import { appraisalMoney } from './appraisal'
import type { PurchaseQuote } from './purchaseQuotes'

export type OfferLine = {
  id: string
  productId: string
  sourceQuoteItemId: string | null
  name: string
  category: string
  grade: string
  unit: string
  specification: string
  brand: string
  imageUrl: string | null
  quantity: string
  unitPrice: string
  total: string
  assetId?: string
}
export type Offer = {
  id: string
  quoteId: string
  revision: number
  status: string
  version: number
  expired: boolean
  contactName: string
  phone: string
  email: string
  address: string
  deliveryDate: string | null
  deliveryMethod: 'DELIVERY' | 'SELF_PICKUP'
  note: string
  expiresAt: string | null
  sentAt: string | null
  shippingFee: string
  itemTotal: string
  grandTotal: string
  items: OfferLine[]
}
export type OrderItem = {
  id: string
  productId: string
  offerItemId: string
  name: string
  unit: string
  quantity: string
  shippedQuantity: string
  cancelledQuantity: string
  remainingQuantity: string
  assetId?: string
  locationId?: string | null
}
export type Shipment = {
  id: string
  code: string
  version: number
  status: string
  scheduledAt: string | null
  dispatchedAt: string | null
  deliveredAt: string | null
  deliveryMethod: string
  address: string
  contactName: string
  phone: string
  carrier: string
  vehicle: string
  trackingNumber: string
  note: string
  items: { orderItemId: string; quantity: string }[]
}
export type Cancellation = {
  id: string
  version: number
  status: string
  reason: string
  decisionReason: string
  requestedAt: string
  decidedAt: string | null
  items: { orderItemId: string; quantity: string }[]
}
export type Order = {
  id: string
  code: string
  quoteId: string
  version: number
  approvedAt: string
  closure: string | null
  closedAt: string | null
  state: string
  canCancel: boolean
  cancelledItemTotal: string
  offer: Offer
  items: OrderItem[]
  shipments: Shipment[]
  cancellations: Cancellation[]
}
export type OfferResponse = {
  quote: Omit<PurchaseQuote, 'items'> & {
    items: (PurchaseQuote['items'][number] & { id: string })[]
  }
  offers: Offer[]
  order: Order | null
}
export type CommandResult = {
  quoteId: string
  offerId?: string
  orderId?: string
  shipmentId?: string
  cancellationId?: string
  replayed: boolean
}
export class OutboundError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}
export const outboundLabels: Record<string, string> = {
  DRAFT: '초안',
  SENT: '승인 대기',
  SUPERSEDED: '이전 회신',
  DECLINED: '거절',
  WITHDRAWN: '철회',
  ACCEPTED: '승인',
  EXPIRED: '만료',
  PREPARING: '출고 준비',
  PARTIALLY_SHIPPED: '부분 출고',
  CANCELLATION_PENDING: '취소 요청 중',
  IN_DELIVERY: '배송 중',
  DISPATCHED: '출고 확정',
  DELIVERED: '배송 완료',
  CANCELLED: '취소 완료',
  COMPLETED: '거래 완료',
  CLOSED_PARTIAL_CANCELLED: '잔여 취소 · 완료',
  PENDING: '검토 대기',
  APPROVED: '취소 승인',
  REJECTED: '취소 거절',
}
export const outboundDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
    : '-'
export const toLocalDateTime = (value: string | null) =>
  value
    ? new Date(Date.parse(value) + 9 * 3600000).toISOString().slice(0, 16)
    : ''
export const fromLocalDateTime = (value: string) =>
  value ? new Date(`${value}:00+09:00`).toISOString() : null
export async function outboundRequest<T>(
  admin: boolean,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const current = admin ? readAdminSession : readAuthSession
  const token = current()?.accessToken
  if (!token) throw new Error('로그인이 필요합니다.')
  const response = await (admin ? adminAuthenticatedFetch : authenticatedFetch)(
    path,
    init,
  )
  const body = await response.json().catch(() => null)
  if (current()?.accessToken !== token)
    throw new Error('로그인 계정이 변경되었습니다.')
  if (!response.ok || !body?.data)
    throw new OutboundError(
      body?.error?.message ?? '요청을 처리하지 못했습니다.',
      response.status,
    )
  return body.data as T
}
export function outboundWrite(
  admin: boolean,
  path: string,
  body: unknown,
  method = 'POST',
) {
  return outboundRequest<CommandResult>(admin, path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
const escapeHtml = (value: string | null) =>
  (value ?? '-').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]!,
  )
export function outboundDocument(
  offer: Offer,
  shipment?: Shipment,
  order?: Order,
) {
  const title = shipment ? '출고 명세서' : '확정 견적서'
  const lines = shipment
    ? shipment.items
        .map((item) => {
          const orderItem = order!.items.find(
            (row) => row.id === item.orderItemId,
          )!
          const line = offer.items.find(
            (row) => row.id === orderItem.offerItemId,
          )!
          return `<tr><td>${escapeHtml(line.name)}</td><td>${escapeHtml(line.specification)}</td><td>${escapeHtml(item.quantity)} ${escapeHtml(line.unit)}</td></tr>`
        })
        .join('')
    : offer.items
        .map(
          (line) =>
            `<tr><td>${escapeHtml(line.name)}<br>${escapeHtml(line.specification)}</td><td>${escapeHtml(line.quantity)} ${escapeHtml(line.unit)}</td><td>${appraisalMoney(line.unitPrice)}</td><td>${appraisalMoney(line.total)}</td></tr>`,
        )
        .join('')
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><title>${title}</title><style>body{font-family:sans-serif;color:#243129;max-width:900px;margin:40px auto;padding:20px}table{width:100%;border-collapse:collapse}th,td{padding:12px;border-bottom:1px solid #ccc;text-align:left}p{white-space:pre-wrap}</style><h1>${title}</h1><p>MRS · ${escapeHtml(shipment?.code ?? `회신 ${offer.revision}`)}</p><p>${escapeHtml(offer.contactName)} / ${escapeHtml(offer.phone)}<br>${escapeHtml(offer.address)}</p><p>${shipment ? `출고: ${escapeHtml(outboundDate(shipment.dispatchedAt))}<br>배송사: ${escapeHtml(shipment.carrier)} / 차량: ${escapeHtml(shipment.vehicle)} / 운송장: ${escapeHtml(shipment.trackingNumber)}` : `만료: ${escapeHtml(offer.expiresAt ? outboundDate(offer.expiresAt) : '없음')} / 예정 납품일: ${escapeHtml(offer.deliveryDate)}`}</p><table><thead><tr>${shipment ? '<th>상품</th><th>규격</th><th>출고 수량</th>' : '<th>상품</th><th>수량</th><th>단가</th><th>금액</th>'}</tr></thead><tbody>${lines}</tbody></table>${shipment ? '' : `<p>상품 ${appraisalMoney(offer.itemTotal)} · 배송비 ${appraisalMoney(offer.shippingFee)} · 합계 ${appraisalMoney(offer.grandTotal)} (VAT 포함)</p>`}<p>${escapeHtml(shipment?.note ?? offer.note)}</p><footer>결제·입금 확인 문서가 아닙니다.</footer></html>`
}
export function downloadOutbound(
  offer: Offer,
  shipment?: Shipment,
  order?: Order,
) {
  const url = URL.createObjectURL(
    new Blob([outboundDocument(offer, shipment, order)], {
      type: 'text/html;charset=utf-8',
    }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${shipment?.code ?? `확정견적-${offer.revision}`}.html`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
