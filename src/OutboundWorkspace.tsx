import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDownToLine,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  Truck,
  X,
} from 'lucide-react'
import { createUuid } from './uuid'
import { readAuthSession } from './authSession'
import { readAdminSession } from './adminAuthSession'
import { appraisalMoney } from './appraisal'
import {
  downloadOutbound,
  fromLocalDateTime,
  toLocalDateTime,
  outboundDate,
  outboundLabels,
  outboundRequest,
  outboundWrite,
  OutboundError,
  type Offer,
  type OfferResponse,
  type Order,
} from './outboundApi'
import './OutboundWorkspace.css'
import { HistoryEmpty, HistoryHeader, HistoryStatus, HistorySummary } from './CustomerHistory'

export function OutboundAction({
  admin = false,
  label,
  path,
  values,
  onDone,
  destructive = false,
  expiration,
}: {
  admin?: boolean
  label: string
  path: string
  values: Record<string, unknown>
  onDone: () => void
  destructive?: boolean
  expiration?: string | null
}) {
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const [expiryMode, setExpiryMode] = useState(
    expiration === null ? 'unlimited' : 'default',
  )
  const [expiryDate, setExpiryDate] = useState(() =>
    toLocalDateTime(
      expiration ?? new Date(Date.now() + 72 * 3600000).toISOString(),
    ),
  )
  const pending = useRef<{ key: string; body: Record<string, unknown> } | null>(
    null,
  )
  const working = useRef(false)
  const button = admin ? 'adm-button' : 'sa-button'
  if (!confirming)
    return (
      <button
        type="button"
        className={`${button} ${destructive ? '' : admin ? 'adm-primary' : 'sa-primary'}`}
        onClick={() => setConfirming(true)}
      >
        {destructive ? <X size={16} /> : <Check size={16} />}
        {label}
      </button>
    )
  return (
    <form
      className="outbound-confirm"
      onSubmit={async (event) => {
        event.preventDefault()
        if (working.current || stale) return
        const body = {
          ...values,
          reason,
          ...(expiration !== undefined && expiryMode !== 'default'
            ? {
                expiresAt:
                  expiryMode === 'unlimited'
                    ? null
                    : fromLocalDateTime(expiryDate),
              }
            : {}),
        }
        const key = JSON.stringify(body)
        if (pending.current?.key !== key)
          pending.current = {
            key,
            body: { ...body, operationId: createUuid() },
          }
        working.current = true
        setBusy(true)
        setError('')
        try {
          await outboundWrite(admin, path, pending.current.body)
          setConfirming(false)
          onDone()
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : '처리 실패')
          if (failure instanceof OutboundError && failure.status === 409)
            setStale(true)
        } finally {
          working.current = false
          setBusy(false)
        }
      }}
    >
      <strong>{label}</strong>
      {expiration !== undefined && (
        <>
          <label>
            회신 만료
            <select
              disabled={busy || stale}
              value={expiryMode}
              onChange={(event) => setExpiryMode(event.target.value)}
            >
              <option value="default">발송 후 72시간</option>
              <option value="unlimited">무기한</option>
              <option value="custom">직접 지정</option>
            </select>
          </label>
          {expiryMode === 'custom' && (
            <label>
              만료일 (한국시간)
              <input
                required
                type="datetime-local"
                value={expiryDate}
                disabled={busy || stale}
                onChange={(event) => setExpiryDate(event.target.value)}
              />
            </label>
          )}
        </>
      )}
      <label>
        처리 사유
        <textarea
          required
          maxLength={500}
          value={reason}
          disabled={busy || stale}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <label>
        <input type="checkbox" required disabled={busy || stale} />
        {label} 내용을 확인했습니다.
      </label>
      {error && (
        <p role="alert" className="customer-error">
          {error}
        </p>
      )}
      <div className="outbound-actions">
        <button className={button} disabled={busy || stale || !reason.trim()}>
          <Check size={16} />
          {busy ? '처리 중...' : '확정'}
        </button>
        {stale && (
          <button
            type="button"
            className={button}
            onClick={() => {
              setConfirming(false)
              setStale(false)
              pending.current = null
              onDone()
            }}
          >
            <RefreshCw size={16} />
            다시 조회
          </button>
        )}
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() => {
            setConfirming(false)
            setStale(false)
            setError('')
          }}
        >
          닫기
        </button>
      </div>
    </form>
  )
}

export function OfferSummary({ offer }: { offer: Offer }) {
  return (
    <section className="outbound-offer">
      <div className="outbound-heading">
        <h3>확정 견적 · {offer.revision}차</h3>
        <span className="outbound-status">
          {outboundLabels[offer.expired ? 'EXPIRED' : offer.status]}
        </span>
        <button
          className="sa-icon"
          title="확정 견적서 다운로드"
          aria-label="확정 견적서 다운로드"
          onClick={() => downloadOutbound(offer)}
        >
          <ArrowDownToLine size={18} />
        </button>
      </div>
      <dl className="outbound-facts">
        <div>
          <dt>회신일</dt>
          <dd>{outboundDate(offer.sentAt)}</dd>
        </div>
        <div>
          <dt>만료일</dt>
          <dd>{offer.expiresAt ? outboundDate(offer.expiresAt) : '없음'}</dd>
        </div>
        <div>
          <dt>납품</dt>
          <dd>
            {offer.address} · {offer.deliveryDate ?? '일정 미정'}
          </dd>
        </div>
        <div>
          <dt>담당</dt>
          <dd>
            {offer.contactName} · {offer.phone}
          </dd>
        </div>
      </dl>
      <div className="outbound-table" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th>상품·규격</th>
              <th>수량</th>
              <th>단가</th>
              <th>금액</th>
            </tr>
          </thead>
          <tbody>
            {offer.items.map((item) => (
              <tr key={item.id}>
                <td>
                  <div className="outbound-product">
                    {item.imageUrl && (
                      <img src={item.imageUrl} alt={item.name} />
                    )}
                    <span>
                      {item.name}
                      <small>
                        {item.specification} · {item.grade}등급
                      </small>
                    </span>
                  </div>
                </td>
                <td>
                  {item.quantity} {item.unit}
                </td>
                <td>{appraisalMoney(item.unitPrice)}</td>
                <td>{appraisalMoney(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="outbound-totals">
        <span>상품 {appraisalMoney(offer.itemTotal)}</span>
        <span>배송비 {appraisalMoney(offer.shippingFee)}</span>
        <strong>합계 {appraisalMoney(offer.grandTotal)}</strong>
        <small>VAT 포함</small>
      </div>
      {offer.note && <p className="outbound-note">{offer.note}</p>}
    </section>
  )
}

export function OrderSummary({
  order,
  manager = false,
  admin = false,
  onChanged,
  actions,
  heading,
}: {
  order: Order
  manager?: boolean
  admin?: boolean
  onChanged: () => void
  actions?: React.ReactNode
  heading?: string
}) {
  return (
    <section className="outbound-order">
      <div className="outbound-heading">
        <h2>{heading ?? order.code}</h2>
        <span className="outbound-status">{outboundLabels[order.state]}</span>
        <small>승인 {outboundDate(order.approvedAt)}</small>
      </div>
      <div className="outbound-table" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th>상품</th>
              <th>승인</th>
              <th>출고</th>
              <th>취소</th>
              <th>잔여</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.name}
                  {admin && item.assetId && <small>{item.assetId} · 위치 {item.locationId ?? '-'}</small>}
                </td>
                <td>
                  {item.quantity} {item.unit}
                </td>
                <td>{item.shippedQuantity}</td>
                <td>{item.cancelledQuantity}</td>
                <td>
                  <strong>{item.remainingQuantity}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="outbound-note">취소 상품 금액 {appraisalMoney(order.cancelledItemTotal)} · 승인 합계와 배송비는 보존</p>
      {!admin && manager && order.canCancel && (
        <OutboundAction
          label="미출고 잔여 취소 요청"
          path={`/api/customer/orders/${order.id}/cancellations`}
          values={{ version: order.version }}
          onDone={onChanged}
          destructive
        />
      )}
      {actions}
      <h3>{admin ? '출고 내역' : '배송별 진행 상황'}</h3>
      {!order.shipments.length && <p>{admin ? '확정된 출고 내역이 없습니다.' : '아직 출고된 자재가 없습니다. 출고가 확정되면 배송 정보가 표시됩니다.'}</p>}
      {order.shipments.map((shipment) => (
        <article className="outbound-shipment" key={shipment.id}>
          <div className="outbound-heading">
            <Truck size={18} />
            <h4>{shipment.code}</h4>
            <span className="outbound-status">
              {outboundLabels[shipment.status]}
            </span>
            {['DISPATCHED', 'DELIVERED'].includes(shipment.status) && (
              <button
                className="sa-icon"
                title="출고 명세서 다운로드"
                aria-label={`${shipment.code} 출고 명세서 다운로드`}
                onClick={() => downloadOutbound(order.offer, shipment, order)}
              >
                <ArrowDownToLine size={18} />
              </button>
            )}
          </div>
          <dl className="outbound-facts">
            <div>
              <dt>출고</dt>
              <dd>{outboundDate(shipment.dispatchedAt)}</dd>
            </div>
            <div>
              <dt>배송 완료</dt>
              <dd>{outboundDate(shipment.deliveredAt)}</dd>
            </div>
            <div>
              <dt>운송</dt>
              <dd>
                {shipment.deliveryMethod === 'SELF_PICKUP'
                  ? '직접 수령'
                  : '배송'}{' '}
                · {shipment.carrier || '-'} · {shipment.vehicle || '-'} ·{' '}
                {shipment.trackingNumber || '-'}
              </dd>
            </div>
          </dl>
          <ul>
            {shipment.items.map((item) => (
              <li key={item.orderItemId}>
                {order.items.find((row) => row.id === item.orderItemId)?.name} ·{' '}
                {item.quantity}{' '}
                {order.items.find((row) => row.id === item.orderItemId)?.unit}
              </li>
            ))}
          </ul>
          {shipment.note && <p className="outbound-note">{shipment.note}</p>}
          {admin && (
            <div className="outbound-actions">
              {shipment.status === 'DRAFT' &&
                order.state !== 'CANCELLATION_PENDING' && (
                  <OutboundAction
                    admin
                    label="출고 확정"
                    path={`/api/admin/shipments/${shipment.id}/dispatch`}
                    values={{
                      version: shipment.version,
                      orderVersion: order.version,
                    }}
                    onDone={onChanged}
                  />
                )}
              {shipment.status === 'DRAFT' && (
                <OutboundAction
                  admin
                  label="초안 취소"
                  path={`/api/admin/shipments/${shipment.id}/cancel`}
                  values={{
                    version: shipment.version,
                    orderVersion: order.version,
                  }}
                  onDone={onChanged}
                  destructive
                />
              )}
              {shipment.status === 'DISPATCHED' && (
                <OutboundAction
                  admin
                  label="배송 완료"
                  path={`/api/admin/shipments/${shipment.id}/deliver`}
                  values={{
                    version: shipment.version,
                    orderVersion: order.version,
                  }}
                  onDone={onChanged}
                />
              )}
            </div>
          )}
        </article>
      ))}
      {order.cancellations.length > 0 && (
        <>
          <h3>취소 이력</h3>
          {order.cancellations.map((entry) => (
            <article className="outbound-shipment" key={entry.id}>
              <div className="outbound-heading">
                <strong>{outboundLabels[entry.status]}</strong>
                <small>{outboundDate(entry.requestedAt)}</small>
              </div>
              <p>{entry.reason}</p>
              <ul>
                {entry.items.map((item) => (
                  <li key={item.orderItemId}>
                    {
                      order.items.find((row) => row.id === item.orderItemId)
                        ?.name
                    }{' '}
                    · {item.quantity}
                  </li>
                ))}
              </ul>
              {entry.decisionReason && (
                <p>
                  {entry.decisionReason} · {outboundDate(entry.decidedAt)}
                </p>
              )}
              {admin && entry.status === 'PENDING' && (
                <div className="outbound-actions">
                  <OutboundAction
                    admin
                    label="잔여 취소 승인"
                    path={`/api/admin/cancellations/${entry.id}/approve`}
                    values={{
                      version: entry.version,
                      orderVersion: order.version,
                    }}
                    onDone={onChanged}
                  />
                  <OutboundAction
                    admin
                    label="취소 거절"
                    path={`/api/admin/cancellations/${entry.id}/reject`}
                    values={{
                      version: entry.version,
                      orderVersion: order.version,
                    }}
                    onDone={onChanged}
                    destructive
                  />
                </div>
              )}
            </article>
          ))}
        </>
      )}
    </section>
  )
}

export function CustomerOfferPanel({
  quoteId,
  manager,
  owner,
}: {
  quoteId: string
  manager: boolean
  owner: string
}) {
  const client = useQueryClient()
  const queryKey = ['outbound', owner, quoteId]
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      outboundRequest<OfferResponse>(
        false,
        `/api/customer/quotes/${quoteId}/offers`,
        { signal },
      ),
    retry: false,
  })
  useEffect(
    () => () => {
      client.removeQueries({ queryKey: ['outbound', owner] })
    },
    [client, owner],
  )
  const refresh = () => {
    void client.invalidateQueries({ queryKey })
    void client.invalidateQueries({ queryKey: ['purchase-quotes', owner] })
    void client.invalidateQueries({ queryKey: ['outbound-orders'] })
  }
  return (
    <div className="outbound-workspace">
      <div className="outbound-heading">
        <h2>회신된 견적과 진행 상황</h2>
        <button
          className="sa-icon"
          title="회신 새로고침"
          aria-label="회신 새로고침"
          onClick={refresh}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      {query.isPending && <p role="status">회신을 불러오는 중...</p>}
      {query.error && (
        <p className="customer-error" role="alert">
          {query.error.message}
        </p>
      )}
      {query.data && (
        <>
          {!query.data.offers.length && <p className="history-waiting">견적을 검토하고 있습니다. 회신이 도착하면 상품 가격과 배송 조건을 확인할 수 있습니다.</p>}
          {query.data.order && (
            <OrderSummary
              order={query.data.order}
              manager={manager}
              onChanged={refresh}
            />
          )}
          {query.data.offers.map((offer) => (
            <div key={`${offer.id}/${offer.version}`}>
              <OfferSummary offer={offer} />
              {!query.data.order &&
                offer.status === 'SENT' &&
                !offer.expired && (
                  <div className="outbound-actions">
                    <OutboundAction
                      label="견적 승인 및 출고 요청"
                      path={`/api/customer/offers/${offer.id}/accept`}
                      values={{ version: offer.version }}
                      onDone={refresh}
                    />
                    {manager && (
                      <OutboundAction
                        label="견적 거절"
                        path={`/api/customer/offers/${offer.id}/decline`}
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
    </div>
  )
}

export function OrdersPage({
  admin = false,
  manager = false,
  tools,
}: {
  admin?: boolean
  manager?: boolean
  tools?: (order: Order, refresh: () => void) => React.ReactNode
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const scope = admin ? 'admin' : 'customer'
  const owner = admin ? readAdminSession()?.user.id : readAuthSession()?.user.id
  const client = useQueryClient()
  useEffect(
    () => () => {
      client.removeQueries({ queryKey: ['outbound-orders', scope, owner] })
    },
    [client, scope, owner],
  )
  const list = useQuery({
    queryKey: ['outbound-orders', scope, owner, page, query],
    queryFn: ({ signal }) =>
      outboundRequest<{ records: Order[]; total: number; summary: Record<string, number> }>(
        admin,
        `/api/${scope}/orders?page=${page}&q=${encodeURIComponent(query)}`,
        { signal },
      ),
    enabled: !selected,
    retry: false,
  })
  const detail = useQuery({
    queryKey: ['outbound-orders', scope, owner, selected],
    queryFn: ({ signal }) =>
      outboundRequest<{ order: Order }>(
        admin,
        `/api/${scope}/orders/${selected}`,
        { signal },
      ),
    enabled: !!selected,
    retry: false,
  })
  const button = admin ? 'adm-button' : 'sa-button'
  return (
    <div className={`outbound-workspace ${admin ? '' : 'customer-history'}`}>
      {!admin && <HistoryHeader kind="orders" detail={selected ? detail.data?.order.code ?? '주문 상세' : undefined} onBack={selected ? () => setSelected(null) : undefined} status={selected && detail.data ? outboundLabels[detail.data.order.state] : undefined} actions={selected ? <button className="sa-icon" title="주문 상세 새로고침" aria-label="주문 상세 새로고침" disabled={detail.isFetching} onClick={() => { void detail.refetch() }}><RefreshCw size={16} /></button> : undefined} />}
      {selected ? (
        <>
          {admin && <><button className={button} onClick={() => setSelected(null)}>
            <ArrowLeft size={16} />
            목록으로
          </button>
          <button className={button} title="거래 상세 새로고침" aria-label="거래 상세 새로고침" disabled={detail.isFetching} onClick={() => { void detail.refetch() }}><RefreshCw size={16} /></button></>}
          {detail.data && (
            <>
              <OfferSummary offer={detail.data.order.offer} />
              <OrderSummary
                key={detail.data.order.version}
                order={detail.data.order}
                heading={admin ? undefined : '출고·배송 현황'}
                admin={admin}
                manager={manager}
                onChanged={() => {
                  void detail.refetch()
                }}
                actions={tools?.(detail.data.order, () => {
                  void detail.refetch()
                })}
              />
            </>
          )}
        </>
      ) : (
        <>
          <form
            className="outbound-actions"
            onSubmit={(event) => {
              event.preventDefault()
              setPage(1)
              setQuery(search)
            }}
          >
            <label>
              {admin ? '거래 검색' : '주문 검색'}
              <input
                type="search"
                placeholder={admin ? undefined : '주문번호 · 담당자'}
                maxLength={160}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <button className={`${button} ${admin ? '' : 'sa-primary'}`}>
              <Search size={16} />
              검색
            </button>
            {!admin && <button className="sa-button" type="button" onClick={() => { setSearch(''); setQuery(''); setPage(1) }}>초기화</button>}
            <button
              className={button}
              type="button"
              title="새로고침"
              aria-label="거래 새로고침"
              onClick={() => {
                void list.refetch()
              }}
            >
              <RefreshCw size={16} />
            </button>
          </form>
          {!admin && list.data && <div className="history-results"><span>주문 내역 <strong>{list.data.total.toLocaleString()}</strong>건</span><span>고객사 전체 내역</span></div>}
          {!admin && list.data && <HistorySummary counts={list.data.summary} labels={Object.fromEntries(['PREPARING', 'PARTIALLY_SHIPPED', 'IN_DELIVERY', 'CANCELLATION_PENDING', 'COMPLETED', 'CANCELLED', 'CLOSED_PARTIAL_CANCELLED'].map(state => [state, outboundLabels[state as Order['state']]]))} title="검색 범위 전체 주문 상태별 건수" />}
          <div className="outbound-table" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th>{admin ? '거래번호' : '주문번호'}</th>
                  <th>담당자</th>
                  <th>승인일</th>
                  <th>확정 금액</th>
                  <th>상태</th>
                  <th>상세</th>
                </tr>
              </thead>
              <tbody>
                {list.data?.records.map((order) => (
                  <tr key={order.id}>
                    <td>{admin ? order.code : <button className="history-record-link" onClick={() => setSelected(order.id)}>{order.code}</button>}</td>
                    <td>{order.offer.contactName}</td>
                    <td>{outboundDate(order.approvedAt)}</td>
                    <td>{appraisalMoney(order.offer.grandTotal)}</td>
                    <td>{admin ? outboundLabels[order.state] : <HistoryStatus>{outboundLabels[order.state]}</HistoryStatus>}</td>
                    <td>
                      <button
                        className={admin ? button : 'history-view'}
                        aria-label={`${order.code} ${admin ? '거래' : '주문'} 상세보기`}
                        onClick={() => setSelected(order.id)}
                      >
                        {admin ? '상세' : <>상세보기<ChevronRight size={14} /></>}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.data && !list.data.records.length && (
            admin ? <p>승인된 거래가 없습니다.</p> : <HistoryEmpty kind="orders" filtered={!!query} />
          )}
          <div className={admin ? 'outbound-actions' : 'customer-pagination'}>
            <button
              className={admin ? button : 'sa-icon'}
              title="이전 페이지"
              disabled={page === 1}
              aria-label="이전 페이지"
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              {page} / {Math.max(1, Math.ceil((list.data?.total ?? 0) / 20))}
            </span>
            <button
              className={admin ? button : 'sa-icon'}
              title="다음 페이지"
              disabled={page * 20 >= (list.data?.total ?? 0)}
              aria-label="다음 페이지"
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </>
      )}
      {(selected ? detail.isPending : list.isPending) && (
        <p role="status">불러오는 중...</p>
      )}
      {(selected ? detail.error : list.error) && (
        <p role="alert" className="customer-error">
          {(selected ? detail.error : list.error)?.message}
        </p>
      )}
    </div>
  )
}
