import { useEffect, useRef, useState, useTransition } from 'react'
import { ArrowLeft, ArrowUpRight, Archive, Building2, Check, ChevronRight, ClipboardCheck, Images, ImageOff, LayoutDashboard, ListChecks, LoaderCircle, LogOut, Menu, Pencil, Plus, ReceiptText, Search, Settings2, ShoppingCart, UsersRound, X } from 'lucide-react'
import { adminAuthenticatedFetch, adminSignOut } from '../adminAuthSession'
import { dateText, invoiceAmount, invoices, locations, money, receivingStatuses, referenceDate, type Campaign, type Inspection, type Inventory, type MasterItem, type MemberAccount, type Product, type Receiving, type ReceivingStatus } from './adminData'
import { adminHref, createAdminViews, dashboardMetrics, menus, type AdminLink, type AdminRow, type AdminView } from './adminViews'
import { materialPhotos } from '../assetPhotos'
import InventoryEditor, { ImagePicker } from './InventoryEditor'
import LocationEditor from './LocationEditor'
import LocationOccupancyEditor from './LocationOccupancyEditor'
import { categoryMatches, type MaterialCategory } from '../categories'
import CategorySelect from '../CategorySelect'
import CategoryManager from './CategoryManager'
import { saveAdminCategory } from './adminCategories'
import CampaignEditor, { MarketStatusEditor, ProductDiscountEditor } from './MarketEditor'
import BannerManager from './BannerManager'
import CustomerManager from './CustomerManager'
import AdminAccountManager from './AdminAccountManager'
import type { AdminRole } from '../adminAuthSession'
import type { CustomerAccount } from '../customerAccounts'
import ItemFileActions from './ItemFileActions'
import { changeMarketStatus, marketStatusOptions, type MarketData, type MarketStatusTab } from './adminMarket'
import './AdminPortal.css'
import AdminPagination, { LoadingTable, type Pagination } from './AdminPagination'

const icons = { dashboard: LayoutDashboard, basic: ListChecks, receiving: ClipboardCheck, inventory: Archive, market: ShoppingCart, content: Images, billing: ReceiptText, customers: Building2, members: UsersRound, settings: Settings2, accounts: UsersRound }
const authenticatedFetch = adminAuthenticatedFetch
const rowOptions = [10, 25, 50, 100] as const
type AdminDatabaseData = { categories: MaterialCategory[]; items: MasterItem[]; assets: Inventory[]; receivings: Receiving[]; inspections: Inspection[]; products: Product[]; campaigns: Campaign[]; customers: CustomerAccount[]; pagination: Pagination; metrics?: Record<string, number>; categoryCounts?: { items: number; assets: number }; locationCounts?: { locationId: string | null; _count: number }[] }

export default function AdminPortal({ hash, adminRole }: { hash: string; adminRole: AdminRole | null }) {
  const availableMenus = menus.filter((menu) => menu.id !== 'accounts' || adminRole === 'SYSTEM_ADMIN')
  const [assets, setAssets] = useState<Inventory[]>([])
  const [items, setItems] = useState<MasterItem[]>([])
  const [categories, setCategories] = useState<MaterialCategory[]>([])
  const [market, setMarket] = useState<MarketData>({ sales: [], products: [], quotes: [], campaigns: [] })
  const [members, setMembers] = useState<MemberAccount[]>([])
  const [customerRecords, setCustomerRecords] = useState<CustomerAccount[]>([])
  const [accountRevision, setAccountRevision] = useState(0)
  const [locationRecords, setLocationRecords] = useState(() => structuredClone(locations))
  const [receivingRecords, setReceivingRecords] = useState<Receiving[]>([])
  const [inspectionRecords, setInspectionRecords] = useState<Inspection[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [loadedQuery, setLoadedQuery] = useState('')
  const [pagination, setPagination] = useState<Pagination>({ page: 1, rows: 25, total: 0 })
  const [metrics, setMetrics] = useState<Record<string, number>>({})
  const [categoryCounts, setCategoryCounts] = useState<{ items: number; assets: number }>()
  const [notice, setNoticeState] = useState({ scope: '', text: '' })
  const setNotice = (next: { scope: string; text: string }) => setNoticeState({ ...next, text: next.text.replace('파일에서 임시 등록', '파일에서 DB에 등록') })
  const liveCustomers = customerRecords.map((customer) => ({ id: customer.id, name: customer.name, manager: customer.representativeName, phone: customer.phone, email: '', status: customer.status === 'ACTIVE' ? '이용 중' as const : customer.status === 'SUSPENDED' ? '이용 정지' as const : '상담 중' as const }))
  const views = createAdminViews(assets, items, categories, market, members, locationRecords, receivingRecords, inspectionRecords, liveCustomers)
  const url = new URL(hash.slice(1), 'https://mrs.example')
  const rawRoute = url.pathname.split('/')[2] || 'dashboard'
  const legacyRoute = rawRoute === 'items' ? { menu: 'basic' as const, tab: 'items' } : rawRoute === 'categories' ? { menu: 'basic' as const, tab: 'categories' } : rawRoute === 'inspections' ? { menu: 'receiving' as const, tab: url.searchParams.get('tab') || 'primary' } : null
  const route = legacyRoute?.menu ?? rawRoute
  const menu = menus.find((item) => item.id === route) ?? menus[0]
  const tab = menu.tabs.find((item) => item.id === (legacyRoute?.tab ?? url.searchParams.get('tab'))) ?? menu.tabs[0]
  const scope = menu.id === 'basic' ? tab?.id : menu.id === 'inventory' ? tab?.id === 'stock' ? 'assets' : 'locations' : menu.id === 'receiving' ? tab?.id === 'requests' ? 'receivings' : tab?.id === 'primary' ? 'inspections' : tab?.id === 'disposal' ? 'disposals' : null : menu.id === 'market' && ['products', 'campaigns'].includes(tab?.id ?? '') ? tab?.id : menu.id === 'dashboard' ? 'dashboard' : null
  const requestParams = new URLSearchParams(url.searchParams)
  requestParams.delete('tab'); requestParams.delete('mode')
  if (scope) requestParams.set('scope', scope)
  const requestQuery = scope ? requestParams.toString() : ''
  const pending = !!scope && (loadingData || loadedQuery !== requestQuery)
  useEffect(() => {
    if (!requestQuery) return
    const controller = new AbortController()
    adminAuthenticatedFetch(`/api/admin/data?${requestQuery}`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('관리자 데이터를 불러오지 못했습니다.')
      const { data } = await response.json() as { data: AdminDatabaseData }
      if (controller.signal.aborted) return
      setAssets(data.assets); setItems(data.items); setCategories(data.categories)
      setCustomerRecords(data.customers ?? []); setReceivingRecords(data.receivings); setInspectionRecords(data.inspections)
      setMarket({ sales: [], quotes: [], products: data.products, campaigns: data.campaigns })
      setPagination(data.pagination); setMetrics(data.metrics ?? {}); setCategoryCounts(data.categoryCounts)
      if (data.locationCounts) setLocationRecords((current) => current.map((location) => ({ ...location, assetCount: data.locationCounts?.find((entry) => entry.locationId === location.id)?._count ?? 0 })))
      setNoticeState({ scope: '', text: '' })
    }).catch((error) => { if (!controller.signal.aborted) { setAssets([]); setItems([]); setReceivingRecords([]); setInspectionRecords([]); setMarket({ sales: [], quotes: [], products: [], campaigns: [] }); setPagination({ page: 1, rows: 25, total: 0 }); setMetrics({}); setNoticeState({ scope: 'database', text: error instanceof Error ? error.message : '조회 실패' }) } }).finally(() => { if (!controller.signal.aborted) { setLoadedQuery(requestQuery); setLoadingData(false) } })
    return () => controller.abort()
  }, [requestQuery, accountRevision])
  const sourceView = tab ? views[`${menu.id}/${tab.id}`] : null
  const view = sourceView ? { ...sourceView, pagination: scope && scope !== 'locations' ? pagination : undefined } : null
  const id = url.searchParams.get('id')
  const row = view?.rows.find((item) => item.id === id)
  const campaignEditing = menu.id === 'market' && tab?.id === 'campaigns'
  const productManagement = menu.id === 'market' && tab?.id === 'products'
  const locationEditing = menu.id === 'inventory' && tab?.id === 'locations'
  const itemManagement = menu.id === 'basic' && tab?.id === 'items'
  const categoryManagement = menu.id === 'basic' && tab?.id === 'categories'
  const editable = itemManagement || menu.id === 'inventory' && locationEditing || campaignEditing
  const recordKind = campaignEditing ? '기획전' : locationEditing ? '로케이션' : itemManagement ? '품목' : '자산'
  const statusTab = menu.id === 'market' && tab && Object.hasOwn(marketStatusOptions, tab.id) ? tab.id as MarketStatusTab : undefined
  const receivingRequest = menu.id === 'receiving' && tab?.id === 'requests'
  const inspectionStage = menu.id === 'receiving' && tab?.id !== 'requests' ? tab?.id : undefined
  const memberApplication = menu.id === 'members' && tab?.id === 'applications' && row?.status === '가입 승인 대기'
  const noticeScope = `${menu.id}/${tab?.id}/${id ?? ''}`
  const updateStatus = (ids: string[], status: string) => {
    if (!statusTab) return
    setMarket(changeMarketStatus(market, statusTab, ids, status))
    setNotice({ scope: noticeScope, text: `${ids.length}건을 ${status === '판매취소' ? '판매대기' : status} 상태로 변경했습니다.${status === '판매취소' ? ' 판매취소가 적용되었습니다.' : ''}` })
  }
  const updateReceivingStatus = (id: string, status: ReceivingStatus) => {
    setReceivingRecords((current) => current.map((request) => request.id === id ? { ...request, status } : request))
    setNotice({ scope: noticeScope, text: `${id} 입고 상태를 ${status}(으)로 변경했습니다.` })
  }
  const mode = url.searchParams.get('mode')
  const discountEditing = productManagement && mode === 'discount' && row?.status === '판매대기'
  const occupancyEditing = locationEditing && mode === 'occupancy' && !!row
  const editing = editable && (mode === 'new' || mode === 'edit' && !!row)
  const [menuOpen, setMenuOpen] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus(); window.scrollTo(0, 0) }, [menu.id, tab?.id, id, mode])
  useEffect(() => {
    if (rawRoute === 'settings' && url.searchParams.get('tab') === 'categories') {
      window.location.replace('#/admin/basic?tab=categories')
      return
    }
    if (legacyRoute) {
      window.location.replace(adminHref({ label: '', menu: legacyRoute.menu, tab: legacyRoute.tab, id: url.searchParams.get('id') ?? undefined }))
      return
    }
    if (route !== menu.id || url.pathname.split('/').length > 3 || (tab && url.searchParams.has('tab') && url.searchParams.get('tab') !== tab.id)) {
      window.location.replace(adminHref({ label: '', menu: menu.id, tab: tab?.id ?? '' }))
    }
  }, [rawRoute, route, legacyRoute, menu.id, tab, url.pathname, url.searchParams])
  const listParams = new URLSearchParams(url.searchParams)
  listParams.delete('id')
  listParams.delete('mode')
  const listHref = `#/admin/${menu.id}?${listParams}`
  const editParams = new URLSearchParams(url.searchParams)
  editParams.set('mode', row ? 'edit' : 'new')
  const editHref = `#/admin/${menu.id}?${editParams}`
  const occupancyParams = new URLSearchParams(url.searchParams)
  occupancyParams.set('mode', 'occupancy')
  const occupancyHref = `#/admin/${menu.id}?${occupancyParams}`
  const discountParams = new URLSearchParams(url.searchParams)
  discountParams.set('mode', 'discount')
  const discountHref = `#/admin/${menu.id}?${discountParams}`
  const detailParams = new URLSearchParams(url.searchParams)
  detailParams.delete('mode')
  const cancelHref = row ? `#/admin/${menu.id}?${detailParams}` : listHref
  const saved = (savedId: string) => {
    detailParams.set('id', savedId)
    window.location.hash = `/admin/${menu.id}?${detailParams}`
  }
  return <div className="admin-portal">
    <header className="adm-header">
      <button className="adm-icon adm-menu-toggle" aria-label={menuOpen ? '관리 메뉴 닫기' : '관리 메뉴 열기'} aria-expanded={menuOpen} aria-controls="admin-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
      <a className="adm-brand" href="#/admin/dashboard">MRS <span>ADMIN</span></a>
      <span className="adm-prototype">스테이징 · 개발 데이터</span>
      <button type="button" className="adm-icon" title="로그아웃" aria-label="로그아웃" onClick={adminSignOut}><LogOut size={17} /></button>
    </header>
    <aside className={`adm-sidebar ${menuOpen ? 'is-open' : ''}`}>
      <nav id="admin-navigation" aria-label="관리자 메뉴">{availableMenus.map((item) => { const Icon = icons[item.id]; return <a key={item.id} href={adminHref({ label: item.label, menu: item.id, tab: item.tabs[0]?.id ?? '' })} aria-current={menu.id === item.id ? 'page' : undefined} onClick={() => setMenuOpen(false)}><Icon size={17} />{item.label}</a> })}</nav>
      <div className="adm-sidebar-note">예시 기준일<strong>{dateText(referenceDate)}</strong><span>한국 표준시 · KST</span></div>
    </aside>
    <main className="adm-main">
      <div className="adm-heading"><div><div className="adm-breadcrumb">스테이징 관리 / {menu.label}{row ? ` / ${row.id}` : ''}</div><h1 ref={heading} tabIndex={-1}>{discountEditing ? `${row?.title} 할인율 설정` : occupancyEditing ? `${row?.title} 점유 재고 편집` : editing ? `${recordKind} ${mode === 'new' ? '등록' : '수정'}` : row ? row.title : menu.label}</h1></div><span className="adm-mode">STAGING</span></div>
      {pending && <LoadingTable />}
      {notice.scope === 'database' && <p className="adm-form-error" role="alert">{notice.text}</p>}
      {pending ? null : menu.id === 'accounts' ? adminRole === 'SYSTEM_ADMIN' ? <AdminAccountManager params={url.searchParams} /> : <p role="alert">시스템 관리자만 관리자 계정을 관리할 수 있습니다.</p> : menu.id === 'dashboard' ? <Dashboard views={views} metrics={metrics} /> : <>
        <nav className="adm-tabs" aria-label={`${menu.label} 보기`}>{menu.tabs.map((item) => <a key={item.id} href={adminHref({ label: item.label, menu: menu.id, tab: item.id })} aria-current={item.id === tab?.id ? 'page' : undefined}>{item.label}</a>)}</nav>
        {menu.id === 'members' || menu.id === 'customers' && ['companies', 'applications'].includes(tab?.id ?? '') ? <CustomerManager key={`${menu.id}/${tab?.id}`} params={url.searchParams} membersOnly={menu.id === 'members'} onChanged={() => setAccountRevision((value) => value + 1)} /> : menu.id === 'content' && tab?.id === 'banners' ? <BannerManager params={url.searchParams} /> : categoryManagement ? <CategoryManager counts={categoryCounts} categories={categories} items={items} assets={assets} params={url.searchParams} onSave={async (category) => { const savedCategory = await saveAdminCategory(category); setCategories((current) => current.some((entry) => entry.id === savedCategory.id) ? current.map((entry) => entry.id === savedCategory.id ? savedCategory : entry) : [...current, savedCategory]); window.location.hash = `/admin/basic?tab=categories&id=${savedCategory.id}` }} /> : <>
        {notice.scope === noticeScope && !editing && !discountEditing && <p className="adm-note" role="status">{notice.text}</p>}
        {statusTab && <p className="adm-note">상태는 임시 저장되며 새로고침·고객 포털 이동 시 초기화됩니다. 실제 판매·발송·재고 차감·정산은 실행하지 않습니다.</p>}
        {discountEditing ? <ProductDiscountEditor product={market.products.find((product) => product.id === id)!} cancelHref={cancelHref} onSave={(product) => { setMarket((current) => ({ ...current, products: current.products.map((entry) => entry.id === product.id ? product : entry) })); setNotice({ scope: `market/products/${product.id}`, text: `${product.id} 상품 할인율을 ${product.discountRate}%로 임시 저장했습니다.` }); saved(product.id) }} /> : occupancyEditing ? <LocationOccupancyEditor location={locationRecords.find((location) => location.id === id)!} locations={locationRecords} assets={assets} items={items} categories={categories} cancelHref={cancelHref} onSave={(changedAssets) => { const replacements = new Map(changedAssets.map((asset) => [asset.id, asset])); setAssets((current) => current.map((asset) => replacements.get(asset.id) ?? asset)); setNotice({ scope: `inventory/locations/${id}`, text: `${changedAssets.length}건의 점유 재고를 임시 저장했습니다.` }); saved(id!) }} /> : editing && campaignEditing ? <CampaignEditor key={`${mode}/${id}`} campaign={mode === 'edit' ? market.campaigns.find((entry) => entry.id === id) : undefined} campaigns={market.campaigns} categories={categories} cancelHref={cancelHref} onSave={(campaign) => { setMarket((current) => ({ ...current, campaigns: current.campaigns.some((entry) => entry.id === campaign.id) ? current.campaigns.map((entry) => entry.id === campaign.id ? campaign : entry) : [...current.campaigns, campaign] })); setNotice({ scope: `market/campaigns/${campaign.id}`, text: '기획전이 임시 저장되었습니다.' }); saved(campaign.id) }} /> : editing && locationEditing ? <LocationEditor key={`${mode}/${id}`} locations={locationRecords} id={mode === 'edit' ? id : null} cancelHref={cancelHref} onSave={(location) => { setLocationRecords((current) => current.some((entry) => entry.id === location.id) ? current.map((entry) => entry.id === location.id ? location : entry) : [...current, location]); setNotice({ scope: `inventory/locations/${location.id}`, text: `${location.id} 로케이션이 임시 저장되었습니다.` }); saved(location.id) }} /> : editing ? <InventoryEditor key={`${menu.id}/${mode}/${id}`} kind={itemManagement ? 'items' : 'inventory'} items={items} assets={assets} categories={categories} locations={locationRecords} id={mode === 'edit' ? id : null} cancelHref={cancelHref} onSaveItem={(item, previousId) => { setItems((current) => previousId ? current.map((entry) => entry.id === previousId ? item : entry) : [...current, item]); if (previousId && previousId !== item.id) setAssets((current) => current.map((asset) => asset.itemId === previousId ? { ...asset, itemId: item.id } : asset)); saved(item.id) }} onSaveAsset={(asset) => { setAssets((current) => current.some((entry) => entry.id === asset.id) ? current.map((entry) => entry.id === asset.id ? asset : entry) : [...current, asset]); saved(asset.id) }} /> : <>
          {editable && (!id || row) && <div className="adm-management-actions"><span className="adm-note">새로고침·고객 포털 이동 시 변경 내용 초기화</span><div className="adm-management-buttons">{itemManagement && !row && <ItemFileActions items={items} assets={assets} categories={categories} onImport={(imported) => { setItems((current) => [...current, ...imported]); setNotice({ scope: 'basic/items/', text: `${imported.length}개 품목을 파일에서 임시 등록했습니다.` }) }} />}{locationEditing && row && <a className="adm-button" href={occupancyHref}><Archive size={16} />점유 재고 편집</a>}<a className="adm-button adm-primary" href={editHref}>{row ? <Pencil size={16} /> : <Plus size={16} />}{recordKind} {row ? '수정' : '등록'}</a></div></div>}
          {productManagement && row && <div className="adm-management-actions"><span className="adm-note">{row.status === '판매대기' ? '판매 시작 전 상품의 할인율을 설정할 수 있습니다.' : '할인율을 변경하려면 상품 상태를 판매대기로 변경해 주세요.'}</span>{row.status === '판매대기' && <a className="adm-button adm-primary" href={discountHref}><Pencil size={16} />할인율 설정</a>}</div>}
          {view && (id ? <><a className="adm-button adm-back" href={listHref}><ArrowLeft size={15} />목록으로</a>{row ? <>{receivingRequest && <ReceivingStatusEditor key={`${row.id}/${row.status}`} currentStatus={row.status as ReceivingStatus} onChange={(status) => updateReceivingStatus(row.id, status)} />}{inspectionStage && <InspectionAction row={row} stage={inspectionStage} />}{statusTab && <MarketStatusEditor key={`${row.id}/${row.status}`} tab={statusTab} ids={[row.id]} currentStatus={row.status} onChange={updateStatus} />}{memberApplication && <MemberApproval onApprove={async () => { const response = await authenticatedFetch(`/api/admin/members/${row.id}/approve`, { method: 'POST' }); if (!response.ok) throw new Error('회원 가입 승인에 실패했습니다.'); setMembers((current) => current.map((member) => member.id === row.id ? { ...member, status: '이용 중' } : member)); setNotice({ scope: `members/list/${row.id}`, text: `${row.id} 회원 가입을 승인했습니다.` }); window.location.hash = `/admin/members?tab=list&id=${row.id}` }} />}<RecordDetail row={row} /></> : <div className="adm-empty"><h2>내역을 찾을 수 없습니다</h2><p>선택한 메뉴에 해당 번호가 없습니다.</p></div>}</> : <RecordList key={`${menu.id}/${tab?.id}`} view={view} params={url.searchParams} path={menu.id} categories={categories} statusTab={statusTab} onStatusChange={updateStatus} />)}
        </>}
        </>}
      </>}
      {!pending && row && !editing && (itemManagement || menu.id === 'inventory' && tab?.id === 'stock') && <ImagePicker key={`${menu.id}/${row.id}`} kind={itemManagement ? 'items' : 'assets'} recordId={row.id} images={(itemManagement ? items.find((entry) => entry.id === row.id) : assets.find((entry) => entry.id === row.id))?.images ?? []} limit={itemManagement ? 1 : 8} label={itemManagement ? '대표 이미지' : '자산 이미지'} onChange={(images) => { if (itemManagement) setItems((current) => current.map((entry) => entry.id === row.id ? { ...entry, images } : entry)); else setAssets((current) => current.map((entry) => entry.id === row.id ? { ...entry, images } : entry)) }} />}
      <footer className="adm-footer">MRS 스테이징 환경 · 실제 서비스 운영 환경 아님</footer>
    </main>
  </div>
}

function MemberApproval({ onApprove }: { onApprove: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  return <section className="adm-member-approval" aria-label="회원 가입 승인">{error && <span role="alert">{error}</span>}{confirming ? <><span>이 회원의 가입을 승인하시겠습니까? 승인 후 즉시 로그인할 수 있습니다.</span><button className="adm-button adm-primary" disabled={submitting} onClick={() => { setSubmitting(true); setError(''); void onApprove().catch((reason) => { setError(reason instanceof Error ? reason.message : '회원 가입 승인에 실패했습니다.'); setSubmitting(false) }) }}><Check size={16} />{submitting ? '승인 처리 중' : '승인 확정'}</button><button className="adm-button" disabled={submitting} onClick={() => setConfirming(false)}><X size={16} />취소</button></> : <><span>가입 신청 정보를 확인한 후 승인 처리해 주세요.</span><button className="adm-button adm-primary" onClick={() => setConfirming(true)}><Check size={16} />가입 승인</button></>}</section>
}

function ReceivingStatusEditor({ currentStatus, onChange }: { currentStatus: ReceivingStatus; onChange: (status: ReceivingStatus) => void }) {
  const [target, setTarget] = useState<ReceivingStatus | ''>('')
  return <section className="adm-market-status" aria-label="입고 상태 변경"><form onSubmit={(event) => { event.preventDefault(); if (target) onChange(target) }}><label>변경할 상태<select required value={target} onChange={(event) => setTarget(event.target.value as ReceivingStatus | '')}><option value="">상태 선택</option>{receivingStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label><button className="adm-button adm-primary" disabled={!target || target === currentStatus}><Check size={16} />상태 변경</button></form></section>
}

function InspectionAction({ row, stage }: { row: AdminRow; stage: string }) {
  const asset = row.links.find((link) => link.menu === 'inventory' && link.tab === 'stock')
  if (stage === 'primary') return <div className="adm-management-actions adm-inspection-action"><span className="adm-note">1차 검수 결과를 기준으로 재사용 가능 물품의 자산 원시 데이터를 관리합니다.</span><a className="adm-button adm-primary" href={asset ? `#/admin/inventory?tab=stock&id=${asset.label}` : '#/admin/inventory?tab=stock&mode=new'}>{asset ? <Archive size={16} /> : <Plus size={16} />}{asset ? '생성 자산 확인' : '자산 원시 데이터 등록'}</a></div>
  if (stage === 'detailed' && asset) return <div className="adm-management-actions adm-inspection-action"><span className="adm-note">판매에 필요한 규격·브랜드·등급·평가 정보를 보완합니다.</span><a className="adm-button adm-primary" href={`#/admin/inventory?tab=stock&id=${asset.label}&mode=edit`}><Pencil size={16} />자산 데이터 상세화</a></div>
  return null
}

function Status({ value }: { value: string }) {
  const tone = /미답변|대기|미처리|미청구|보완/.test(value) ? 'wait' : /취소|중지|미사용|반려|재고 없음/.test(value) ? 'muted' : /완료|종료/.test(value) ? 'done' : 'active'
  return <span className={`adm-status adm-status-${tone}`}>{value}</span>
}

function RecordList({ view, params, path, categories, statusTab, onStatusChange }: { view: AdminView; params: URLSearchParams; path: string; categories: MaterialCategory[]; statusTab?: MarketStatusTab; onStatusChange: (ids: string[], status: string) => void }) {
  const customers = [...new Map(view.rows.flatMap((row) => row.customerId ? [[row.customerId, { id: row.customerId, name: row.fields.find(([label]) => label === '고객사')?.[1] ?? row.customerId }] as const] : [])).values()]
  const scope = params.toString()
  const [selection, setSelection] = useState<{ scope: string; ids: string[] }>({ scope, ids: [] })
  if (selection.scope !== scope) setSelection({ scope, ids: [] })
  const bulk = statusTab === 'sales' || statusTab === 'products'
  const query = params.get('q') ?? ''
  const [search, setSearch] = useState({ scope, text: query })
  const [searching, startSearch] = useTransition()
  if (search.scope !== scope) setSearch({ scope, text: query })
  const status = params.get('status') ?? ''
  const customer = params.get('customer') ?? ''
  const period = params.get('period') ?? ''
  const sort = params.get('sort') ?? 'recent'
  const categoryId = params.get('category') ?? ''
  const extraFilters = view.rows.some((row) => row.itemId) || path === 'inventory' && (params.get('tab') ?? 'stock') === 'stock'
    ? ([['grade', '등급'], ['saleStatus', '판매 상태'], ['itemId', '품목코드'], ['locationId', '로케이션']] as const) : []
  const serverStatuses = path === 'basic' ? ['사용', '미사용'] : path === 'inventory' ? ['입고대기', '보관중', '출고완료'] : path === 'receiving' ? params.get('tab') === 'requests' ? receivingStatuses : params.get('tab') === 'disposal' ? ['미처리', '처리 예정', '폐기 완료'] : ['검수 대기', '결과 확인 대기', '검수 종료'] : path === 'market' && params.get('tab') === 'campaigns' ? ['중지', '예약', '진행 중', '종료'] : []
  const statuses: string[] = statusTab ? marketStatusOptions[statusTab].filter((value) => value !== '판매취소') : view.pagination ? [...serverStatuses] : [...new Set(view.rows.map((row) => row.status))]
  const availableCustomers = customers.filter((item) => view.rows.some((row) => row.customerId === item.id))
  const periods = [...new Set(view.rows.flatMap((row) => {
    const invoice = path === 'billing' ? invoices.find((item) => item.id === row.id) : null
    return invoice ? [invoice.period] : row.date ? [row.date.slice(0, 7)] : []
  }))].sort().reverse()
  const filtered = view.pagination ? view.rows : view.rows.filter((row) => {
    const invoice = path === 'billing' ? invoices.find((item) => item.id === row.id) : null
    return (!query.trim() || [row.id, row.title, ...row.cells, ...row.fields.flat()].join(' ').toLocaleLowerCase('ko-KR').includes(query.trim().toLocaleLowerCase('ko-KR'))) && (!status || row.status === status) && (!customer || row.customerId === customer) && (!period || (invoice?.period ?? row.date?.slice(0, 7)) === period) && extraFilters.every(([key]) => !params.get(key) || row[key] === params.get(key)) && (!categoryId || !!row.categoryId && categoryMatches(categories, row.categoryId, categoryId))
  }).sort((first, second) => sort === 'name' ? first.title.localeCompare(second.title, 'ko') : (second.date ?? '').localeCompare(first.date ?? '') || first.id.localeCompare(second.id))
  const rows = rowOptions.includes(Number(params.get('rows')) as typeof rowOptions[number]) ? Number(params.get('rows')) : 25
  const total = view.pagination?.total ?? filtered.length
  const page = Math.max(1, Math.floor(Number(params.get('page')) || 1))
  const shown = view.pagination ? filtered : filtered.slice((page - 1) * rows, page * rows)
  const selectedIds = selection.scope === scope ? selection.ids.filter((id) => shown.some((row) => row.id === id)) : []
  const allSelected = shown.length > 0 && selectedIds.length === shown.length
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    if (key !== 'page') next.delete('page')
    window.history.replaceState(null, '', `#/admin/${path}?${next}`)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  }
  const submitSearch = () => startSearch(() => update('q', search.text))
  const resetHref = `#/admin/${path}?tab=${params.get('tab') ?? ''}`
  const detailHref = (id: string) => { const next = new URLSearchParams(params); next.set('id', id); return `#/admin/${path}?${next}` }
  const billed = invoices.filter((invoice) => filtered.some((row) => row.id === invoice.id) && invoice.status !== '미청구')
  return <>
    {(categories.length > 0 || view.rows.some((row) => row.categoryId) || categoryId) && <div className="adm-category-filter"><CategorySelect categories={categories} value={categoryId} onChange={(value) => update('category', value)} /></div>}
    <div className="adm-filterbar">
      <label className="adm-search"><span>검색</span><div><Search size={16} /><input type="search" value={search.text} onChange={(event) => setSearch({ scope, text: event.target.value })} placeholder="번호, 이름, 고객사" /></div></label><button className="adm-button adm-primary adm-search-button" type="button" aria-busy={searching} disabled={searching} onClick={submitSearch}>{searching ? <LoaderCircle className="adm-spinner" size={16} /> : <Search size={16} />}{searching ? '검색 중' : '검색'}</button>
      <label><span>{path === 'basic' ? '사용 구분' : extraFilters.length ? '보관 상태' : '상태'}</span><select value={status} onChange={(event) => update('status', event.target.value)}><option value="">전체 상태</option>{status && !statuses.includes(status) && <option value={status}>{status}</option>}{statuses.map((value) => <option key={value}>{value}</option>)}</select></label>
      {extraFilters.map(([key, label]) => { const values = key === 'grade' ? ['S', 'A', 'B', 'F'] : key === 'saleStatus' ? ['판매대기', '판매중', '판매완료'] : [...new Set(view.rows.flatMap((row) => row[key] ? [row[key]!] : []))]; const selected = params.get(key) ?? ''; return <label key={key}><span>{label}</span>{view.pagination && (key === 'itemId' || key === 'locationId') ? <input key={`${scope}/${key}`} defaultValue={selected} onBlur={(event) => { if (event.target.value !== selected) update(key, event.target.value) }} /> : <select value={selected} onChange={(event) => update(key, event.target.value)}><option value="">전체</option>{selected && !values.includes(selected) && <option value={selected}>{selected}</option>}{values.map((value) => <option key={value}>{value}</option>)}</select>}</label> })}
      {view.pagination && ['inventory', 'receiving', 'market'].includes(path) ? <label><span>고객사 코드</span><input key={`${scope}/customer`} defaultValue={customer} onBlur={(event) => { if (event.target.value !== customer) update('customer', event.target.value) }} /></label> : availableCustomers.length > 0 && <label><span>고객사</span><select value={customer} onChange={(event) => update('customer', event.target.value)}><option value="">전체 고객사</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {view.pagination && ['inventory', 'receiving'].includes(path) ? <label><span>기록 월</span><input type="month" value={period} onChange={(event) => update('period', event.target.value)} /></label> : periods.length > 0 && <label><span>{path === 'billing' ? '대상 기간' : '기록 월'}</span><select value={period} onChange={(event) => update('period', event.target.value)}><option value="">전체 기간</option>{period && !periods.includes(period) && <option value={period}>{period}</option>}{periods.map((value) => <option key={value}>{value}</option>)}</select></label>}
      <a className="adm-button" href={resetHref}>초기화</a>
    </div>
    {path === 'billing' && <div className="adm-billing-summary"><span>조회 결과 청구·정산 합계<strong>{money(billed.reduce((sum, invoice) => sum + (invoiceAmount(invoice) ?? 0), 0))}</strong></span><small>미청구 예상액 제외 · 부가세 포함 예시</small></div>}
    <div className="adm-list-heading"><h2>{view.title} <span>{total}건</span></h2><label className="adm-sort"><span>정렬</span><select value={sort} onChange={(event) => update('sort', event.target.value)}><option value="recent">{path === 'basic' || extraFilters.length ? '코드순' : '최근 기록순'}</option><option value="name">이름순</option></select></label></div>
    {view.note && <p className="adm-note">{view.note}</p>}
    {bulk && statusTab && selectedIds.length > 0 && <MarketStatusEditor key={`${scope}/${selectedIds.join(',')}`} tab={statusTab} ids={selectedIds} bulk onChange={onStatusChange} onDone={() => setSelection({ scope, ids: [] })} />}
    <div className="adm-table-scroll" tabIndex={0} role="region" aria-label={`${view.title} 표`}><table><caption className="adm-sr-only">{view.title}</caption><thead><tr>{bulk && <th scope="col"><label className="adm-row-check"><input type="checkbox" aria-label="현재 페이지 전체 선택" checked={allSelected} disabled={!shown.length} ref={(element) => { if (element) element.indeterminate = selectedIds.length > 0 && !allSelected }} onChange={(event) => setSelection({ scope, ids: event.target.checked ? shown.map((row) => row.id) : [] })} /></label></th>}{path === 'basic' && <th scope="col">대표 이미지</th>}{view.headers.map((header) => <th key={header} scope="col">{header}</th>)}<th scope="col">상세</th></tr></thead><tbody>{shown.map((row) => <tr key={row.id}>{bulk && <td><label className="adm-row-check"><input type="checkbox" aria-label={`${row.id} 선택`} checked={selectedIds.includes(row.id)} onChange={(event) => setSelection({ scope, ids: event.target.checked ? [...selectedIds, row.id] : selectedIds.filter((id) => id !== row.id) })} /></label></td>}{path === 'basic' && <td>{row.images?.[0] ? <img className="adm-thumbnail" src={row.images[0].url} alt={`${row.title} 대표 이미지`} /> : <span className="adm-no-image" title="이미지 미등록"><ImageOff size={18} aria-label="이미지 미등록" /></span>}</td>}{row.cells.map((cell, index) => <td key={index}>{cell === row.status || cell === row.saleStatus || cell === row.inspectionStatus ? <Status value={cell} /> : cell}</td>)}<td><a className="adm-detail-link" href={detailHref(row.id)} aria-label={`${row.id} 상세보기`}>상세보기<ChevronRight size={14} /></a></td></tr>)}</tbody></table></div>
    {!filtered.length && <div className="adm-empty"><Search size={24} /><h2>조회 결과가 없습니다</h2><a href={resetHref}>검색 조건 초기화</a></div>}
    <AdminPagination pagination={{ page, rows, total }} loading={false} onChange={(next, size) => update(size === rows ? 'page' : 'rows', String(size === rows ? next : size))} />
  </>
}

function RecordDetail({ row }: { row: AdminRow }) {
  return <article className="adm-record">
    <div className="adm-list-heading"><h2>{row.id}</h2><Status value={row.status} /></div>
    <dl className="adm-fields">{row.fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {row.id.startsWith('PRD-') && <ProductPhoto key={row.id} id={row.id} />}
    {row.sections?.map((section) => <section className="adm-detail-section" key={section.title}><h2>{section.title}</h2>{section.rows.length ? <div className="adm-table-scroll" tabIndex={0} role="region" aria-label={section.title}><table><thead><tr>{section.headers.map((header) => <th scope="col" key={header}>{header}</th>)}</tr></thead><tbody>{section.rows.map((cells, index) => <tr key={index}>{cells.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div> : <p className="adm-note">등록된 내역이 없습니다.</p>}</section>)}
    {row.note && <p className="adm-note adm-record-note">{row.note}</p>}
    {row.links.length > 0 && <section className="adm-detail-section"><h2>관련 내역</h2><div className="adm-related">{row.links.map((link) => <a key={adminHref(link)} href={adminHref(link)}><span>{menus.find((menu) => menu.id === link.menu)?.label}</span>{link.label}<ArrowUpRight size={14} /></a>)}</div></section>}
  </article>
}

function ProductPhoto({ id }: { id: string }) {
  const [failed, setFailed] = useState(false)
  const photo = materialPhotos.find(([code]) => code === (id === 'PRD-002' ? '260902-0001' : '260818-0001'))!
  return <figure className="adm-product-photo">{failed ? <p>참고 사진을 불러오지 못했습니다.</p> : <img src={`https://thumb.wikimedia.org/wikipedia/commons/thumb/${photo[1]}`} alt={id === 'PRD-002' ? '적재된 목재 참고 사진' : '폴리에틸렌 파이프 참고 사진'} onError={() => setFailed(true)} />}<figcaption>자재 참고 사진 · 검수 증빙 아님<br /><a href={`https://commons.wikimedia.org/wiki/File:${photo[4]}`} target="_blank" rel="noreferrer">{photo[2]} · {photo[3]}</a></figcaption></figure>
}

function DashboardTable({ title, view, rows, link }: { title: string; view: AdminView; rows: AdminRow[]; link: AdminLink }) {
  return <section className="adm-dashboard-section"><div className="adm-list-heading"><h2>{title}</h2><a className="adm-detail-link" href={adminHref(link)}>전체보기<ChevronRight size={14} /></a></div><div className="adm-table-scroll" tabIndex={0} role="region" aria-label={title}><table><thead><tr><th scope="col">번호</th><th scope="col">대상</th><th scope="col">{link.tab === 'schedule' ? '입고 예정일' : link.tab === 'campaigns' ? '노출 시작일' : '접수일'}</th><th scope="col">상태</th><th scope="col">상세</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.id}</td><td>{row.title}</td><td>{dateText(row.date ?? null)}</td><td><Status value={row.status} /></td><td><a className="adm-detail-link" aria-label={`${row.id} 상세보기`} href={adminHref({ ...link, id: row.id })}>상세보기<ChevronRight size={14} /></a></td></tr>)}</tbody></table></div>{!rows.length && <p className="adm-note">{view.title} 내역이 없습니다.</p>}</section>
}

function Dashboard({ views, metrics }: { views: Record<string, AdminView>; metrics: Record<string, number> }) {
  const receivingView = views['receiving/requests']
  const inquiryView = views['customers/inquiries']
  const campaignView = views['market/campaigns']
  return <>
    <div className="adm-metrics">{dashboardMetrics.map((metric) => <a href={adminHref(metric)} key={metric.label}><span>{metric.label}</span><strong>{metrics[`${metric.menu}/${metric.tab}`] ?? views[`${metric.menu}/${metric.tab}`].rows.filter((entry) => entry.status === metric.status).length}<small>건</small></strong><ChevronRight size={15} /></a>)}</div>
    <DashboardTable title="확인할 입고 신청" view={receivingView} rows={receivingView.rows.filter((row) => row.status === '입고 신청')} link={{ label: '', menu: 'receiving', tab: 'requests' }} />
    <DashboardTable title="입고 승인" view={receivingView} rows={receivingView.rows.filter((row) => row.status === '입고 승인')} link={{ label: '', menu: 'receiving', tab: 'requests', status: '입고 승인' }} />
    <div className="adm-dashboard-columns"><DashboardTable title="고객 문의" view={inquiryView} rows={inquiryView.rows.filter((row) => row.status !== '답변 완료')} link={{ label: '', menu: 'customers', tab: 'inquiries' }} /><DashboardTable title="기획전 일정" view={campaignView} rows={campaignView.rows.filter((row) => row.status === '진행 중' || row.status === '예약')} link={{ label: '', menu: 'market', tab: 'campaigns' }} /></div>
  </>
}