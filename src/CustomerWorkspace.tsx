import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Archive, ArrowDownToLine, ArrowLeft, Box, ChevronLeft, ChevronRight, ClipboardCheck, LayoutDashboard, MapPin, RefreshCw, Save, Search, ShoppingCart, UserRound, Warehouse } from 'lucide-react'
import AdminShell from './AdminShell'
import LoginPage from './LoginPage'
import PublicMarket from './PublicMarket'
import { authenticatedFetch, readAuthSession, signIn, type AuthSession } from './authSession'
import { accountRequest } from './customerAccounts'
import { useHistoryState } from './useHistoryState'
import { ReceivingRequestButton, ReceivingRequestProvider } from './ReceivingRequest'
import { submitReceiving } from './receivings'
import CustomerReceivings from './CustomerReceivings'
import CustomerInspections from './CustomerInspections'
import SaleRegistration from './SaleRegistration'
import './App.css'
import './ShopifyAssetDetail.css'
import './CustomerWorkspace.css'
import { CartProvider, CartQueryProvider } from './CartProvider'
import Cart from './Cart'
import CustomerQuotes, { CustomerQuoteRequest } from './CustomerQuotes'
import type { PurchaseQuote, QuoteDraft } from './purchaseQuotes'
import { OrdersPage } from './OutboundWorkspace'

import { appraisalMoney, appraisalTotal } from './appraisal'

type AssetRecord = { canRequestSale?: boolean; saleRequest?: { id: string; status: string; desiredAmount: string; createdAt: string } | null; id: string; name: string; itemId: string | null; receivingId: string; category: { id: string; name: string; path: string } | null; specification: string; brand: string; grade: string; quantity: string; unit: string; appraisalValue: string | null; storageStatus: string; saleStatus: string; locationId: string | null; thumbnailUrl?: string | null; createdAt: string; images?: Array<{ id: string; name: string; url: string }> }
type Summary = { total: number; appraisalValue: string | null; unappraised: number; groups: Array<{ storageStatus: string; saleStatus: string; count: number }>; quantities: Array<{ unit: string; quantity: string }> }
type Page = { data: AssetRecord[]; meta: { page: number; size: number; totalElements: number; totalPages: number } }
const storageLabels: Record<string, string> = { PENDING: '입고 대기', STORED: '보관 중', RELEASED: '출고 완료' }
const saleLabels: Record<string, string> = { PENDING: '판매 대기', ON_SALE: '판매 중', SOLD: '판매 완료' }
const money = appraisalMoney
const date = (value: string) => new Date(value).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })

export default function CustomerWorkspace() {
  return <CartQueryProvider><CustomerWorkspaceContent /></CartQueryProvider>
}

function CustomerWorkspaceContent() {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [checking, setChecking] = useState(!!readAuthSession())
  const [guest, setGuest] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const expired = () => { setSession(null); setChecking(false); setError('로그인 상태가 만료되었거나 접근 권한이 변경되었습니다.') }
    window.addEventListener('mrs-auth-expired', expired)
    const stored = readAuthSession()
    if (stored) {
      accountRequest<{ user: AuthSession['user'] }>('/api/auth/me', { signal: controller.signal }).then(({ user }) => {
        if (controller.signal.aborted) return
        setSession({ accessToken: stored.accessToken, user })
        setError('')
      }).catch((reason) => { if (!controller.signal.aborted) { setSession(null); setError(reason instanceof Error ? reason.message : '계정 확인에 실패했습니다.') } }).finally(() => { if (!controller.signal.aborted) setChecking(false) })
    }
    return () => { controller.abort(); window.removeEventListener('mrs-auth-expired', expired) }
  }, [revision])
  if (checking) return <main className="customer-session" role="status">계정 확인 중...</main>
  if (session) return <CartProvider key={`${session.user.id}/${session.user.customerId}/${session.accessToken}`} session={session}><MemberWorkspace session={session} /></CartProvider>
  if (guest) return <CartProvider session={null}><AdminShell navigation={<button className="nav-button" onClick={() => setGuest(false)}><UserRound />로그인</button>} customerName="게스트" isGuest readOnly className="customer-workspace sm-market"><main className="sa-main"><PublicMarket onLogin={() => setGuest(false)} /></main><Cart onLogin={() => setGuest(false)} /></AdminShell></CartProvider>
  return <>{error && <div className="customer-session" role="alert">{error}<button className="sa-button" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={16} />다시 확인</button></div>}<LoginPage onLogin={async (email, password) => {
    const next = await signIn(email, password)
    setSession(next)
    setError('')
  }} onBrowse={() => setGuest(true)} onCustomerAccess={() => setRevision((value) => value + 1)} /></>
}

function MemberWorkspace({ session }: { session: AuthSession }) {
  const [view, setView] = useHistoryState<'overview' | 'assets' | 'profile' | 'market' | 'receivings' | 'inspections' | 'quotes' | 'orders'>(`company-view:${session.user.id}:${session.user.customerId}`, 'overview')
  const [quoteDraft, setQuoteDraft] = useState<QuoteDraft | null>(null)
  const [completedQuote, setCompletedQuote] = useState<PurchaseQuote | null>(null)
  const [quoteId, selectQuote] = useHistoryState<string | null>(`quote-detail:${session.user.id}:${session.user.customerId}`, null)
  const [selectedId, selectId, back] = useHistoryState<string | null>(`company-asset:${session.user.id}:${session.user.customerId}`, null)
  const [receivingId, selectReceiving, backReceiving] = useHistoryState<string | null>(`receiving-detail:${session.user.id}:${session.user.customerId}`, null)
  const [receivingParameters, setReceivingParameters] = useHistoryState<Record<string, string>>(`receiving-query:${session.user.id}:${session.user.customerId}`, { page: '1', size: '20' })
  const [parameters, setParameters] = useHistoryState<Record<string, string>>(`company-query:${session.user.id}:${session.user.customerId}`, { page: '1', size: '20', sort: 'updatedDesc' })
  const [loadedPage, setPage] = useState<Page | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [detail, setDetail] = useState<AssetRecord | null>(null)
  const [loadedKey, setLoadedKey] = useState('')
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const company = session.user.customer
  const parametersKey = new URLSearchParams(parameters).toString()
  const loadKey = `${parametersKey}/${selectedId}/${revision}`
  const loading = loadedKey !== loadKey
  const page = loading ? null : loadedPage
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      authenticatedFetch(`/api/assets?${parametersKey}`, { signal: controller.signal }).then(async (response) => { if (!response.ok) { const body = await response.json(); throw new Error(body.error?.message ?? '자산을 불러오지 못했습니다.') } return response.json() as Promise<Page> }),
      accountRequest<Summary>('/api/assets/summary', { signal: controller.signal }),
      selectedId ? accountRequest<{ asset: AssetRecord }>(`/api/assets/${encodeURIComponent(selectedId)}`, { signal: controller.signal }) : Promise.resolve(null),
    ]).then(([records, totals, selected]) => { if (!controller.signal.aborted) { setError(''); setPage(records); setSummary(totals); setDetail(selected?.asset ?? null) } }).catch((reason) => { if (!controller.signal.aborted) { setPage(null); setDetail(null); setSummary(null); setError(reason instanceof Error ? reason.message : '조회에 실패했습니다.') } }).finally(() => { if (!controller.signal.aborted) setLoadedKey(loadKey) })
    return () => controller.abort()
  }, [parametersKey, selectedId, revision, loadKey])
  useEffect(() => {
    const revalidate = () => { if (document.visibilityState === 'visible') setRevision((value) => value + 1) }
    window.addEventListener('focus', revalidate)
    window.addEventListener('pageshow', revalidate)
    const timer = window.setInterval(revalidate, 60_000)
    return () => { window.removeEventListener('focus', revalidate); window.removeEventListener('pageshow', revalidate); window.clearInterval(timer) }
  }, [])
  const navigate = (next: typeof view) => { setQuoteDraft(null); if (selectedId) selectId(null); setView(next) }
  const navigation = <>{([{ id: 'overview', label: '자산 현황', Icon: LayoutDashboard }, { id: 'assets', label: '자산 목록', Icon: Archive }, { id: 'receivings', label: '입고 신청 내역', Icon: ClipboardCheck }, { id: 'inspections', label: '검수·폐기 내역', Icon: ClipboardCheck }, { id: 'market', label: '마켓', Icon: ShoppingCart }, { id: 'quotes', label: '구매 견적 내역', Icon: ClipboardCheck }, { id: 'orders', label: '구매·출고 내역', Icon: Box }, { id: 'profile', label: '계정 정보', Icon: UserRound }] as const).map(({ id, label, Icon }) => <button key={id} className={`nav-button ${view === id ? 'active' : ''}`} onClick={() => navigate(id)} aria-current={view === id ? 'page' : undefined}><Icon size={18} />{label}</button>)}</>
  const applySearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const next: Record<string, string> = { page: '1', size: parameters.size ?? '20' }
    for (const [key, value] of data) if (String(value).trim()) next[key] = String(value).trim()
    setParameters(next)
  }
  return <ReceivingRequestProvider contact={{ name: session.user.managerName, phone: session.user.managerPhone ?? '' }} onSubmit={async (form) => { const receiving = await submitReceiving(form); setRevision((value) => value + 1); return receiving }} onViewHistory={() => { selectReceiving(null); setReceivingParameters({ page: '1', size: '20' }); navigate('receivings') }}><AdminShell navigation={navigation} customerName={company?.name ?? session.user.companyName} readOnly className="customer-workspace"><main className="sa-main">
    {!quoteDraft && !selectedId && view !== 'market' && <div className="sa-heading"><div><div className="sa-breadcrumb">{company?.name ?? session.user.companyName}</div><h1>{view === 'overview' ? '자산 현황' : view === 'assets' ? '자산 목록' : view === 'receivings' ? '입고 신청 내역' : view === 'inspections' ? '검수·폐기 내역' : view === 'quotes' ? '구매 견적 내역' : view === 'orders' ? '구매·출고 내역' : '계정 정보'}</h1></div>{!['quotes', 'orders'].includes(view) && <div className="customer-heading-actions"><ReceivingRequestButton /><button className="sa-icon" aria-label="새로고침" title="새로고침" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={18} /></button></div>}</div>}
    {!quoteDraft && !['receivings', 'inspections', 'quotes', 'orders'].includes(view) && error && <p className="customer-error" role="alert">{error}</p>}
    {!quoteDraft && !['receivings', 'inspections', 'quotes', 'orders'].includes(view) && loading && <p role="status">불러오는 중...</p>}
    {quoteDraft ? <CustomerQuoteRequest session={session} draft={quoteDraft} onBack={() => setQuoteDraft(null)} onDone={quote => { setCompletedQuote(quote); setQuoteDraft(null); selectQuote(quote.id); setView('quotes') }} /> : view === 'orders' ? <OrdersPage manager={session.user.customerRole === 'MANAGER'} /> : view === 'quotes' ? <CustomerQuotes session={session} selected={quoteId} select={selectQuote} initial={completedQuote} /> : view === 'inspections' ? <CustomerInspections historyKey={`${session.user.id}:${session.user.customerId}`} manager={session.user.customerRole === 'MANAGER'} revision={revision} onAsset={(id) => { setView('assets'); selectId(id) }} /> : view === 'receivings' ? <CustomerReceivings revision={revision} parameters={receivingParameters} setParameters={setReceivingParameters} selected={receivingId} select={selectReceiving} back={backReceiving} /> : selectedId ? <>{(loading || !detail) && <div className="customer-heading-actions"><button className="sa-button" onClick={back}><ArrowLeft size={16} />목록으로</button><button className="sa-icon" aria-label="새로고침" title="새로고침" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={18} /></button></div>}{!loading && detail && <AssetDetails key={detail.id} asset={detail} records={loadedPage?.data ?? []} onBack={back} onNavigate={selectId} onRefresh={() => setRevision((value) => value + 1)} />}</>
      : view === 'profile' ? <section className="customer-section"><dl className="customer-data">{[['고객사', company?.name ?? session.user.companyName], ['사업자등록번호', company?.businessNumber ?? '미확인'], ['대표자', company?.representativeName ?? ''], ['사업장 주소', company?.address ?? ''], ['대표 연락처', company?.phone ?? ''], ['담당자', session.user.managerName], ['이메일', session.user.email], ['담당자 연락처', session.user.managerPhone ?? ''], ['권한', session.user.customerRole === 'MANAGER' ? '고객사 관리자' : '조회자']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '미등록'}</dd></div>)}</dl></section>
        : view === 'market' ? <div className="sm-market"><PublicMarket member onRequestQuote={setQuoteDraft} /></div>
          : view === 'overview' ? !loading && summary && <>
            <section className="customer-summary"><div><span>보유 자산 평가금액</span><strong>{money(summary.appraisalValue)}</strong><small>미평가 {summary.unappraised.toLocaleString()}건</small></div><div><span>보유 자산</span><strong>{summary.total.toLocaleString()}건</strong><small>출고 완료 제외</small></div></section>
            <section className="customer-section"><h2>보관 상태</h2><div className="customer-status-grid">{(['PENDING', 'STORED'] as const).map((status) => <button key={status} onClick={() => { setParameters({ page: '1', size: '20', sort: 'updatedDesc', storageStatus: status }); setView('assets') }}><span>{storageLabels[status]}</span><strong>{summary.groups.filter((group) => group.storageStatus === status).reduce((total, group) => total + group.count, 0)}건</strong><ChevronRight size={18} /></button>)}</div></section>
            <section className="customer-section"><h2>보유 수량</h2><dl className="customer-data">{summary.quantities.map((entry) => <div key={entry.unit}><dt>{entry.unit}</dt><dd>{entry.quantity}</dd></div>)}</dl>{!summary.quantities.length && <p>등록된 보유 자산이 없습니다.</p>}</section>
          </> : <>
            <form key={parametersKey} className="customer-filters" onSubmit={applySearch}><label className="customer-search">검색<input name="q" defaultValue={parameters.q} placeholder="자산명 · 자산번호 · 규격" maxLength={160} /></label>
              <label>보관 상태<select name="storageStatus" defaultValue={parameters.storageStatus ?? ''}><option value="">전체</option>{Object.entries(storageLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>판매 상태<select name="saleStatus" defaultValue={parameters.saleStatus ?? ''}><option value="">전체</option>{Object.entries(saleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>등급<select name="grade" defaultValue={parameters.grade ?? ''}><option value="">전체</option>{['S', 'A', 'B', 'F'].map((grade) => <option key={grade}>{grade}</option>)}</select></label>
              <label>정렬<select name="sort" defaultValue={parameters.sort ?? 'updatedDesc'}><option value="updatedDesc">최근 변경</option><option value="valueDesc">평가금액순</option><option value="receivedDesc">최근 등록</option><option value="nameAsc">자산명순</option></select></label>
              <details className="customer-filter-details"><summary>상세 조건</summary><div className="customer-filters">{[['categoryId', '카테고리 코드', 'text'], ['locationId', '보관 위치 코드', 'text'], ['receivedFrom', '등록일 시작', 'date'], ['receivedTo', '등록일 종료', 'date'], ['storageDaysFrom', '등록 경과일 최소', 'number'], ['storageDaysTo', '등록 경과일 최대', 'number']].map(([name, label, type]) => <label key={name}>{label}<input name={name} type={type} min={type === 'number' ? 0 : undefined} defaultValue={parameters[name]} /></label>)}</div></details>
              <div className="customer-filter-actions"><button className="sa-button sa-primary"><Search size={16} />검색</button><button className="sa-button" type="button" onClick={() => setParameters({ page: '1', size: '20', sort: 'updatedDesc' })}>초기화</button></div>
            </form>
            {page && <><div className="customer-result-heading"><span>{page.meta.totalElements.toLocaleString()}건</span><label>페이지당 <select aria-label="페이지당 자산 수" value={parameters.size ?? '20'} onChange={(event) => setParameters({ ...parameters, page: '1', size: event.target.value })}>{[20, 50, 100].map((size) => <option key={size}>{size}</option>)}</select></label></div><div className="sa-table-scroll"><table className="sa-table"><thead><tr>{['자산', '분류', '등급', '수량', '개당 평가금액', '평가 총액', '보관 상태', '판매 상태', '등록일'].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{page.data.map((asset) => <tr key={asset.id}><td><button className="sa-asset-link" onClick={() => selectId(asset.id)}>{asset.name}</button><small className="customer-asset-code">{asset.id}</small></td><td>{asset.category?.path ?? '미분류'}</td><td>{asset.grade}</td><td>{asset.quantity} {asset.unit}</td><td>{money(asset.appraisalValue)}</td><td>{money(appraisalTotal(asset.appraisalValue, asset.quantity))}</td><td>{storageLabels[asset.storageStatus]}</td><td>{saleLabels[asset.saleStatus]}</td><td>{date(asset.createdAt)}</td></tr>)}</tbody></table></div>{!page.data.length && <p className="customer-empty">조건에 맞는 자산이 없습니다.</p>}<div className="customer-pagination"><button className="sa-icon" title="이전 페이지" aria-label="이전 페이지" disabled={page.meta.page <= 1} onClick={() => setParameters({ ...parameters, page: String(page.meta.page - 1) })}><ChevronLeft size={20} /></button><span>{page.meta.page} / {Math.max(1, page.meta.totalPages)}</span><button className="sa-icon" title="다음 페이지" aria-label="다음 페이지" disabled={page.meta.page >= page.meta.totalPages} onClick={() => setParameters({ ...parameters, page: String(page.meta.page + 1) })}><ChevronRight size={20} /></button></div></>}
          </>}
  </main></AdminShell><Cart onLogin={() => {}} onRequestQuote={draft => { selectId(null); setView('market'); setQuoteDraft(draft) }} /></ReceivingRequestProvider>
}

function AssetDetails({ asset, records, onBack, onNavigate, onRefresh }: { asset: AssetRecord; records: AssetRecord[]; onBack: () => void; onNavigate: (id: string) => void; onRefresh: () => void }) {
  const [imageIndex, setImageIndex] = useState(0)
  const [failedImages, setFailedImages] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [now] = useState(() => Date.now())
  const [saleOpen, setSaleOpen] = useState(false)
  const [submittedSale, setSubmittedSale] = useState<AssetRecord['saleRequest']>(null)
  const request = submittedSale ?? asset.saleRequest
  const heading = useRef<HTMLHeadingElement>(null)
  const images = asset.images ?? []
  const image = images[imageIndex]
  const index = records.findIndex((entry) => entry.id === asset.id)
  const previous = index > 0 ? records[index - 1] : undefined
  const next = index >= 0 ? records[index + 1] : undefined
  const days = Math.max(0, Math.floor((now - new Date(asset.createdAt).getTime()) / 86_400_000))
  const status = asset.saleStatus === 'ON_SALE' ? '판매 중' : storageLabels[asset.storageStatus]
  const state = asset.saleStatus === 'ON_SALE' ? 'selling' : asset.storageStatus === 'PENDING' ? 'pending' : 'stored'
  useEffect(() => { heading.current?.focus({ preventScroll: true }); window.scrollTo(0, 0) }, [])
  function exportAsset() {
    const escape = (value: string) => `"${(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`
    const rows = [['자산번호', '자산명', '카테고리', '규격', '브랜드', '등급', '현재 수량', '관리 단위', '개당 평가금액', '평가 총액', '보관 상태', '판매 상태', '보관 위치 코드', '등록일'], [asset.id, asset.name, asset.category?.path ?? '미분류', asset.specification, asset.brand, asset.grade, asset.quantity, asset.unit, asset.appraisalValue ?? '미평가', appraisalTotal(asset.appraisalValue, asset.quantity) ?? '미평가', storageLabels[asset.storageStatus], saleLabels[asset.saleStatus], asset.locationId ?? '미지정', date(asset.createdAt)]]
    const url = URL.createObjectURL(new Blob(['\uFEFF', rows.map((row) => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a'); link.href = url; link.download = `${asset.id}.csv`; link.click(); URL.revokeObjectURL(url)
    setMessage('자산 정보를 CSV로 내보냈습니다.')
  }
  return <div className="shopify-detail customer-asset-detail">
    {saleOpen && <SaleRegistration persistent asset={{ name: asset.name, grade: asset.grade, quantity: asset.quantity, unit: asset.unit, salePrice: '' }} onClose={() => setSaleOpen(false)} onRegister={async (price) => { const desiredAmount = Number(price.replaceAll(',', '')); const result = await accountRequest<{ request: { id: string } }>(`/api/assets/${asset.id}/sale-requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ desiredAmount, expectedQuantity: asset.quantity }) }); setSubmittedSale({ id: result.request.id, status: 'PENDING', desiredAmount: String(desiredAmount), createdAt: new Date().toISOString() }) }} />}
    <div className="sd-breadcrumb"><button onClick={onBack}>내 자산</button><ChevronRight size={12} /><span>{asset.id}</span></div>
    <div className="sd-heading"><button className="sd-icon" title="자산 목록으로" aria-label="자산 목록으로" onClick={onBack}><ArrowLeft size={18} /></button><div className="sd-title"><h1 tabIndex={-1} ref={heading}>{asset.name}</h1><span className={`sd-badge ${state}`}><i />{status}</span></div><div className="sd-paging"><button className="sd-icon" title="이전 자산" aria-label="이전 자산" disabled={!previous} onClick={() => previous && onNavigate(previous.id)}><ChevronLeft size={17} /></button><button className="sd-icon" title="다음 자산" aria-label="다음 자산" disabled={!next} onClick={() => next && onNavigate(next.id)}><ChevronRight size={17} /></button></div></div>
    <div className="sd-actions"><span>등록일 {date(asset.createdAt)} <i>·</i> 등록 경과 {days.toLocaleString('ko-KR')}일</span><div><button className="sd-icon" title="새로고침" aria-label="새로고침" onClick={onRefresh}><RefreshCw size={15} /></button><button className="sd-button" onClick={exportAsset}><ArrowDownToLine size={14} />내보내기</button></div></div>
    <div className="sd-layout"><div className="sd-primary-column">
      <section className="sd-section"><div className="sd-section-heading"><h2>자산 정보</h2><span className="sd-grade">{asset.grade}등급</span></div><dl className="sd-fields">{[['자산명', asset.name], ['자산번호', asset.id], ['브랜드', asset.brand], ['규격', asset.specification], ['입고 신청번호', asset.receivingId], ['품목 코드', asset.itemId]].map(([label, value]) => <div key={label} className={label === '자산명' || label === '규격' ? 'sd-wide' : undefined}><dt>{label}</dt><dd>{value || '미등록'}</dd></div>)}</dl></section>
      <section className="sd-section"><div className="sd-section-heading"><h2>미디어</h2><span>{images.length ? `이미지 ${images.length}개` : '이미지 없음'}</span></div><figure className="sd-media"><div>{image && !failedImages.includes(image.id) ? <img src={image.url} alt={image.name || asset.name} onError={() => setFailedImages((previousIds) => [...previousIds, image.id])} /> : <span className="sd-no-image"><Box size={32} />{image ? '이미지를 불러올 수 없습니다' : '등록된 공개 가능 사진이 없습니다'}</span>}</div>{image && <figcaption>{image.name || '자산 사진'}</figcaption>}</figure>{images.length > 1 && <div className="customer-asset-thumbnails" role="group" aria-label="자산 사진 선택">{images.map((entry, position) => <button key={entry.id} type="button" aria-label={`${position + 1}번 사진: ${entry.name || '자산 사진'}`} aria-pressed={imageIndex === position} onClick={() => setImageIndex(position)}>{failedImages.includes(entry.id) ? <Box size={20} /> : <img src={entry.url} alt="" onError={() => setFailedImages((previousIds) => [...previousIds, entry.id])} />}<span>{position + 1}</span></button>)}</div>}</section>
      <section className="sd-section"><div className="sd-section-heading"><h2>평가 및 판매</h2><span>KRW</span></div><dl className="sd-fields sd-prices"><div><dt>개당 평가금액</dt><dd>{money(asset.appraisalValue)}</dd></div><div><dt>평가 총액</dt><dd>{money(appraisalTotal(asset.appraisalValue, asset.quantity))}</dd></div><div><dt>판매 가격</dt><dd className="customer-value-missing">미등록</dd><small className="sd-price-rule">기준 판매가 미등록 · 판매 할인율 미등록</small></div></dl><div className="sd-price-summary"><span>평가 가치 대비 할인 적용 판매 가격</span><b>미등록</b></div></section>
      <section className="sd-section"><div className="sd-section-heading"><h2>재고 정보</h2><span><MapPin size={13} />{asset.locationId ?? '미지정'}</span></div><div className="sd-stock"><div><span>현재 수량</span><strong>{Number(asset.quantity).toLocaleString('ko-KR', { maximumFractionDigits: 3 })}<small>{asset.unit}</small></strong></div><dl><div><dt>관리 단위</dt><dd>{asset.unit}</dd></div><div><dt>등록일</dt><dd>{date(asset.createdAt)}</dd></div></dl></div></section>
    </div><aside className="sd-secondary-column" aria-label="자산 관리">
      <section className="sd-section"><div className="sd-section-heading"><h2>자산 상태</h2><span className={`sd-badge ${state}`}><i />{status}</span></div><dl className="sd-side-fields"><div><dt>보관 상태</dt><dd>{storageLabels[asset.storageStatus]}</dd></div><div><dt>판매 상태</dt><dd>{saleLabels[asset.saleStatus]}</dd></div>{request && <><div><dt>판매 요청번호</dt><dd>{request.id}</dd></div><div><dt>승인 상태</dt><dd>{{ PENDING: '승인 대기', APPROVED: '승인 완료', REJECTED: '반려' }[request.status] ?? request.status}</dd></div><div><dt>판매 희망금액</dt><dd>{money(request.desiredAmount)}</dd></div></>}</dl><button className="sd-button customer-market-unavailable" disabled={!asset.canRequestSale || !!request} onClick={() => setSaleOpen(true)}><ShoppingCart size={15} />{request ? '판매 요청 접수됨' : '마켓에 등록하기'}</button></section>
      <section className="sd-section"><div className="sd-section-heading"><h2>보관 정보</h2><Warehouse size={16} /></div><dl className="sd-side-fields"><div><dt>보관 위치 코드</dt><dd>{asset.locationId ?? '미지정'}</dd></div><div><dt>등록 경과일</dt><dd>{days.toLocaleString('ko-KR')}일</dd></div><div><dt>등록일</dt><dd>{date(asset.createdAt)}</dd></div></dl></section>
      <section className="sd-section"><div className="sd-section-heading"><h2>자산 분류</h2><Box size={16} /></div><dl className="sd-side-fields"><div><dt>카테고리</dt><dd>{asset.category?.path ?? '미분류'}</dd></div><div><dt>브랜드</dt><dd>{asset.brand || '미등록'}</dd></div><div><dt>품질 등급</dt><dd><span className="sd-grade">{asset.grade}</span></dd></div><div><dt>관리 단위</dt><dd>{asset.unit}</dd></div></dl></section>
      <section className="sd-section"><div className="sd-section-heading"><h2><label htmlFor="customer-asset-note">자산 메모</label></h2><span>미등록</span></div><textarea id="customer-asset-note" value="" readOnly disabled rows={6} aria-label="자산 메모" title="자산 메모 저장은 현재 지원하지 않습니다" /></section>
    </aside></div>
    <div className="sd-savebar"><span role="status">{message || '조회 전용'}</span><div><button className="sd-button" disabled>변경 취소</button><button className="sd-button sd-save" disabled><Save size={15} />저장</button></div></div>
  </div>
}