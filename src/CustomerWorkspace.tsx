import { useEffect, useState, type FormEvent } from 'react'
import { Archive, ArrowLeft, Box, ChevronLeft, ChevronRight, LayoutDashboard, RefreshCw, Search, ShoppingCart, UserRound } from 'lucide-react'
import AdminShell from './AdminShell'
import LoginPage from './LoginPage'
import ShopifyMarket from './ShopifyMarket'
import { authenticatedFetch, readAuthSession, signIn, type AuthSession } from './authSession'
import { accountRequest } from './customerAccounts'
import { useHistoryState } from './useHistoryState'
import './App.css'
import './CustomerWorkspace.css'

type AssetRecord = { id: string; name: string; itemId: string; receivingId: string; category: { id: string; name: string; path: string }; specification: string; brand: string; grade: string; quantity: string; unit: string; appraisalValue: string | null; storageStatus: string; saleStatus: string; locationId: string | null; thumbnailUrl?: string | null; createdAt: string; images?: Array<{ id: string; name: string; url: string }> }
type Summary = { total: number; appraisalValue: string | null; unappraised: number; groups: Array<{ storageStatus: string; saleStatus: string; count: number }>; quantities: Array<{ unit: string; quantity: string }> }
type Page = { data: AssetRecord[]; meta: { page: number; size: number; totalElements: number; totalPages: number } }
const storageLabels: Record<string, string> = { PENDING: '입고 대기', STORED: '보관 중', RELEASED: '출고 완료' }
const saleLabels: Record<string, string> = { PENDING: '판매 대기', ON_SALE: '판매 중', SOLD: '판매 완료' }
const money = (value: string | null) => value === null ? '미평가' : `${BigInt(value).toLocaleString('ko-KR')}원`
const date = (value: string) => new Date(value).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })

export default function CustomerWorkspace() {
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
        if (user.role === 'ADMIN') { window.location.replace('/admin/#/admin/dashboard'); return }
        setSession({ accessToken: stored.accessToken, user })
        setError('')
      }).catch((reason) => { if (!controller.signal.aborted) { setSession(null); setError(reason instanceof Error ? reason.message : '계정 확인에 실패했습니다.') } }).finally(() => { if (!controller.signal.aborted) setChecking(false) })
    }
    return () => { controller.abort(); window.removeEventListener('mrs-auth-expired', expired) }
  }, [revision])
  if (checking) return <main className="customer-session" role="status">계정 확인 중...</main>
  if (session) return <MemberWorkspace key={`${session.user.id}/${session.user.customerId}/${session.accessToken}`} session={session} />
  if (guest) return <ShopifyMarket products={[]} navigation={<button className="nav-button" onClick={() => setGuest(false)}><UserRound />로그인</button>} basket={{}} onBasketChange={() => {}} isGuest onLogin={() => setGuest(false)} />
  return <>{error && <div className="customer-session" role="alert">{error}<button className="sa-button" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={16} />다시 확인</button></div>}<LoginPage onLogin={async (email, password) => {
    const next = await signIn(email, password)
    if (next.user.role === 'ADMIN') { window.location.href = '/admin/#/admin/dashboard'; return }
    setSession(next)
    setError('')
  }} onBrowse={() => setGuest(true)} onCustomerAccess={() => setRevision((value) => value + 1)} /></>
}

function MemberWorkspace({ session }: { session: AuthSession }) {
  const [view, setView] = useHistoryState<'overview' | 'assets' | 'profile' | 'market'>(`company-view:${session.user.id}:${session.user.customerId}`, 'overview')
  const [selectedId, selectId, back] = useHistoryState<string | null>(`company-asset:${session.user.id}:${session.user.customerId}`, null)
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
  const navigate = (next: typeof view) => { if (selectedId) selectId(null); setView(next) }
  const navigation = <>{([{ id: 'overview', label: '자산 현황', Icon: LayoutDashboard }, { id: 'assets', label: '자산 목록', Icon: Archive }, { id: 'market', label: '마켓', Icon: ShoppingCart }, { id: 'profile', label: '계정 정보', Icon: UserRound }] as const).map(({ id, label, Icon }) => <button key={id} className={`nav-button ${view === id ? 'active' : ''}`} onClick={() => navigate(id)} aria-current={view === id ? 'page' : undefined}><Icon size={18} />{label}</button>)}</>
  const applySearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const next: Record<string, string> = { page: '1', size: parameters.size ?? '20' }
    for (const [key, value] of data) if (String(value).trim()) next[key] = String(value).trim()
    setParameters(next)
  }
  return <AdminShell navigation={navigation} customerName={company?.name ?? session.user.companyName} readOnly className="customer-workspace"><main className="sa-main">
    <div className="sa-heading"><div><div className="sa-breadcrumb">{company?.name ?? session.user.companyName}</div><h1>{selectedId ? '자산 상세' : view === 'overview' ? '자산 현황' : view === 'assets' ? '자산 목록' : view === 'market' ? '마켓' : '계정 정보'}</h1></div><button className="sa-icon" aria-label="새로고침" title="새로고침" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={18} /></button></div>
    {error && <p className="customer-error" role="alert">{error}</p>}
    {loading && <p role="status">불러오는 중...</p>}
    {selectedId ? <><button className="sa-button" onClick={back}><ArrowLeft size={16} />목록으로</button>{!loading && detail && <AssetDetails asset={detail} />}</>
      : view === 'profile' ? <section className="customer-section"><dl className="customer-data">{[['고객사', company?.name ?? session.user.companyName], ['사업자등록번호', company?.businessNumber ?? '미확인'], ['대표자', company?.representativeName ?? ''], ['사업장 주소', company?.address ?? ''], ['대표 연락처', company?.phone ?? ''], ['담당자', session.user.managerName], ['이메일', session.user.email], ['담당자 연락처', session.user.managerPhone ?? ''], ['권한', session.user.customerRole === 'MANAGER' ? '고객사 관리자' : '조회자']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '미등록'}</dd></div>)}</dl></section>
        : view === 'market' ? <section className="customer-section"><p>현재 조회 가능한 상품이 없습니다.</p></section>
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
            {page && <><div className="customer-result-heading"><span>{page.meta.totalElements.toLocaleString()}건</span><label>페이지당 <select aria-label="페이지당 자산 수" value={parameters.size ?? '20'} onChange={(event) => setParameters({ ...parameters, page: '1', size: event.target.value })}>{[20, 50, 100].map((size) => <option key={size}>{size}</option>)}</select></label></div><div className="sa-table-scroll"><table className="sa-table"><thead><tr>{['자산', '분류', '등급', '수량', '평가금액', '보관 상태', '판매 상태', '등록일'].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{page.data.map((asset) => <tr key={asset.id}><td><button className="sa-asset-link" onClick={() => selectId(asset.id)}>{asset.name}</button><small className="customer-asset-code">{asset.id}</small></td><td>{asset.category.path}</td><td>{asset.grade}</td><td>{asset.quantity} {asset.unit}</td><td>{money(asset.appraisalValue)}</td><td>{storageLabels[asset.storageStatus]}</td><td>{saleLabels[asset.saleStatus]}</td><td>{date(asset.createdAt)}</td></tr>)}</tbody></table></div>{!page.data.length && <p className="customer-empty">조건에 맞는 자산이 없습니다.</p>}<div className="customer-pagination"><button className="sa-icon" title="이전 페이지" aria-label="이전 페이지" disabled={page.meta.page <= 1} onClick={() => setParameters({ ...parameters, page: String(page.meta.page - 1) })}><ChevronLeft size={20} /></button><span>{page.meta.page} / {Math.max(1, page.meta.totalPages)}</span><button className="sa-icon" title="다음 페이지" aria-label="다음 페이지" disabled={page.meta.page >= page.meta.totalPages} onClick={() => setParameters({ ...parameters, page: String(page.meta.page + 1) })}><ChevronRight size={20} /></button></div></>}
          </>}
  </main></AdminShell>
}

function AssetDetails({ asset }: { asset: AssetRecord }) {
  return <section className="customer-section"><h2>{asset.name}</h2><dl className="customer-data">{[['자산번호', asset.id], ['입고 신청번호', asset.receivingId], ['품목 코드', asset.itemId], ['카테고리', asset.category.path], ['규격', asset.specification], ['브랜드', asset.brand], ['등급', asset.grade], ['수량', `${asset.quantity} ${asset.unit}`], ['평가금액', money(asset.appraisalValue)], ['보관 상태', storageLabels[asset.storageStatus]], ['판매 상태', saleLabels[asset.saleStatus]], ['보관 위치', asset.locationId ?? '미지정'], ['등록일', date(asset.createdAt)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '미등록'}</dd></div>)}</dl><div className="customer-photos">{asset.images?.length ? asset.images.map((image) => <figure key={image.id}><img src={image.url} alt={image.name} /><figcaption>{image.name}</figcaption></figure>) : <p><Box size={24} />등록된 공개 가능 사진이 없습니다.</p>}</div></section>
}