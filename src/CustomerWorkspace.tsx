import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Archive, ArrowDownToLine, ArrowLeft, ArrowRight, Box, ChevronLeft, ChevronRight, CircleAlert, ClipboardList, LayoutDashboard, MapPin, RefreshCw, RotateCcw, Save, Search, ShoppingCart, UserRound, Warehouse } from 'lucide-react'
import DetailSearch from './DetailSearch'
import { unparse } from 'papaparse'
import AdminShell from './AdminShell'
import LoginPage from './LoginPage'
import PublicMarket from './PublicMarket'
import { authenticatedFetch, readAuthSession, signIn, updateMemberProfile, type AuthSession } from './authSession'
import { accountRequest } from './customerAccounts'
import { useHistoryState } from './useHistoryState'
import { ReceivingRequestButton, ReceivingRequestProvider } from './ReceivingRequest'
import { submitReceiving } from './receivings'
import CustomerReceivings from './CustomerReceivings'
import CustomerInspections from './CustomerInspections'
import SaleRegistration, { BatchSaleRegistration } from './SaleRegistration'
import './App.css'
import './ShopifyAssetDetail.css'
import './CustomerWorkspace.css'
import { CartProvider, CartQueryProvider } from './CartProvider'
import Cart from './Cart'
import CustomerQuotes, { CustomerQuoteRequest } from './CustomerQuotes'
import type { PurchaseQuote, QuoteDraft } from './purchaseQuotes'
import { OrdersPage } from './OutboundWorkspace'
import CustomerMyPage, { type MemberProfile, type MyPageView } from './CustomerMyPage'
import { HistoryEmpty, HistoryHeader, HistoryStatus, HistorySummary } from './CustomerHistory'

import { appraisalMoney, appraisalTotal } from './appraisal'

type SaleRequestRecord = { id: string; status: string; inspection: string; quantity: string; desiredAmount: string; createdAt: string; product: { id: string; status: string; publishedAt: string | null; listedQuantity: string; reservedQuantity: string; soldQuantity: string } | null }
type AssetRecord = { canRequestSale?: boolean; saleRequest?: SaleRequestRecord | null; id: string; name: string; itemId: string | null; receivingId: string; category: { id: string; name: string; path: string } | null; specification: string; brand: string; grade: string; quantity: string; unit: string; appraisalValue: string | null; storageStatus: string; saleStatus: string; locationId: string | null; thumbnailUrl?: string | null; createdAt: string; images?: Array<{ id: string; name: string; url: string }> }
type Summary = { total: number; appraisalValue: string | null; unappraised: number; groups: Array<{ storageStatus: string; saleStatus: string; count: number }>; quantities: Array<{ unit: string; quantity: string }> }
type Page = { data: AssetRecord[]; meta: { page: number; size: number; totalElements: number; totalPages: number }; saleRequestSummary?: { approval: Record<string, number>; inspection: Record<string, number> } }
const storageLabels: Record<string, string> = { PENDING: '입고 대기', STORED: '보관 중', RELEASED: '출고 완료' }
const saleLabels: Record<string, string> = { PENDING: '판매 대기', ON_SALE: '판매 중', SOLD: '판매 완료' }
const approvalLabels: Record<string, string> = { PENDING: '승인 대기', APPROVED: '승인 완료', REJECTED: '반려' }
const saleInspectionLabels: Record<string, string> = { PENDING: '상세 검수 대기', COMPLETED: '상세 검수 완료' }
const productLabels: Record<string, string> = { DRAFT: '판매 대기', AVAILABLE: '판매 중', OUT_OF_STOCK: '재고 없음' }
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
  const [profileMessage, setProfileMessage] = useState('')
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
  if (session) return <CartProvider key={`${session.user.id}/${session.user.customerId}/${session.accessToken}`} session={session}><MemberWorkspace session={session} profileMessage={profileMessage} onProfileSave={async (profile, currentPassword) => {
    const next = await updateMemberProfile({ ...profile, version: session.user.sessionVersion ?? 0, currentPassword })
    setProfileMessage('회원정보를 저장했습니다.')
    setSession(next)
  }} /></CartProvider>
  if (guest) return <CartProvider session={null}><AdminShell navigation={<button className="nav-button" onClick={() => setGuest(false)}><UserRound />로그인</button>} customerName="게스트" isGuest readOnly className="customer-workspace sm-market"><main className="sa-main"><PublicMarket onLogin={() => setGuest(false)} /></main><Cart onLogin={() => setGuest(false)} /></AdminShell></CartProvider>
  return <>{error && <div className="customer-session" role="alert">{error}<button className="sa-button" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={16} />다시 확인</button></div>}<LoginPage onLogin={async (email, password) => {
    const next = await signIn(email, password)
    setSession(next)
    setError('')
  }} onBrowse={() => setGuest(true)} onCustomerAccess={() => setRevision((value) => value + 1)} /></>
}

function MemberWorkspace({ session, onProfileSave, profileMessage }: { session: AuthSession; onProfileSave: (profile: MemberProfile, currentPassword?: string) => Promise<void>; profileMessage: string }) {
  const [view, setView] = useHistoryState<'overview' | 'assets' | 'saleRequests' | 'profile' | 'market' | 'receivings' | 'inspections' | 'quotes' | 'orders'>(`company-view:${session.user.id}:${session.user.customerId}`, 'overview')
  const profile: MemberProfile = { managerName: session.user.managerName, managerPhone: session.user.managerPhone, email: session.user.email }
  const isMyPage = ['profile', 'receivings', 'inspections', 'quotes', 'orders'].includes(view)
  const isSaleRequests = view === 'saleRequests'
  const isAssets = view === 'overview' || view === 'assets' || isSaleRequests
  const [quoteDraft, setQuoteDraft] = useState<QuoteDraft | null>(null)
  const [completedQuote, setCompletedQuote] = useState<PurchaseQuote | null>(null)
  const [quoteId, selectQuote] = useHistoryState<string | null>(`quote-detail:${session.user.id}:${session.user.customerId}`, null)
  const [selectedId, selectId, back] = useHistoryState<string | null>(`company-asset:${session.user.id}:${session.user.customerId}`, null)
  const [receivingId, selectReceiving, backReceiving] = useHistoryState<string | null>(`receiving-detail:${session.user.id}:${session.user.customerId}`, null)
  const [receivingParameters, setReceivingParameters] = useHistoryState<Record<string, string>>(`receiving-query:${session.user.id}:${session.user.customerId}`, { page: '1', size: '20' })
  const [parameters, setParameters] = useHistoryState<Record<string, string>>(`company-query:${session.user.id}:${session.user.customerId}`, { page: '1', size: '20', sort: 'updatedDesc' })
  const [saleParameters, setSaleParameters] = useHistoryState<Record<string, string>>(`sale-request-query:${session.user.id}:${session.user.customerId}`, { page: '1', size: '20' })
  const [loadedPage, setPage] = useState<Page | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [detail, setDetail] = useState<AssetRecord | null>(null)
  const [loadedKey, setLoadedKey] = useState('')
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const company = session.user.customer
  const [saleSelection, setSaleSelection] = useState<AssetRecord[] | null>(null)
  const parametersKey = new URLSearchParams(isSaleRequests ? { ...saleParameters, saleRequested: 'true', sort: 'requestedDesc' } : view === 'overview' ? { page: '1', size: '5', sort: 'receivedDesc' } : parameters).toString()
  const loadKey = `${parametersKey}/${selectedId}/${revision}`
  const loading = loadedKey !== loadKey
  const page = loading ? null : loadedPage
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      authenticatedFetch(`/api/assets?${parametersKey}`, { signal: controller.signal }).then(async (response) => { if (!response.ok) { const body = await response.json(); throw new Error(body.error?.message ?? '자산을 불러오지 못했습니다.') } return response.json() as Promise<Page> }),
      isSaleRequests ? Promise.resolve(null) : accountRequest<Summary>('/api/assets/summary', { signal: controller.signal }),
      selectedId ? accountRequest<{ asset: AssetRecord }>(`/api/assets/${encodeURIComponent(selectedId)}`, { signal: controller.signal }) : Promise.resolve(null),
    ]).then(([records, totals, selected]) => { if (!controller.signal.aborted) { setError(''); setPage(records); setSummary(totals); setDetail(selected?.asset ?? null) } }).catch((reason) => { if (!controller.signal.aborted) { setPage(null); setDetail(null); setSummary(null); setError(reason instanceof Error ? reason.message : '조회에 실패했습니다.') } }).finally(() => { if (!controller.signal.aborted) setLoadedKey(loadKey) })
    return () => controller.abort()
  }, [parametersKey, selectedId, revision, loadKey, isSaleRequests])
  useEffect(() => {
    const revalidate = () => { if (document.visibilityState === 'visible') setRevision((value) => value + 1) }
    window.addEventListener('focus', revalidate)
    window.addEventListener('pageshow', revalidate)
    const timer = window.setInterval(revalidate, 60_000)
    return () => { window.removeEventListener('focus', revalidate); window.removeEventListener('pageshow', revalidate); window.clearInterval(timer) }
  }, [])
  const navigate = (next: typeof view) => { setQuoteDraft(null); if (selectedId) selectId(null); setView(next) }
  const navigation = <>{([{ id: 'overview', label: '내 자산', Icon: Archive }, { id: 'market', label: '마켓', Icon: ShoppingCart }, { id: 'profile', label: '마이페이지', Icon: UserRound }] as const).map(({ id, label, Icon }) => { const active = id === 'profile' ? isMyPage : id === 'overview' ? isAssets : view === id; return <button key={id} className={`nav-button ${active ? 'active' : ''}`} onClick={() => navigate(id === 'overview' && isAssets ? view : id)} aria-current={active ? 'page' : undefined}><Icon size={18} />{label}</button> })}</>
  const applySearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const next: Record<string, string> = { page: '1', size: (isSaleRequests ? saleParameters : parameters).size ?? '20' }
    for (const [key, value] of data) if (String(value).trim()) next[key] = String(value).trim()
    if (isSaleRequests) setSaleParameters(next)
    else setParameters(next)
  }
  const exportPage = () => {
    if (!page?.data.length) return
    const rows: Array<Record<string, string>> = isSaleRequests ? page.data.flatMap(asset => asset.saleRequest ? [{ 요청번호: asset.saleRequest.id, 자산번호: asset.id, 자산명: asset.name, 요청일: date(asset.saleRequest.createdAt), 요청수량: asset.saleRequest.quantity, 단위: asset.unit, 전체수량판매희망금액: asset.saleRequest.desiredAmount, 상세검수: saleInspectionLabels[asset.saleRequest.inspection], 승인상태: approvalLabels[asset.saleRequest.status], 마켓상태: asset.saleRequest.product ? productLabels[asset.saleRequest.product.status] : '상품 미등록' }] : []) : page.data.map(asset => ({ 자산번호: asset.id, 자산명: asset.name, 분류: asset.category?.path ?? '미분류', 등급: asset.grade, 수량: asset.quantity, 단위: asset.unit, 개당평가금액: asset.appraisalValue ?? '미평가', 평가총액: appraisalTotal(asset.appraisalValue, asset.quantity) ?? '미평가', 보관상태: storageLabels[asset.storageStatus], 판매상태: saleLabels[asset.saleStatus], 등록일: date(asset.createdAt) }))
    const url = URL.createObjectURL(new Blob(['\uFEFF', unparse(rows, { escapeFormulae: true })], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `MRS-${isSaleRequests ? 'sale-requests' : 'assets'}-page-${page.meta.page}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }
  return <ReceivingRequestProvider contact={{ name: session.user.managerName, phone: session.user.managerPhone ?? '' }} onSubmit={async (form) => { const receiving = await submitReceiving(form); setRevision((value) => value + 1); return receiving }} onViewHistory={() => { selectReceiving(null); setReceivingParameters({ page: '1', size: '20' }); navigate('receivings') }}><AdminShell navigation={navigation} customerName={company?.name ?? session.user.companyName} readOnly className="customer-workspace"><main className="sa-main">
    {!quoteDraft && !selectedId && view !== 'market' && <div className="sa-heading"><div><div className="sa-breadcrumb">{company?.name ?? session.user.companyName}</div><h1>{isMyPage ? '마이페이지' : '내 자산'}</h1></div>{(isAssets || view === 'receivings' || view === 'inspections') && <div className="customer-heading-actions">{!isAssets && <ReceivingRequestButton />}<button className="sa-icon" aria-label="새로고침" title="새로고침" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={18} /></button></div>}</div>}
    {!quoteDraft && !selectedId && isAssets && <div className="customer-asset-tabs" role="group" aria-label="내 자산 보기"><button className="sa-button" aria-pressed={view === 'overview'} onClick={() => navigate('overview')}><LayoutDashboard size={15} />자산 현황</button><button className="sa-button" aria-pressed={view === 'assets'} onClick={() => navigate('assets')}><Archive size={15} />자산 목록</button><button className="sa-button" aria-pressed={isSaleRequests} onClick={() => navigate('saleRequests')}><ClipboardList size={15} />판매 요청 내역</button></div>}
    {!quoteDraft && !isMyPage && error && <p className="customer-error" role="alert">{error}</p>}
    {!quoteDraft && !isMyPage && loading && <p role="status">불러오는 중...</p>}
    {quoteDraft ? <CustomerQuoteRequest session={session} draft={quoteDraft} onBack={() => setQuoteDraft(null)} onDone={quote => { setCompletedQuote(quote); setQuoteDraft(null); selectQuote(quote.id); setView('quotes') }} /> : isMyPage ? <CustomerMyPage view={view as MyPageView} onNavigate={navigate} user={session.user} profile={profile} onProfileChange={onProfileSave} savedMessage={profileMessage}>
      {view === 'orders' ? <OrdersPage manager={session.user.customerRole === 'MANAGER'} /> : view === 'quotes' ? <CustomerQuotes session={session} selected={quoteId} select={selectQuote} initial={completedQuote} /> : view === 'inspections' ? <CustomerInspections historyKey={`${session.user.id}:${session.user.customerId}`} manager={session.user.customerRole === 'MANAGER'} revision={revision} onAsset={(id) => { setView('assets'); selectId(id) }} /> : view === 'receivings' ? <CustomerReceivings revision={revision} parameters={receivingParameters} setParameters={setReceivingParameters} selected={receivingId} select={selectReceiving} back={backReceiving} /> : null}
    </CustomerMyPage> : selectedId ? <>{(loading || !detail) && <div className="customer-heading-actions"><button className="sa-button" onClick={back}><ArrowLeft size={16} />목록으로</button><button className="sa-icon" aria-label="새로고침" title="새로고침" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={18} /></button></div>}{!loading && detail && <AssetDetails key={detail.id} asset={detail} records={loadedPage?.data ?? []} onBack={back} onNavigate={selectId} onRefresh={() => setRevision((value) => value + 1)} />}</>
        : view === 'market' ? <div className="sm-market"><PublicMarket member onRequestQuote={setQuoteDraft} /></div>
          : isSaleRequests ? <SaleRequestsPage key={parametersKey} page={page} parameters={saleParameters} onParameters={setSaleParameters} onSubmit={applySearch} onAsset={selectId} onExport={exportPage} />
          : view === 'overview' ? !loading && summary && <AssetOverview summary={summary} recent={page?.data ?? []} onAsset={selectId} onList={(filters) => { setParameters({ page: '1', size: '20', sort: 'updatedDesc', ...filters }); setView('assets') }} /> : <div className="customer-asset-list">
            <AssetSearch key={parametersKey} parameters={parameters} onSubmit={applySearch} onReset={() => setParameters({ page: '1', size: '20', sort: 'updatedDesc' })} />
            {page && <><div className="customer-result-heading"><h2>자산 목록 <span>{page.meta.totalElements.toLocaleString()}건</span></h2><div className="customer-asset-list-controls"><button className="sa-button" disabled={!page.data.length} onClick={exportPage}><ArrowDownToLine size={15} />현재 페이지 내보내기</button><label>페이지당 <select aria-label="페이지당 자산 수" value={parameters.size ?? '20'} onChange={(event) => setParameters({ ...parameters, page: '1', size: event.target.value })}>{[20, 50, 100].map((size) => <option key={size}>{size}</option>)}</select></label></div></div><AssetSelectionTable key={loadKey} assets={page.data} onAsset={selectId} onRequestSale={setSaleSelection} />{!page.data.length && <div className="customer-asset-empty"><Search size={26} /><p>{Object.keys(parameters).some(key => !['page', 'size', 'sort'].includes(key)) ? '조건에 맞는 자산이 없습니다.' : '등록된 자산이 없습니다.'}</p><button className="sa-button" onClick={() => setParameters({ page: '1', size: '20', sort: 'updatedDesc' })}><RotateCcw size={15} />검색 조건 초기화</button></div>}<div className="customer-pagination"><button className="sa-icon" title="이전 페이지" aria-label="이전 페이지" disabled={page.meta.page <= 1} onClick={() => setParameters({ ...parameters, page: String(page.meta.page - 1) })}><ChevronLeft size={20} /></button><span>{page.meta.page} / {Math.max(1, page.meta.totalPages)}</span><button className="sa-icon" title="다음 페이지" aria-label="다음 페이지" disabled={page.meta.page >= page.meta.totalPages} onClick={() => setParameters({ ...parameters, page: String(page.meta.page + 1) })}><ChevronRight size={20} /></button></div></>}
          </div>}
    {saleSelection && <BatchSaleRegistration assets={saleSelection} accessToken={session.accessToken} onClose={refresh => { setSaleSelection(null); if (refresh) setRevision(value => value + 1) }} onViewHistory={() => { setSaleSelection(null); setRevision(value => value + 1); setSaleParameters({ page: '1', size: '20' }); navigate('saleRequests') }} />}
  </main></AdminShell><Cart onLogin={() => {}} onRequestQuote={draft => { selectId(null); setView('market'); setQuoteDraft(draft) }} /></ReceivingRequestProvider>
}

function AssetSelectionTable({ assets, onAsset, onRequestSale }: { assets: AssetRecord[]; onAsset: (id: string) => void; onRequestSale: (assets: AssetRecord[]) => void }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const allCheckbox = useRef<HTMLInputElement>(null)
  const eligible = assets.filter(asset => asset.canRequestSale === true)
  const selected = eligible.filter(asset => selectedIds.includes(asset.id))
  const selectedCount = selected.length
  const allSelected = eligible.length > 0 && selectedCount === eligible.length
  useEffect(() => { if (allCheckbox.current) allCheckbox.current.indeterminate = selectedCount > 0 && !allSelected }, [selectedCount, allSelected])
  let scaledTotal = 0n
  let unappraised = 0
  for (const asset of selected) {
    const value = appraisalTotal(asset.appraisalValue, asset.quantity)
    if (value === null) { unappraised += 1; continue }
    const [whole, fraction = ''] = value.split('.')
    scaledTotal += BigInt(whole!) * 1000n + BigInt(fraction.padEnd(3, '0'))
  }
  const fraction = String(scaledTotal % 1000n).padStart(3, '0').replace(/0+$/, '')
  const total = `${scaledTotal / 1000n}${fraction ? `.${fraction}` : ''}`
  return <>
    {selectedCount > 0 && <div className="customer-selection-bar" role="region" aria-label="선택 자산 작업"><div className="customer-selection-summary" role="status"><strong>{selectedCount}건 선택됨</strong><span>· 평가 총액 {unappraised === selectedCount ? '미평가' : money(total)}</span>{unappraised > 0 && <small>미평가 {unappraised}건{unappraised < selectedCount ? ' 제외' : ''}</small>}</div><button className="sa-button customer-sale-action" onClick={() => onRequestSale(selected)}><ShoppingCart size={16} />판매 요청하기</button><button className="sa-text-button customer-selection-clear" onClick={() => setSelectedIds([])}><RotateCcw size={15} />선택 해제</button></div>}
    <div className="sa-table-scroll" role="region" aria-label="자산 목록 표" tabIndex={0}><table className="sa-table"><thead><tr><th scope="col" className="customer-selection-cell"><label className="customer-asset-checkbox" title="현재 페이지의 판매 가능한 자산 전체 선택"><input ref={allCheckbox} type="checkbox" aria-label="현재 페이지 판매 가능한 자산 전체 선택" checked={allSelected} disabled={!eligible.length} onChange={event => setSelectedIds(event.target.checked ? eligible.map(asset => asset.id) : [])} /></label></th>{['자산', '분류', '등급', '수량', '개당 평가금액', '평가 총액', '보관 상태', '판매 상태', '등록일'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{assets.map(asset => {
      const checked = selectedIds.includes(asset.id)
      const reason = asset.canRequestSale === true ? '판매 요청 대상 선택' : asset.saleRequest ? '이미 판매 요청된 자산입니다.' : asset.storageStatus !== 'STORED' ? '보관 중인 자산만 판매 요청할 수 있습니다.' : asset.saleStatus !== 'PENDING' ? '판매 대기 자산만 판매 요청할 수 있습니다.' : asset.grade === 'F' ? 'F등급은 판매 요청할 수 없습니다.' : Number(asset.quantity) <= 0 ? '판매 가능한 수량이 없습니다.' : '현재 판매 요청할 수 없는 자산입니다.'
      return <tr key={asset.id} className={checked ? 'customer-asset-selected' : undefined}><td className="customer-selection-cell"><label className="customer-asset-checkbox" title={reason}><input type="checkbox" aria-label={`${asset.name} (${asset.id}) ${reason}`} checked={checked} disabled={asset.canRequestSale !== true} onChange={event => setSelectedIds(previous => event.target.checked ? [...previous, asset.id] : previous.filter(id => id !== asset.id))} /></label></td><td><button className="sa-asset-link" onClick={() => onAsset(asset.id)}><AssetThumbnail asset={asset} /><span><b>{asset.name}</b><small className="customer-asset-code">{asset.id}</small></span></button></td><td>{asset.category?.path ?? '미분류'}</td><td><span className={`sa-grade grade-${asset.grade.toLowerCase()}`}>{asset.grade}</span></td><td className="sa-numeric">{asset.quantity} {asset.unit}</td><td className="sa-numeric">{money(asset.appraisalValue)}</td><td className="sa-numeric sa-value">{money(appraisalTotal(asset.appraisalValue, asset.quantity))}</td><td><span className={`sa-badge ${asset.storageStatus === 'PENDING' ? 'pending' : 'stored'}`}><span />{storageLabels[asset.storageStatus]}</span></td><td><span className={`sa-badge ${asset.saleStatus === 'ON_SALE' ? 'selling' : asset.saleStatus === 'SOLD' ? 'stored' : 'pending'}`}><span />{saleLabels[asset.saleStatus]}</span></td><td>{date(asset.createdAt)}</td></tr>
    })}</tbody></table></div>
  </>
}

function SaleRequestsPage({ page, parameters, onParameters, onSubmit, onAsset, onExport }: { page: Page | null; parameters: Record<string, string>; onParameters: (parameters: Record<string, string>) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onAsset: (id: string) => void; onExport: () => void }) {
  const [query, setQuery] = useState(parameters.q ?? '')
  const filterCount = Object.entries(parameters).filter(([key, value]) => !['page', 'size', 'q'].includes(key) && value).length
  const [expanded, setExpanded] = useState(filterCount > 0)
  const filtered = !!parameters.q || filterCount > 0
  return <section className="customer-history customer-sale-requests" aria-label="판매 요청 내역">
    <HistoryHeader kind="saleRequests" />
    <DetailSearch id="customer-sale-filter" query={query} queryLabel="판매 요청 검색어" placeholder="요청번호 · 자산번호 · 자산명 · 규격 · 브랜드" expanded={expanded} filterCount={filterCount} onQueryChange={setQuery} onToggle={() => setExpanded(!expanded)} onSubmit={onSubmit} onReset={() => { setQuery(''); setExpanded(false); onParameters({ page: '1', size: parameters.size ?? '20' }) }}>
      <fieldset className="customer-asset-filter-group"><legend>판매 요청 조건</legend><div className="sa-filter-fields">
        <label><span>승인 상태</span><select name="saleRequestStatus" defaultValue={parameters.saleRequestStatus ?? ''}><option value="">전체</option>{Object.entries(approvalLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>상세 검수</span><select name="saleInspection" defaultValue={parameters.saleInspection ?? ''}><option value="">전체</option>{Object.entries(saleInspectionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>요청 기간</span><div className="sa-date-range"><input name="saleRequestedFrom" aria-label="판매 요청 시작일" type="date" defaultValue={parameters.saleRequestedFrom} /><i>~</i><input name="saleRequestedTo" aria-label="판매 요청 종료일" type="date" defaultValue={parameters.saleRequestedTo} /></div></label>
      </div></fieldset>
    </DetailSearch>
    {page && <>
      {page.saleRequestSummary && <div className="customer-sale-summaries"><HistorySummary title="전체 검색 범위 승인 상태별 건수" counts={page.saleRequestSummary.approval} labels={approvalLabels} /><HistorySummary title="전체 검색 범위 상세 검수 상태별 건수" counts={page.saleRequestSummary.inspection} labels={saleInspectionLabels} /></div>}
      <div className="customer-result-heading"><h3>요청 내역 <span>{page.meta.totalElements.toLocaleString()}건</span></h3><div className="customer-asset-list-controls"><button className="sa-button" disabled={!page.data.length} onClick={onExport}><ArrowDownToLine size={15} />현재 페이지 내보내기</button><label>페이지당 <select aria-label="페이지당 판매 요청 수" value={parameters.size ?? '20'} onChange={event => onParameters({ ...parameters, page: '1', size: event.target.value })}>{[20, 50, 100].map(size => <option key={size}>{size}</option>)}</select></label></div></div>
      {page.data.length ? <div className="sa-table-scroll" role="region" aria-label="판매 요청 내역 표" tabIndex={0}><table className="sa-table"><thead><tr>{['요청번호', '자산', '요청일', '요청 수량', '판매 희망금액 (전체 수량)', '상세 검수', '승인 상태', '마켓 상태'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{page.data.map(asset => { const request = asset.saleRequest; return request && <tr key={request.id}>
        <td><button className="history-record-link customer-sale-request-id" aria-label={`${request.id} 판매 요청 상세 보기`} onClick={() => onAsset(asset.id)}><strong>{request.id}</strong></button></td>
        <td><button className="sa-asset-link" onClick={() => onAsset(asset.id)}><AssetThumbnail asset={asset} /><span><b>{asset.name}</b><small className="customer-asset-code">{asset.id}</small></span></button></td>
        <td>{date(request.createdAt)}</td><td className="sa-numeric">{request.quantity} {asset.unit}</td><td className="sa-numeric">{money(request.desiredAmount)}</td><td><HistoryStatus>{saleInspectionLabels[request.inspection] ?? request.inspection}</HistoryStatus></td><td><HistoryStatus>{approvalLabels[request.status] ?? request.status}</HistoryStatus></td><td>{request.product ? productLabels[request.product.status] ?? request.product.status : '상품 미등록'}</td>
      </tr> })}</tbody></table></div> : <HistoryEmpty kind="saleRequests" filtered={filtered} />}
      <div className="customer-pagination"><button className="sa-icon" title="이전 페이지" aria-label="이전 판매 요청 페이지" disabled={page.meta.page <= 1} onClick={() => onParameters({ ...parameters, page: String(page.meta.page - 1) })}><ChevronLeft size={16} /></button><span>{page.meta.page} / {Math.max(1, page.meta.totalPages)}</span><button className="sa-icon" title="다음 페이지" aria-label="다음 판매 요청 페이지" disabled={page.meta.page >= page.meta.totalPages} onClick={() => onParameters({ ...parameters, page: String(page.meta.page + 1) })}><ChevronRight size={16} /></button></div>
    </>}
  </section>
}

function AssetSearch({ parameters, onSubmit, onReset }: { parameters: Record<string, string>; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onReset: () => void }) {
  const [query, setQuery] = useState(parameters.q ?? '')
  const filterCount = Object.entries(parameters).filter(([key, value]) => !['page', 'size', 'sort', 'q'].includes(key) && value).length
  const [expanded, setExpanded] = useState(filterCount > 0)
  return <DetailSearch id="customer-asset-filter" className="customer-asset-search" query={query} queryLabel="자산 검색어" placeholder="자산명 · 자산번호 · 규격 · 브랜드" expanded={expanded} filterCount={filterCount} onQueryChange={setQuery} onToggle={() => setExpanded(!expanded)} onSubmit={onSubmit} onReset={() => { setQuery(''); setExpanded(false); onReset() }}>
    <fieldset className="customer-asset-filter-group"><legend>자산 상태</legend><div className="sa-filter-fields">
      <label><span>보관 상태</span><select name="storageStatus" defaultValue={parameters.storageStatus ?? ''}><option value="">전체</option>{Object.entries(storageLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><span>판매 상태</span><select name="saleStatus" defaultValue={parameters.saleStatus ?? ''}><option value="">전체</option>{Object.entries(saleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><span>등급</span><select name="grade" defaultValue={parameters.grade ?? ''}><option value="">전체</option>{['S', 'A', 'B', 'F'].map(grade => <option key={grade}>{grade}</option>)}</select></label>
      <label><span>정렬</span><select name="sort" defaultValue={parameters.sort ?? 'updatedDesc'}><option value="updatedDesc">최근 변경</option><option value="valueDesc">평가금액순</option><option value="receivedDesc">최근 등록</option><option value="nameAsc">자산명순</option></select></label>
    </div></fieldset>
    <fieldset className="customer-asset-filter-group"><legend>분류·보관 위치</legend><div className="sa-filter-fields customer-asset-filter-pair"><label><span>카테고리 코드</span><input name="categoryId" defaultValue={parameters.categoryId} placeholder="예: 010101" pattern="[0-9]{6}" maxLength={6} /></label><label><span>보관 위치 코드</span><input name="locationId" defaultValue={parameters.locationId} maxLength={20} /></label></div></fieldset>
    <fieldset className="customer-asset-filter-group"><legend>등록 기간·경과일</legend><div className="sa-filter-fields customer-asset-filter-pair"><label><span>등록 기간</span><div className="sa-date-range"><input name="receivedFrom" aria-label="등록일 시작" type="date" defaultValue={parameters.receivedFrom} /><i>~</i><input name="receivedTo" aria-label="등록일 종료" type="date" defaultValue={parameters.receivedTo} /></div></label><label><span>등록 경과일</span><div className="sa-day-range"><input name="storageDaysFrom" aria-label="등록 경과일 최소" type="number" min={0} defaultValue={parameters.storageDaysFrom} placeholder="최소" /><i>~</i><input name="storageDaysTo" aria-label="등록 경과일 최대" type="number" min={0} defaultValue={parameters.storageDaysTo} placeholder="최대" /><em>일</em></div></label></div></fieldset>
  </DetailSearch>
}

function AssetThumbnail({ asset }: { asset: AssetRecord }) {
  const [failed, setFailed] = useState(false)
  return <span className="sa-thumbnail">{asset.thumbnailUrl && !failed ? <img src={asset.thumbnailUrl} alt="" loading="lazy" onError={() => setFailed(true)} /> : <Box size={22} aria-label="자산 사진 없음" />}</span>
}

function AssetOverview({ summary, recent, onAsset, onList }: { summary: Summary; recent: AssetRecord[]; onAsset: (id: string) => void; onList: (filters?: Record<string, string>) => void }) {
  const selling = summary.groups.filter(group => group.storageStatus === 'STORED' && group.saleStatus === 'ON_SALE').reduce((total, group) => total + group.count, 0)
  const stored = summary.groups.filter(group => group.storageStatus === 'STORED').reduce((total, group) => total + group.count, 0)
  const pending = summary.groups.filter(group => group.storageStatus === 'PENDING').reduce((total, group) => total + group.count, 0)
  const states: Array<{ label: string; tone: string; count: number; filters: Record<string, string> }> = [{ label: '판매 중', tone: 'selling', count: selling, filters: { storageStatus: 'STORED', saleStatus: 'ON_SALE' } }, { label: '보관 중', tone: 'stored', count: stored, filters: { storageStatus: 'STORED' } }, { label: '입고 대기', tone: 'pending', count: pending, filters: { storageStatus: 'PENDING' } }]
  const distribution = [{ label: '판매 중', tone: 'selling', count: selling }, { label: '보관 중 · 판매 중 제외', tone: 'stored', count: stored - selling }, { label: '입고 대기', tone: 'pending', count: pending }]
  return <div className="customer-asset-overview">
    <section className="customer-asset-value" aria-label="보유 자산 평가 현황">
      <div className="customer-asset-value-main"><span className="customer-asset-eyebrow"><span className="sa-live-dot" />보유 자산 평가금액 <small>KRW</small></span><strong>{summary.total === 0 ? '0원' : money(summary.appraisalValue)}</strong><p>평가된 자산 {(summary.total - summary.unappraised).toLocaleString()}건 · 출고 완료 제외</p><button className="sa-text-button" onClick={() => onList()}>전체 자산 보기<ArrowRight size={14} /></button></div>
      <div className="customer-asset-distribution"><div className="sa-section-title"><h2>자산 구성</h2><span>건수 기준</span></div><div className="sa-stacked-bar" role="img" aria-label={distribution.map(state => `${state.label} ${state.count}건`).join(', ')}>{distribution.map(state => <span key={state.tone} className={state.tone} style={{ width: `${summary.total ? state.count / summary.total * 100 : 0}%` }} />)}</div><ul>{distribution.map(state => <li key={state.tone}><span><i className={`sa-dot ${state.tone}`} />{state.label}</span><b>{state.count.toLocaleString()}건</b></li>)}</ul></div>
      <dl className="customer-asset-value-footer"><div><dt>보유 자산</dt><dd>{summary.total.toLocaleString()}건</dd></div><div><dt>평가 완료</dt><dd>{(summary.total - summary.unappraised).toLocaleString()}건</dd></div><div><dt>미평가</dt><dd>{summary.unappraised.toLocaleString()}건</dd></div></dl>
    </section>
    <section className="sa-metrics customer-asset-metrics" aria-label="상태별 자산">{states.map(state => <button key={state.tone} className={`sa-metric ${state.tone}`} onClick={() => onList(state.filters)}><span className="sa-metric-label"><i className={`sa-dot ${state.tone}`} />{state.label}<ArrowRight size={14} /></span><strong>{state.count.toLocaleString()}<small>건</small></strong><span className="sa-metric-caption">{state.tone === 'stored' ? '판매 중 자산 포함' : state.tone === 'selling' ? '마켓에 진열된 보유 자산' : '입고 대기 상태의 자산'}</span></button>)}</section>
    <div className="customer-asset-sections">
      <section className="customer-asset-recent" aria-label="최근 등록 자산"><div className="sa-section-title"><h2>최근 등록</h2><button className="sa-text-button" onClick={() => onList({ sort: 'receivedDesc' })}>전체 보기<ArrowRight size={13} /></button></div>{recent.length ? recent.map(asset => <button key={asset.id} className="customer-recent-asset" onClick={() => onAsset(asset.id)}><AssetThumbnail asset={asset} /><span><b>{asset.name}</b><small>{asset.category?.path ?? '미분류'} · {asset.quantity} {asset.unit}</small></span><span className="customer-recent-value"><b>{money(appraisalTotal(asset.appraisalValue, asset.quantity))}</b><time dateTime={asset.createdAt}>{date(asset.createdAt)}</time></span></button>) : <div className="customer-asset-empty"><Archive size={25} /><p>등록된 자산이 없습니다.</p></div>}</section>
      <section className="customer-asset-quantities"><div className="sa-section-title"><h2>단위별 보유 수량</h2><span>{summary.quantities.length}종</span></div>{summary.quantities.length ? <dl>{summary.quantities.map(entry => <div key={entry.unit}><dt>{entry.unit}</dt><dd>{entry.quantity}</dd></div>)}</dl> : <p className="customer-empty">등록된 보유 수량이 없습니다.</p>}</section>
      <section className="customer-asset-checks" aria-label="확인할 항목"><div className="sa-section-title"><h2>확인할 항목</h2><CircleAlert size={16} /></div><div className="customer-asset-check"><span>미평가 자산</span><strong>{summary.unappraised.toLocaleString()}건</strong><p>{summary.unappraised ? '평가금액이 없는 자산은 총 평가금액에서 제외됩니다.' : summary.total ? '모든 보유 자산의 평가금액이 등록되어 있습니다.' : '자산이 등록되면 평가 현황을 확인할 수 있습니다.'}</p></div><button className="sa-text-button" onClick={() => onList()}>자산 목록 보기<ArrowRight size={13} /></button></section>
    </div>
  </div>
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
    {saleOpen && <SaleRegistration persistent asset={{ name: asset.name, grade: asset.grade, quantity: asset.quantity, unit: asset.unit, salePrice: '' }} onClose={() => setSaleOpen(false)} onRegister={async (price) => { const desiredAmount = Number(price.replaceAll(',', '')); const result = await accountRequest<{ request: { id: string } }>(`/api/assets/${asset.id}/sale-requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ desiredAmount, expectedQuantity: asset.quantity }) }); setSubmittedSale({ id: result.request.id, status: 'PENDING', inspection: 'PENDING', quantity: asset.quantity, desiredAmount: String(desiredAmount), createdAt: new Date().toISOString(), product: null }) }} />}
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
      {request && <section className="sd-section"><div className="sd-section-heading"><h2>판매 요청 상세</h2><ClipboardList size={16} /></div><dl className="sd-side-fields"><div><dt>요청일</dt><dd>{date(request.createdAt)}</dd></div><div><dt>요청 당시 수량</dt><dd>{request.quantity} {asset.unit}</dd></div><div><dt>희망금액 (전체 수량)</dt><dd>{money(request.desiredAmount)}</dd></div><div><dt>상세 검수</dt><dd>{saleInspectionLabels[request.inspection] ?? request.inspection}</dd></div><div><dt>마켓 상태</dt><dd>{request.product ? productLabels[request.product.status] ?? request.product.status : '상품 미등록'}</dd></div>{request.product && <><div><dt>상품번호</dt><dd>{request.product.id}</dd></div><div><dt>판매 등록 수량</dt><dd>{request.product.listedQuantity} {asset.unit}</dd></div><div><dt>구매 예약 수량</dt><dd>{request.product.reservedQuantity} {asset.unit}</dd></div><div><dt>출고 확정 누적 수량</dt><dd>{request.product.soldQuantity} {asset.unit}</dd></div></>}</dl></section>}
      <section className="sd-section"><div className="sd-section-heading"><h2>보관 정보</h2><Warehouse size={16} /></div><dl className="sd-side-fields"><div><dt>보관 위치 코드</dt><dd>{asset.locationId ?? '미지정'}</dd></div><div><dt>등록 경과일</dt><dd>{days.toLocaleString('ko-KR')}일</dd></div><div><dt>등록일</dt><dd>{date(asset.createdAt)}</dd></div></dl></section>
      <section className="sd-section"><div className="sd-section-heading"><h2>자산 분류</h2><Box size={16} /></div><dl className="sd-side-fields"><div><dt>카테고리</dt><dd>{asset.category?.path ?? '미분류'}</dd></div><div><dt>브랜드</dt><dd>{asset.brand || '미등록'}</dd></div><div><dt>품질 등급</dt><dd><span className="sd-grade">{asset.grade}</span></dd></div><div><dt>관리 단위</dt><dd>{asset.unit}</dd></div></dl></section>
      <section className="sd-section"><div className="sd-section-heading"><h2><label htmlFor="customer-asset-note">자산 메모</label></h2><span>미등록</span></div><textarea id="customer-asset-note" value="" readOnly disabled rows={6} aria-label="자산 메모" title="자산 메모 저장은 현재 지원하지 않습니다" /></section>
    </aside></div>
    <div className="sd-savebar"><span role="status">{message || '조회 전용'}</span><div><button className="sd-button" disabled>변경 취소</button><button className="sd-button sd-save" disabled><Save size={15} />저장</button></div></div>
  </div>
}