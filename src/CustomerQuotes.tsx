import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDownToLine,
  ArrowLeft,
  Box,
  ChevronLeft,
  ChevronRight,
  FileText,
  RefreshCw,
  Search
} from 'lucide-react'
import type { AuthSession } from './authSession'
import { appraisalMoney } from './appraisal'
import { createUuid } from './uuid'
import { useCartStore } from './cartStore'
import {
  downloadPurchaseQuote,
  quoteRequest,
  QuoteRequestError,
  type PurchaseQuote,
  type QuoteDraft,
  type QuotePreview
} from './purchaseQuotes'
import './QuoteHistory.css'
import './CustomerQuotes.css'
import { CustomerOfferPanel } from './OutboundWorkspace'
import { HistoryEmpty, HistoryHeader, HistoryStatus } from './CustomerHistory'

function Items({ data }: { data: QuotePreview | PurchaseQuote }) {
  return (
    <section className="sm-request-items" aria-label="견적 요청 상품">
      <div className="sa-section-title">
        <h2>요청 상품</h2>
        <span>{data.items.length}종</span>
      </div>
      {data.items.map((item) => (
        <div className="sm-request-item" key={item.productId}>
          <span className="sa-thumbnail">
            {item.imageUrl ? (
              <img src={item.imageUrl} alt={item.name} />
            ) : (
              <Box size={24} />
            )}
          </span>
          <div>
            <h3>{item.name}</h3>
            <p>
              {item.productId} · {item.category} · {item.grade}등급
            </p>
            <p>
              {appraisalMoney(item.unitPrice)} / {item.unit}
            </p>
            <span>
              {item.quantity} {item.unit}
            </span>
          </div>
          <strong>{appraisalMoney(item.total)}</strong>
        </div>
      ))}
      <div className="sm-quote-total">
        <span>예상 상품 금액</span>
        <strong>{appraisalMoney(data.total)}</strong>
      </div>
      <p className="sa-form-note">
        VAT 포함 · 배송비 별도 협의 · 재고 예약 없음
      </p>
    </section>
  )
}
function Detail({ quote, back, session }: { quote: PurchaseQuote; back: () => void; session: AuthSession }) {
  return (
    <article className="qh-detail">
      <HistoryHeader kind="quotes" detail={quote.code} onBack={back} status="요청 접수 완료" actions={
        <button
          className="sa-button"
          onClick={() => downloadPurchaseQuote(quote)}
        >
          <ArrowDownToLine size={16} />
          요청서 다운로드
        </button>
      } />
      <div className="qh-detail-grid">
        <CustomerOfferPanel quoteId={quote.id} manager={session.user.customerRole === 'MANAGER'} owner={`${session.user.id}/${session.user.customerId}`} />
        <Items data={quote} />
        <section className="qh-requester">
          <h3>요청 정보</h3>
          <dl>
            {[
              ['견적 요청일', new Date(quote.createdAt).toLocaleString('ko-KR')],
              ['고객사', quote.company],
              ['담당자', quote.contactName],
              ['연락처', quote.phone],
              ['이메일', quote.email],
              ['납품 주소', quote.address],
              ['희망 납기일', quote.deliveryDate],
              ['요청사항', quote.note]
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value || '-'}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </article>
  )
}
export function CustomerQuoteRequest({
  session,
  draft,
  onBack,
  onDone
}: {
  session: AuthSession
  draft: QuoteDraft
  onBack: () => void
  onDone: (quote: PurchaseQuote) => void
}) {
  const client = useQueryClient()
  const token = session.accessToken
  const [today] = useState(() => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10))
  const [form, setForm] = useState({
    name: session.user.managerName,
    phone: session.user.managerPhone ?? '',
    email: session.user.email,
    address: (session.user.customer?.address ?? '').slice(0, 300),
    deliveryDate: '',
    note: ''
  })
  const [changed, setChanged] = useState<QuotePreview | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  const operation = useRef<{ serialized: string; id: string } | null>(null)
  const submitting = useRef(false)
  const preview = useQuery({
    queryKey: ['quote-preview', session.user.id, draft],
    queryFn: ({ signal }) =>
      quoteRequest<QuotePreview>(
        '/api/customer/quotes/preview',
        token,
        draft,
        signal
      ),
    retry: false
  })
  const data = changed ?? preview.data
  const mutation = useMutation({
    mutationFn: (body: unknown) =>
      quoteRequest<{ quote: PurchaseQuote }>(
        '/api/customer/quotes',
        token,
        body
      ),
    retry: false
  })
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
    window.scrollTo(0, 0)
  }, [])
  const submit = async () => {
    if (!data || submitting.current || (changed && !confirmed)) return
    submitting.current = true
    setError('')
    const fields = {
      ...draft,
      expectedSnapshot: data.snapshot,
      contact: { name: form.name, phone: form.phone, email: form.email },
      address: form.address,
      deliveryDate: form.deliveryDate || null,
      note: form.note
    }
    const serialized = JSON.stringify(fields)
    try {
      if (operation.current?.serialized !== serialized)
        operation.current = { serialized, id: createUuid() }
      const result = await mutation.mutateAsync({
        ...fields,
        operationId: operation.current.id
      })
      await Promise.allSettled([
        client.invalidateQueries({ queryKey: ['cart'] }),
        client.invalidateQueries({ queryKey: ['purchase-quotes'] })
      ])
      useCartStore.getState().message('견적 요청이 접수되었습니다.')
      onDone(result.quote)
    } catch (failure) {
      if (failure instanceof QuoteRequestError && failure.preview) {
        setChanged(failure.preview)
        setConfirmed(false)
      }
      setError(
        failure instanceof Error ? failure.message : '견적 요청에 실패했습니다.'
      )
    } finally {
      submitting.current = false
    }
  }
  return (
    <article className="sm-request-page customer-quotes">
      <div className="sm-detail-title">
        <button
          className="sa-icon"
          title="마켓으로"
          aria-label="마켓으로"
          disabled={mutation.isPending}
          onClick={onBack}
        >
          <ArrowLeft size={18} />
        </button>
        <h1 ref={heading} tabIndex={-1}>
          구매 견적 요청
        </h1>
      </div>
      {(error || preview.error) && (
        <div className="customer-error" role="alert">
          {error || preview.error?.message}
          {!data && (
            <button
              className="sa-button"
              onClick={() => void preview.refetch()}
            >
              <RefreshCw size={16} />
              다시 확인
            </button>
          )}
        </div>
      )}
      {preview.isPending ? (
        <p role="status">상품 가격과 재고를 확인하는 중...</p>
      ) : (
        data && (
          <div className="sm-request-layout">
            <Items data={data} />
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void submit()
              }}
            >
              <div className="sm-quote-fields">
                <h2>견적 요청 사항</h2>
                <label>
                  고객사
                  <input value={data.company} readOnly />
                </label>
                {(
                  ['name', 'phone', 'email', 'address', 'deliveryDate'] as const
                ).map((field) => (
                  <label key={field}>
                    {
                      {
                        name: '담당자명',
                        phone: '연락처',
                        email: '이메일',
                        address: '납품 주소',
                        deliveryDate: '희망 납기일'
                      }[field]
                    }
                    <span>
                      {field === 'name' || field === 'phone' ? '필수' : '선택'}
                    </span>
                    <input
                      name={field}
                      required={field === 'name' || field === 'phone'}
                      type={
                        field === 'email'
                          ? 'email'
                          : field === 'phone'
                            ? 'tel'
                            : field === 'deliveryDate'
                              ? 'date'
                              : 'text'
                      }
                      min={
                        field === 'deliveryDate'
                            ? today
                          : undefined
                      }
                      maxLength={
                        {
                          name: 80,
                          phone: 40,
                          email: 254,
                          address: 300,
                          deliveryDate: 10
                        }[field]
                      }
                      value={form[field]}
                      disabled={mutation.isPending}
                      onChange={(event) =>
                        setForm({ ...form, [field]: event.target.value })
                      }
                    />
                  </label>
                ))}
                <label>
                  요청사항<span>선택</span>
                  <textarea
                    rows={4}
                    maxLength={1000}
                    value={form.note}
                    disabled={mutation.isPending}
                    onChange={(event) =>
                      setForm({ ...form, note: event.target.value })
                    }
                  />
                </label>
                {changed && (
                  <label className="quote-confirm">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(event) => setConfirmed(event.target.checked)}
                    />
                    변경된 상품 정보와 금액 {appraisalMoney(preview.data?.total ?? data.total)} → {appraisalMoney(data.total)}을
                    확인했습니다.
                  </label>
                )}
                <div className="sm-quote-actions">
                  <button
                    className="sa-button"
                    type="button"
                    disabled={mutation.isPending}
                    onClick={onBack}
                  >
                    취소
                  </button>
                  <button
                    className="sa-button sa-primary"
                    disabled={mutation.isPending || (!!changed && !confirmed)}
                  >
                    <FileText size={16} />
                    {mutation.isPending ? '접수 중...' : '견적 요청'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )
      )}
    </article>
  )
}
export default function CustomerQuotes({
  session,
  selected,
  select,
  initial
}: {
  session: AuthSession
  selected: string | null
  select: (id: string | null) => void
  initial?: PurchaseQuote | null
}) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const client = useQueryClient()
  const owner = `${session.user.id}/${session.user.customerId}`
  useEffect(
    () => () => {
      client.removeQueries({ queryKey: ['purchase-quotes', owner] })
      client.removeQueries({ queryKey: ['quote-preview', session.user.id] })
    },
    [client, owner, session.user.id]
  )
  const list = useQuery({
    queryKey: ['purchase-quotes', owner, page, query],
    enabled: !selected,
    queryFn: ({ signal }) =>
      quoteRequest<{
        records: PurchaseQuote[]
        page: number
        size: number
        total: number
      }>(
        `/api/customer/quotes?page=${page}&size=20&q=${encodeURIComponent(query)}`,
        session.accessToken,
        undefined,
        signal
      ),
    retry: false
  })
  const detail = useQuery({
    queryKey: ['purchase-quotes', owner, 'detail', selected],
    enabled: !!selected,
    queryFn: ({ signal }) =>
      quoteRequest<PurchaseQuote>(
        `/api/customer/quotes/${selected}`,
        session.accessToken,
        undefined,
        signal
      ),
    initialData: initial?.id === selected ? initial : undefined,
    retry: false
  })
  if (selected)
    return (
      <div className="customer-quotes customer-history">
        {!detail.data && <HistoryHeader kind="quotes" detail="구매 견적 상세" onBack={() => select(null)} />}
        {detail.error && (
          <p className="customer-error" role="alert">
            {detail.error.message}
          </p>
        )}
        {detail.data ? (
          <Detail quote={detail.data} back={() => select(null)} session={session} />
        ) : (
          <>
            {detail.isPending && <p role="status">요청서를 불러오는 중...</p>}
          </>
        )}
      </div>
    )
  return (
    <section className="qh-list customer-quotes customer-history" aria-label="구매 견적 내역">
      <HistoryHeader kind="quotes" />
      <form
        className="customer-quote-search"
        onSubmit={(event) => {
          event.preventDefault()
          setQuery(search)
          setPage(1)
        }}
      >
        <label>견적 검색<input
          aria-label="구매 견적 검색"
          placeholder="견적번호 · 담당자 · 상품명"
          maxLength={160}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        /></label>
        <button className="sa-button sa-primary">
          <Search size={16} />
          검색
        </button>
        <button className="sa-button" type="button" onClick={() => { setSearch(''); setQuery(''); setPage(1) }}>초기화</button>
        <button
          className="sa-icon"
          type="button"
          title="새로고침"
          aria-label="견적 내역 새로고침"
          onClick={() => void list.refetch()}
        >
          <RefreshCw size={16} />
        </button>
      </form>
      {list.error && (
        <p className="customer-error" role="alert">
          {list.error.message}
        </p>
      )}
      {list.isPending ? (
        <p role="status">견적 내역을 불러오는 중...</p>
      ) : (
        <>
          {list.data && <div className="history-results"><span>견적 내역 <strong>{list.data.total.toLocaleString()}</strong>건</span><span>고객사 전체 내역</span></div>}
          <div className="sa-table-scroll">
            <table className="sa-table">
              <thead>
                <tr>
                  {[
                    '견적번호',
                    '접수일',
                    '요청자',
                    '예상 상품 금액',
                    '희망 납기',
                    '요청 상태',
                    '상세'
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.data?.records.map((quote) => (
                  <tr key={quote.id}>
                    <td>
                      <button
                        className="history-record-link"
                        onClick={() => select(quote.id)}
                      >
                        {quote.code}
                      </button>
                    </td>
                    <td>
                      {new Date(quote.createdAt).toLocaleDateString('ko-KR')}
                    </td>
                    <td>{quote.contactName}</td>
                    <td>{appraisalMoney(quote.total)}</td>
                    <td>{quote.deliveryDate ?? '-'}</td>
                    <td><HistoryStatus>접수 완료</HistoryStatus></td>
                    <td><button className="history-view" aria-label={`${quote.code} 견적 상세보기`} onClick={() => select(quote.id)}>상세보기<ChevronRight size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.data?.total === 0 && (
            <HistoryEmpty kind="quotes" filtered={!!query} />
          )}
          <div className="customer-pagination">
            <button
              className="sa-icon"
              title="이전 페이지"
              aria-label="이전 견적 페이지"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={20} />
            </button>
            <span>
              {page} / {Math.max(1, Math.ceil((list.data?.total ?? 0) / 20))}
            </span>
            <button
              className="sa-icon"
              title="다음 페이지"
              aria-label="다음 견적 페이지"
              disabled={page * 20 >= (list.data?.total ?? 0)}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </>
      )}
    </section>
  )
}
