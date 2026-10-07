import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowUp,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Truck,
  X,
} from 'lucide-react'
import { createUuid } from '../uuid'
import { appraisalMoney } from '../appraisal'
import {
  fromLocalDateTime,
  outboundRequest,
  outboundWrite,
  OutboundError,
  toLocalDateTime,
  type Offer,
  type OfferResponse,
  type Order,
  type Shipment,
} from '../outboundApi'
import {
  OfferSummary,
  OrderSummary,
  OrdersPage,
  OutboundAction,
} from '../OutboundWorkspace'
import type { CampaignProduct } from './adminData'
import type { Pagination } from './AdminPagination'

function useSave(onDone: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const working = useRef(false)
  const receipt = useRef<{ key: string; id: string } | null>(null)
  return {
    busy,
    error,
    stale,
    save: async (
      path: string,
      input: Record<string, unknown>,
      method = 'POST',
    ) => {
      if (working.current || stale) return
      working.current = true
      setBusy(true)
      setError('')
      const key = JSON.stringify({ path, input, method })
      if (receipt.current?.key !== key)
        receipt.current = { key, id: createUuid() }
      try {
        await outboundWrite(
          true,
          path,
          { ...input, operationId: receipt.current.id },
          method,
        )
        onDone()
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : '저장 실패')
        if (failure instanceof OutboundError && failure.status === 409)
          setStale(true)
      } finally {
        working.current = false
        setBusy(false)
      }
    },
  }
}

export function AdminQuotePanel({ quoteId }: { quoteId: string }) {
  const query = useQuery({
    queryKey: ['admin-outbound-quote', quoteId],
    queryFn: ({ signal }) =>
      outboundRequest<OfferResponse>(
        true,
        `/api/admin/quotes/${quoteId}/offers`,
        { signal },
      ),
    retry: false,
  })
  const [editing, setEditing] = useState<string | null>(null)
  const refresh = () => {
    setEditing(null)
    void query.refetch()
  }
  return (
    <section className="outbound-workspace">
      <div className="outbound-heading">
        <h2>견적 회신·출고</h2>
        <button
          className="adm-icon"
          title="회신 새로고침"
          aria-label="회신 새로고침"
          onClick={refresh}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      {query.isPending && <p role="status">불러오는 중...</p>}
      {query.error && (
        <p className="adm-form-error" role="alert">
          {query.error.message}
        </p>
      )}
      {query.data && (
        <>
          {query.data.order ? (
            <OrderSummary
              key={query.data.order.version}
              order={query.data.order}
              admin
              onChanged={refresh}
              actions={
                <AdminOrderTools order={query.data.order} onChanged={refresh} />
              }
            />
          ) : (
            <>
              {!editing && (
                <button
                  className="adm-button adm-primary"
                  onClick={() => setEditing('new')}
                >
                  <Plus size={16} />새 회신 초안
                </button>
              )}
              {editing && (
                <OfferEditor
                  key={`${editing}/${query.data.offers.find((offer) => offer.id === editing)?.version}`}
                  data={query.data}
                  offer={query.data.offers.find(
                    (offer) => offer.id === editing,
                  )}
                  onDone={refresh}
                  onCancel={() => setEditing(null)}
                />
              )}
            </>
          )}
          {query.data.offers.map((offer) => (
            <div key={`${offer.id}/${offer.version}`}>
              <OfferSummary offer={offer} />
              {!query.data.order && !editing && (
                <div className="outbound-actions">
                  {offer.status === 'DRAFT' && (
                    <>
                      <button
                        className="adm-button"
                        onClick={() => setEditing(offer.id)}
                      >
                        <Save size={16} />
                        초안 편집
                      </button>
                      <OutboundAction
                        admin
                        label="회신 발송"
                        path={`/api/admin/offers/${offer.id}/send`}
                        values={{ version: offer.version }}
                        expiration={offer.expiresAt}
                        onDone={refresh}
                      />
                      <OutboundAction
                        admin
                        label="초안 삭제"
                        path={`/api/admin/offers/${offer.id}/delete`}
                        values={{ version: offer.version }}
                        onDone={refresh}
                        destructive
                      />
                    </>
                  )}
                  {offer.status === 'SENT' && (
                    <OutboundAction
                      admin
                      label="회신 철회"
                      path={`/api/admin/offers/${offer.id}/withdraw`}
                      values={{ version: offer.version }}
                      onDone={refresh}
                      destructive
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </section>
  )
}

type EditLine = {
  productId: string
  sourceQuoteItemId: string | null
  name: string
  unit: string
  quantity: string
  unitPrice: string
}
function OfferEditor({
  data,
  offer,
  onDone,
  onCancel,
}: {
  data: OfferResponse
  offer?: Offer
  onDone: () => void
  onCancel: () => void
}) {
  const quote = data.quote
  const base = offer ?? data.offers[0]
  const [defaultExpiry] = useState(() =>
    toLocalDateTime(new Date(Date.now() + 72 * 3600000).toISOString()),
  )
  const [lines, setLines] = useState<EditLine[]>(
    base
      ? base.items
      : quote.items.map((item) => ({ ...item, sourceQuoteItemId: item.id })),
  )
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState({ q: '', page: 1 })
  const [replacement, setReplacement] = useState('')
  const products = useQuery({
    queryKey: ['outbound-product-search', query],
    queryFn: ({ signal }) =>
      outboundRequest<{ products: CampaignProduct[]; pagination: Pagination }>(
        true,
        `/api/admin/campaign-products?status=AVAILABLE&rows=20&page=${query.page}&q=${encodeURIComponent(query.q)}`,
        { signal },
      ),
    retry: false,
  })
  const request = useSave(onDone)
  const updateLine = (
    index: number,
    key: 'quantity' | 'unitPrice',
    value: string,
  ) =>
    setLines((current) =>
      current.map((line, position) =>
        position === index ? { ...line, [key]: value } : line,
      ),
    )
  const move = (index: number, direction: number) =>
    setLines((current) => {
      const result = [...current]
      ;[result[index], result[index + direction]] = [
        result[index + direction],
        result[index],
      ]
      return result
    })
  const add = (product: CampaignProduct) => {
    if (lines.some((line) => line.productId === product.id)) return
    const previous = lines.find((line) => line.productId === replacement)
    const line = {
      productId: product.id,
      sourceQuoteItemId: previous?.sourceQuoteItemId ?? null,
      name: product.name,
      unit: product.unit,
      quantity: previous?.quantity ?? '1',
      unitPrice: product.unitPrice,
    }
    setLines((current) =>
      previous
        ? current.map((entry) =>
            entry.productId === replacement ? line : entry,
          )
        : [...current, line],
    )
    setReplacement('')
  }
  return (
    <form
      className="outbound-editor"
      onSubmit={(event) => {
        event.preventDefault()
        const fields = new FormData(event.currentTarget)
        const text = (name: string) => String(fields.get(name) ?? '').trim()
        void request.save(
          offer
            ? `/api/admin/offers/${offer.id}`
            : `/api/admin/quotes/${quote.id}/offers`,
          {
            version: offer?.version ?? 0,
            reason: text('reason'),
            contactName: text('contactName'),
            phone: text('phone'),
            email: text('email'),
            address: text('address'),
            deliveryDate: text('deliveryDate') || null,
            deliveryMethod: text('deliveryMethod'),
            expiresAt: fromLocalDateTime(text('expiresAt')),
            shippingFee: text('shippingFee'),
            note: text('note'),
            items: lines.map((line) => ({
              productId: line.productId,
              sourceQuoteItemId: line.sourceQuoteItemId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
            })),
          },
          offer ? 'PUT' : 'POST',
        )
      }}
    >
      <h3>{offer ? `${offer.revision}차 회신 초안 편집` : '새 회신 초안'}</h3>
      <fieldset disabled={request.busy || request.stale}>
        <div className="outbound-fields">
          <label>
            담당자
            <input
              name="contactName"
              required
              maxLength={80}
              defaultValue={base?.contactName ?? quote.contactName}
            />
          </label>
          <label>
            전화
            <input
              name="phone"
              required
              maxLength={40}
              defaultValue={base?.phone ?? quote.phone}
            />
          </label>
          <label>
            이메일
            <input
              type="email"
              name="email"
              maxLength={254}
              defaultValue={base?.email ?? quote.email}
            />
          </label>
          <label>
            납품일
            <input
              type="date"
              name="deliveryDate"
              defaultValue={base?.deliveryDate ?? quote.deliveryDate ?? ''}
            />
          </label>
          <label className="outbound-wide">
            납품 주소
            <input
              name="address"
              required
              maxLength={300}
              defaultValue={base?.address ?? quote.address}
            />
          </label>
          <label>
            납품 방식
            <select
              name="deliveryMethod"
              defaultValue={base?.deliveryMethod ?? 'DELIVERY'}
            >
              <option value="DELIVERY">배송</option>
              <option value="SELF_PICKUP">직접 수령</option>
            </select>
          </label>
          <label>
            배송비 (원·VAT 포함)
            <input
              name="shippingFee"
              type="number"
              min={0}
              max={1000000000000}
              step={1}
              required
              defaultValue={base?.shippingFee ?? '0'}
            />
          </label>
          <label>
            회신 만료 (한국시간)
            <input
              name="expiresAt"
              type="datetime-local"
              defaultValue={
                offer ? toLocalDateTime(offer.expiresAt) : defaultExpiry
              }
            />
          </label>
          <label>
            원 요청 상품 대체
            <select
              value={replacement}
              onChange={(event) => setReplacement(event.target.value)}
            >
              <option value="">상품 추가</option>
              {lines.map((line) => (
                <option key={line.productId} value={line.productId}>
                  {line.name} 대체
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="outbound-table">
          <table>
            <thead>
              <tr>
                <th>상품</th>
                <th>수량</th>
                <th>회신 단가 (원)</th>
                <th>편성</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={line.productId}>
                  <td>
                    {line.name}
                    <small>
                      {line.productId} · {line.unit} ·{' '}
                      {line.sourceQuoteItemId ? '원 요청 연결' : '추가 상품'}
                    </small>
                  </td>
                  <td>
                    <input
                      aria-label={`${line.name} 회신 수량`}
                      type="number"
                      min={['EA', 'BOX', 'PIECE'].includes(line.unit) ? 1 : 0.001}
                      max={1000000000}
                      step={
                        ['EA', 'BOX', 'PIECE'].includes(line.unit) ? 1 : 0.001
                      }
                      required
                      value={line.quantity}
                      onChange={(event) =>
                        updateLine(index, 'quantity', event.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`${line.name} 회신 단가`}
                      type="number"
                      min={0}
                      max={1000000000000}
                      step={1}
                      required
                      value={line.unitPrice}
                      onChange={(event) =>
                        updateLine(index, 'unitPrice', event.target.value)
                      }
                    />
                  </td>
                  <td>
                    <div className="outbound-actions">
                      <button
                        type="button"
                        className="adm-icon"
                        aria-label={`${line.name} 위로`}
                        title="위로"
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        type="button"
                        className="adm-icon"
                        aria-label={`${line.name} 아래로`}
                        title="아래로"
                        disabled={index === lines.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown size={16} />
                      </button>
                      <button
                        type="button"
                        className="adm-icon"
                        aria-label={`${line.name} 제외`}
                        title="상품 제외"
                        onClick={() =>
                          setLines(
                            lines.filter(
                              (entry) => entry.productId !== line.productId,
                            ),
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="outbound-product-search">
          <div className="outbound-actions">
            <label>
              상품 검색
              <input
                value={search}
                maxLength={160}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <button
              className="adm-button"
              type="button"
              onClick={() => setQuery({ q: search, page: 1 })}
            >
              <Search size={16} />
              검색
            </button>
          </div>
          {products.isPending && <p role="status">상품 조회 중...</p>}
          {products.error && <p role="alert">{products.error.message}</p>}
          <div className="outbound-product-results">
            {products.data?.products
              .filter((product) => product.visible)
              .map((product) => (
                <div className="outbound-heading" key={product.id}>
                  <span>
                    {product.name} · {product.quantity} {product.unit} ·{' '}
                    {appraisalMoney(product.unitPrice)}
                  </span>
                  <button
                    className="adm-button"
                    type="button"
                    disabled={
                      lines.some((line) => line.productId === product.id) ||
                      (!replacement && lines.length >= 100)
                    }
                    onClick={() => add(product)}
                  >
                    <Plus size={16} />
                    {replacement ? '대체' : '추가'}
                  </button>
                </div>
              ))}
          </div>
          <div className="outbound-actions">
            <button
              type="button"
              className="adm-button"
              disabled={query.page === 1}
              onClick={() => setQuery({ ...query, page: query.page - 1 })}
            >
              이전
            </button>
            <span>
              {query.page} /{' '}
              {Math.max(
                1,
                Math.ceil((products.data?.pagination.total ?? 0) / 20),
              )}
            </span>
            <button
              type="button"
              className="adm-button"
              disabled={
                query.page * 20 >= (products.data?.pagination.total ?? 0)
              }
              onClick={() => setQuery({ ...query, page: query.page + 1 })}
            >
              다음
            </button>
          </div>
        </div>
        <div className="outbound-fields">
          <label className="outbound-wide">
            납품 조건·메모
            <textarea
              name="note"
              maxLength={1000}
              defaultValue={base?.note ?? quote.note}
            />
          </label>
          <label className="outbound-wide">
            변경 사유
            <textarea name="reason" required maxLength={500} />
          </label>
        </div>
        <div className="outbound-actions">
          <button className="adm-button adm-primary" disabled={!lines.length}>
            <Save size={16} />
            {request.busy ? '저장 중...' : '초안 저장'}
          </button>
          <button className="adm-button" type="button" onClick={onCancel}>
            <X size={16} />
            닫기
          </button>
        </div>
      </fieldset>
      {request.error && (
        <p className="adm-form-error" role="alert">
          {request.error}
        </p>
      )}
      {request.stale && (
        <button type="button" className="adm-button" onClick={onDone}>
          <RefreshCw size={16} />
          최신 회신 다시 조회
        </button>
      )}
    </form>
  )
}

export function AdminOrderTools({
  order,
  onChanged,
}: {
  order: Order
  onChanged: () => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  if (order.closure) return null
  return (
    <div className="outbound-editor">
      {order.canCancel && (
        <div className="outbound-actions">
          <button
            className="adm-button adm-primary"
            onClick={() => setEditing('new')}
          >
            <Truck size={16} />
            출고 초안 생성
          </button>
          <OutboundAction
            admin
            label="미출고 잔여 취소"
            path={`/api/admin/orders/${order.id}/cancel`}
            values={{ version: order.version }}
            onDone={onChanged}
            destructive
          />
        </div>
      )}
      {order.state !== 'CANCELLATION_PENDING' &&
        order.shipments
          .filter((shipment) => shipment.status === 'DRAFT')
          .map((shipment) => (
            <button
              key={shipment.id}
              className="adm-button"
              onClick={() => setEditing(shipment.id)}
            >
              <Save size={16} />
              {shipment.code} 편집
            </button>
          ))}
      {editing && order.state !== 'CANCELLATION_PENDING' && (
        <ShipmentEditor
          key={`${editing}/${order.version}`}
          order={order}
          shipment={order.shipments.find((shipment) => shipment.id === editing)}
          onDone={() => {
            setEditing(null)
            onChanged()
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function ShipmentEditor({
  order,
  shipment,
  onDone,
  onCancel,
}: {
  order: Order
  shipment?: Shipment
  onDone: () => void
  onCancel: () => void
}) {
  const [quantities, setQuantities] = useState<Record<string, string>>(
    Object.fromEntries(
      order.items.map((item) => [
        item.id,
        shipment?.items.find((line) => line.orderItemId === item.id)
          ?.quantity ?? '0',
      ]),
    ),
  )
  const request = useSave(onDone)
  return (
    <form
      className="outbound-editor"
      onSubmit={(event) => {
        event.preventDefault()
        const fields = new FormData(event.currentTarget)
        const text = (name: string) => String(fields.get(name) ?? '').trim()
        void request.save(
          shipment
            ? `/api/admin/shipments/${shipment.id}`
            : `/api/admin/orders/${order.id}/shipments`,
          {
            version: shipment?.version ?? order.version,
            orderVersion: order.version,
            reason: text('reason'),
            scheduledAt: fromLocalDateTime(text('scheduledAt')),
            carrier: text('carrier'),
            vehicle: text('vehicle'),
            trackingNumber: text('trackingNumber'),
            note: text('note'),
            items: order.items
              .filter((item) => Number(quantities[item.id]) > 0)
              .map((item) => ({
                orderItemId: item.id,
                quantity: quantities[item.id],
              })),
          },
          shipment ? 'PUT' : 'POST',
        )
      }}
    >
      <h3>{shipment ? `${shipment.code} 출고 초안 수정` : '출고 초안 생성'}</h3>
      <fieldset disabled={request.busy || request.stale}>
        <div className="outbound-fields">
          <label>
            출고 예정 (한국시간)
            <input
              name="scheduledAt"
              type="datetime-local"
              defaultValue={toLocalDateTime(shipment?.scheduledAt ?? null)}
            />
          </label>
          <label>
            배송사
            <input
              name="carrier"
              maxLength={160}
              defaultValue={shipment?.carrier}
            />
          </label>
          <label>
            차량번호
            <input
              name="vehicle"
              maxLength={160}
              defaultValue={shipment?.vehicle}
            />
          </label>
          <label>
            운송장번호
            <input
              name="trackingNumber"
              maxLength={160}
              defaultValue={shipment?.trackingNumber}
            />
          </label>
          {order.items
            .filter((item) => Number(item.remainingQuantity) > 0)
            .map((item) => {
              const allocated = order.shipments
                .filter(
                  (entry) =>
                    entry.status === 'DRAFT' && entry.id !== shipment?.id,
                )
                .flatMap((entry) => entry.items)
                .filter((entry) => entry.orderItemId === item.id)
                .reduce((sum, entry) => sum + Number(entry.quantity), 0)
              const available = Math.max(
                0,
                Math.round(
                  (Number(item.remainingQuantity) - allocated) * 1000,
                ) / 1000,
              )
              return (
                <label key={item.id}>
                  {item.name} · 편성 가능 {available} {item.unit}
                  <input
                    aria-label={`${item.name} 출고 수량`}
                    type="number"
                    min={0}
                    max={available}
                    step={
                      ['EA', 'BOX', 'PIECE'].includes(item.unit) ? 1 : 0.001
                    }
                    value={quantities[item.id]}
                    onChange={(event) =>
                      setQuantities({
                        ...quantities,
                        [item.id]: event.target.value,
                      })
                    }
                  />
                </label>
              )
            })}
          <label className="outbound-wide">
            출고 메모
            <textarea
              name="note"
              maxLength={1000}
              defaultValue={shipment?.note}
            />
          </label>
          <label className="outbound-wide">
            변경 사유
            <textarea name="reason" required maxLength={500} />
          </label>
        </div>
        <div className="outbound-actions">
          <button
            className="adm-button adm-primary"
            disabled={
              !Object.values(quantities).some((value) => Number(value) > 0)
            }
          >
            <Save size={16} />
            {request.busy ? '저장 중...' : '출고 초안 저장'}
          </button>
          <button type="button" className="adm-button" onClick={onCancel}>
            <X size={16} />
            닫기
          </button>
        </div>
      </fieldset>
      {request.error && (
        <p className="adm-form-error" role="alert">
          {request.error}
        </p>
      )}
      {request.stale && (
        <button type="button" className="adm-button" onClick={onDone}>
          <RefreshCw size={16} />
          거래 다시 조회
        </button>
      )}
    </form>
  )
}

export default function AdminOrders() {
  return (
    <OrdersPage
      admin
      tools={(order, refresh) => (
        <AdminOrderTools
          key={order.version}
          order={order}
          onChanged={refresh}
        />
      )}
    />
  )
}
