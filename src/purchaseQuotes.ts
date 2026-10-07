import { authenticatedFetch, readAuthSession } from './authSession'
import { appraisalMoney } from './appraisal'

export type QuoteLine = {
  productId: string
  name: string
  category: string
  grade: string
  unit: string
  specification: string
  brand: string
  imageUrl: string | null
  quantity: string
  unitPrice: string
  originalUnitPrice: string
  total: string
  originalTotal: string
}
export type QuoteDraft = {
  source: 'cart' | 'product'
  items: {
    productId: string
    quantity: string
    cartItemId?: string
    expectedVersion?: number
  }[]
}
export type QuotePreview = {
  company: string
  items: QuoteLine[]
  total: string
  originalTotal: string
  snapshot: string
}
export type PurchaseQuote = Omit<QuotePreview, 'snapshot'> & {
  id: string
  code: string
  customerId: string
  actorUserId: string
  contactName: string
  phone: string
  email: string
  address: string
  deliveryDate: string | null
  note: string
  createdAt: string
  status: 'RECEIVED'
}
export class QuoteRequestError extends Error {
  preview?: QuotePreview
  constructor(message: string, preview?: QuotePreview) {
    super(message)
    this.preview = preview
  }
}
export async function quoteRequest<T>(
  path: string,
  token: string,
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  if (readAuthSession()?.accessToken !== token)
    throw new Error('로그인 계정이 변경되었습니다.')
  const response = await authenticatedFetch(path, {
    signal,
    ...(body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }
      : {})
  })
  const result = await response.json().catch(() => null)
  if (readAuthSession()?.accessToken !== token)
    throw new Error('로그인 계정이 변경되었습니다.')
  if (!response.ok)
    throw new QuoteRequestError(
      result?.error?.message ??
        '견적 요청 처리에 실패했습니다. 다시 시도해 주세요.',
      result?.preview
    )
  return result.data as T
}
export function quoteDocument(quote: PurchaseQuote) {
  const escape = (value: string | null) =>
    (value ?? '-').replace(
      /[&<>"']/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        })[character]!
    )
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><title>${escape(quote.code)} 구매 견적 요청서</title><style>body{font-family:sans-serif;max-width:900px;margin:40px auto;padding:20px;color:#243129}table{width:100%;border-collapse:collapse}td,th{padding:12px;border-bottom:1px solid #ddd;text-align:left}p{white-space:pre-wrap}strong{font-size:20px}</style><h1>구매 견적 요청서</h1><p>MRS · ${escape(quote.code)} · ${escape(quote.createdAt)}</p><p>${escape(quote.company)} / ${escape(quote.contactName)} / ${escape(quote.phone)} / ${escape(quote.email)}</p><p>납품 주소: ${escape(quote.address)}<br>희망 납기일: ${escape(quote.deliveryDate)}</p><table><thead><tr><th>상품번호·자재</th><th>분류·등급</th><th>단가</th><th>수량</th><th>금액</th></tr></thead><tbody>${quote.items.map((item) => `<tr><td>${escape(item.productId)}<br>${escape(item.name)}<br>${escape(item.specification)}</td><td>${escape(item.category)} / ${escape(item.grade)}</td><td>${appraisalMoney(item.unitPrice)}</td><td>${escape(item.quantity)} ${escape(item.unit)}</td><td>${appraisalMoney(item.total)}</td></tr>`).join('')}</tbody></table><p>예상 상품 금액: <strong>${appraisalMoney(quote.total)}</strong></p><p>${escape(quote.note)}</p><footer>VAT 포함 · 배송비 별도 협의. 구매 견적 요청서이며 확정 견적·주문·결제 또는 재고 확보를 의미하지 않습니다.</footer></html>`
}
export function downloadPurchaseQuote(quote: PurchaseQuote) {
  const url = URL.createObjectURL(
    new Blob([quoteDocument(quote)], { type: 'text/html;charset=utf-8' })
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `${quote.code}-구매견적요청서.html`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
