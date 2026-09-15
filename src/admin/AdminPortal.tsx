import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowUpRight, Archive, Building2, ChevronLeft, ChevronRight, ClipboardCheck, LayoutDashboard, Menu, PackageCheck, ReceiptText, Search, Settings2, ShoppingCart, X } from 'lucide-react'
import { customers, dateText, invoiceAmount, invoices, money, referenceDate } from './adminData'
import { adminHref, dashboardMetrics, menus, views, type AdminLink, type AdminRow, type AdminView } from './adminViews'
import { materialPhotos } from '../assetPhotos'
import './AdminPortal.css'

const icons = { dashboard: LayoutDashboard, receiving: PackageCheck, inspections: ClipboardCheck, inventory: Archive, market: ShoppingCart, billing: ReceiptText, customers: Building2, settings: Settings2 }
const pageSize = 5

export default function AdminPortal({ hash }: { hash: string }) {
  const url = new URL(hash.slice(1), 'https://mrs.example')
  const route = url.pathname.split('/')[2] || 'dashboard'
  const menu = menus.find((item) => item.id === route) ?? menus[0]
  const tab = menu.tabs.find((item) => item.id === url.searchParams.get('tab')) ?? menu.tabs[0]
  const view = tab ? views[`${menu.id}/${tab.id}`] : null
  const id = url.searchParams.get('id')
  const row = view?.rows.find((item) => item.id === id)
  const [menuOpen, setMenuOpen] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus(); window.scrollTo(0, 0) }, [menu.id, tab?.id, id])
  useEffect(() => {
    if (route !== menu.id || url.pathname.split('/').length > 3 || (tab && url.searchParams.has('tab') && url.searchParams.get('tab') !== tab.id)) {
      window.location.replace(adminHref({ label: '', menu: menu.id, tab: tab?.id ?? '' }))
    }
  }, [route, menu.id, tab, url.pathname, url.searchParams])
  const listParams = new URLSearchParams(url.searchParams)
  listParams.delete('id')
  const listHref = `#/admin/${menu.id}?${listParams}`
  return <div className="admin-portal">
    <header className="adm-header">
      <button className="adm-icon adm-menu-toggle" aria-label={menuOpen ? '관리 메뉴 닫기' : '관리 메뉴 열기'} aria-expanded={menuOpen} aria-controls="admin-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
      <a className="adm-brand" href="#/admin/dashboard">MRS <span>ADMIN</span></a>
      <span className="adm-prototype">독립 예시 · 조회 전용</span>
      <a className="adm-customer-link" href="#">고객 포털<ArrowUpRight size={16} /></a>
    </header>
    <aside className={`adm-sidebar ${menuOpen ? 'is-open' : ''}`}>
      <nav id="admin-navigation" aria-label="관리자 메뉴">{menus.map((item) => { const Icon = icons[item.id]; return <a key={item.id} href={adminHref({ label: item.label, menu: item.id, tab: item.tabs[0]?.id ?? '' })} aria-current={menu.id === item.id ? 'page' : undefined} onClick={() => setMenuOpen(false)}><Icon size={17} />{item.label}</a> })}</nav>
      <div className="adm-sidebar-note">예시 기준일<strong>{dateText(referenceDate)}</strong><span>한국 표준시 · KST</span></div>
    </aside>
    <main className="adm-main">
      <div className="adm-heading"><div><div className="adm-breadcrumb">운영 관리 / {menu.label}{row ? ` / ${row.id}` : ''}</div><h1 ref={heading} tabIndex={-1}>{row ? row.title : menu.label}</h1></div><span className="adm-mode">관리자 시안</span></div>
      {menu.id === 'dashboard' ? <Dashboard /> : <>
        <nav className="adm-tabs" aria-label={`${menu.label} 보기`}>{menu.tabs.map((item) => <a key={item.id} href={adminHref({ label: item.label, menu: menu.id, tab: item.id })} aria-current={item.id === tab?.id ? 'page' : undefined}>{item.label}</a>)}</nav>
        {view && (id ? <><a className="adm-button adm-back" href={listHref}><ArrowLeft size={15} />목록으로</a>{row ? <RecordDetail row={row} /> : <div className="adm-empty"><h2>내역을 찾을 수 없습니다</h2><p>선택한 메뉴에 해당 번호가 없습니다.</p></div>}</> : <RecordList key={`${menu.id}/${tab?.id}`} view={view} params={url.searchParams} path={menu.id} />)}
      </>}
      <footer className="adm-footer">MRS 운영 관리 · 예시 데이터 / 실제 승인·발송·청구 없음</footer>
    </main>
  </div>
}

function Status({ value }: { value: string }) {
  const tone = /미답변|대기|미처리|미청구|보완/.test(value) ? 'wait' : /취소|중지/.test(value) ? 'muted' : /완료|종료/.test(value) ? 'done' : 'active'
  return <span className={`adm-status adm-status-${tone}`}>{value}</span>
}

function RecordList({ view, params, path }: { view: AdminView; params: URLSearchParams; path: string }) {
  const query = params.get('q') ?? ''
  const status = params.get('status') ?? ''
  const customer = params.get('customer') ?? ''
  const period = params.get('period') ?? ''
  const sort = params.get('sort') ?? 'recent'
  const statuses = [...new Set(view.rows.map((row) => row.status))]
  const availableCustomers = customers.filter((item) => view.rows.some((row) => row.customerId === item.id))
  const periods = [...new Set(view.rows.flatMap((row) => {
    const invoice = path === 'billing' ? invoices.find((item) => item.id === row.id) : null
    return invoice ? [invoice.period] : row.date ? [row.date.slice(0, 7)] : []
  }))].sort().reverse()
  const filtered = view.rows.filter((row) => {
    const invoice = path === 'billing' ? invoices.find((item) => item.id === row.id) : null
    return (!query.trim() || [row.id, row.title, ...row.cells].join(' ').toLocaleLowerCase('ko-KR').includes(query.trim().toLocaleLowerCase('ko-KR'))) && (!status || row.status === status) && (!customer || row.customerId === customer) && (!period || (invoice?.period ?? row.date?.slice(0, 7)) === period)
  }).sort((first, second) => sort === 'name' ? first.title.localeCompare(second.title, 'ko') : (second.date ?? '').localeCompare(first.date ?? '') || first.id.localeCompare(second.id))
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const page = Math.min(pageCount, Math.max(1, Math.floor(Number(params.get('page')) || 1)))
  const shown = filtered.slice((page - 1) * pageSize, page * pageSize)
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    if (key !== 'page') next.delete('page')
    window.history.replaceState(null, '', `#/admin/${path}?${next}`)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  }
  const resetHref = `#/admin/${path}?tab=${params.get('tab') ?? ''}`
  const detailHref = (id: string) => { const next = new URLSearchParams(params); next.set('id', id); return `#/admin/${path}?${next}` }
  const billed = invoices.filter((invoice) => filtered.some((row) => row.id === invoice.id) && invoice.status !== '미청구')
  return <>
    <div className="adm-filterbar">
      <label className="adm-search"><span>검색</span><div><Search size={16} /><input type="search" value={query} onChange={(event) => update('q', event.target.value)} placeholder="번호, 이름, 고객사" /></div></label>
      <label><span>상태</span><select value={status} onChange={(event) => update('status', event.target.value)}><option value="">전체 상태</option>{status && !statuses.includes(status) && <option value={status}>{status}</option>}{statuses.map((value) => <option key={value}>{value}</option>)}</select></label>
      {availableCustomers.length > 0 && <label><span>고객사</span><select value={customer} onChange={(event) => update('customer', event.target.value)}><option value="">전체 고객사</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {periods.length > 0 && <label><span>{path === 'billing' ? '대상 기간' : '기록 월'}</span><select value={period} onChange={(event) => update('period', event.target.value)}><option value="">전체 기간</option>{period && !periods.includes(period) && <option value={period}>{period}</option>}{periods.map((value) => <option key={value}>{value}</option>)}</select></label>}
      <a className="adm-button" href={resetHref}>초기화</a>
    </div>
    {path === 'billing' && <div className="adm-billing-summary"><span>조회 결과 청구·정산 합계<strong>{money(billed.reduce((sum, invoice) => sum + (invoiceAmount(invoice) ?? 0), 0))}</strong></span><small>미청구 예상액 제외 · 부가세 포함 예시</small></div>}
    <div className="adm-list-heading"><h2>{view.title} <span>{filtered.length}건</span></h2><label className="adm-sort"><span>정렬</span><select value={sort} onChange={(event) => update('sort', event.target.value)}><option value="recent">최근 기록순</option><option value="name">이름순</option></select></label></div>
    {view.note && <p className="adm-note">{view.note}</p>}
    <div className="adm-table-scroll" tabIndex={0} role="region" aria-label={`${view.title} 표`}><table><caption className="adm-sr-only">{view.title}</caption><thead><tr>{view.headers.map((header) => <th key={header} scope="col">{header}</th>)}<th scope="col">상세</th></tr></thead><tbody>{shown.map((row) => <tr key={row.id}>{row.cells.map((cell, index) => <td key={index}>{cell === row.status ? <Status value={cell} /> : cell}</td>)}<td><a className="adm-detail-link" href={detailHref(row.id)} aria-label={`${row.id} 상세보기`}>상세보기<ChevronRight size={14} /></a></td></tr>)}</tbody></table></div>
    {!filtered.length && <div className="adm-empty"><Search size={24} /><h2>조회 결과가 없습니다</h2><a href={resetHref}>검색 조건 초기화</a></div>}
    <div className="adm-pagination"><span>{filtered.length ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} / ${filtered.length}건` : '0건'}</span><div><button className="adm-icon" title="이전 페이지" aria-label="이전 페이지" disabled={page <= 1} onClick={() => update('page', String(page - 1))}><ChevronLeft size={18} /></button><span aria-live="polite">{page} / {pageCount}</span><button className="adm-icon" title="다음 페이지" aria-label="다음 페이지" disabled={page >= pageCount} onClick={() => update('page', String(page + 1))}><ChevronRight size={18} /></button></div></div>
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
  const photo = materialPhotos.find(([code]) => code === (id === 'PRD-002' ? 'EMX-WOD-240902' : 'EMX-PIP-240827'))!
  return <figure className="adm-product-photo">{failed ? <p>참고 사진을 불러오지 못했습니다.</p> : <img src={`https://thumb.wikimedia.org/wikipedia/commons/thumb/${photo[1]}`} alt={id === 'PRD-002' ? '적재된 목재 참고 사진' : '폴리에틸렌 파이프 참고 사진'} onError={() => setFailed(true)} />}<figcaption>자재 참고 사진 · 검수 증빙 아님<br /><a href={`https://commons.wikimedia.org/wiki/File:${photo[4]}`} target="_blank" rel="noreferrer">{photo[2]} · {photo[3]}</a></figcaption></figure>
}

function DashboardTable({ title, view, rows, link }: { title: string; view: AdminView; rows: AdminRow[]; link: AdminLink }) {
  return <section className="adm-dashboard-section"><div className="adm-list-heading"><h2>{title}</h2><a className="adm-detail-link" href={adminHref(link)}>전체보기<ChevronRight size={14} /></a></div><div className="adm-table-scroll" tabIndex={0} role="region" aria-label={title}><table><thead><tr><th scope="col">번호</th><th scope="col">대상</th><th scope="col">{link.tab === 'schedule' ? '입고 예정일' : link.tab === 'campaigns' ? '노출 시작일' : '접수일'}</th><th scope="col">상태</th><th scope="col">상세</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.id}</td><td>{row.title}</td><td>{dateText(row.date ?? null)}</td><td><Status value={row.status} /></td><td><a className="adm-detail-link" aria-label={`${row.id} 상세보기`} href={adminHref({ ...link, id: row.id })}>상세보기<ChevronRight size={14} /></a></td></tr>)}</tbody></table></div>{!rows.length && <p className="adm-note">{view.title} 내역이 없습니다.</p>}</section>
}

function Dashboard() {
  const receivingView = views['receiving/requests']
  const inquiryView = views['customers/inquiries']
  const campaignView = views['market/campaigns']
  return <>
    <div className="adm-metrics">{dashboardMetrics.map((metric) => <a href={adminHref(metric)} key={metric.label}><span>{metric.label}</span><strong>{metric.count}<small>건</small></strong><ChevronRight size={15} /></a>)}</div>
    <DashboardTable title="확인할 입고 신청" view={receivingView} rows={receivingView.rows.filter((row) => row.status === '접수 대기' || row.status === '견적 안내')} link={{ label: '', menu: 'receiving', tab: 'requests' }} />
    <DashboardTable title="입고 예정" view={views['receiving/schedule']} rows={views['receiving/schedule'].rows.filter((row) => row.status === '입고 예정')} link={{ label: '', menu: 'receiving', tab: 'schedule', status: '입고 예정' }} />
    <div className="adm-dashboard-columns"><DashboardTable title="고객 문의" view={inquiryView} rows={inquiryView.rows.filter((row) => row.status !== '답변 완료')} link={{ label: '', menu: 'customers', tab: 'inquiries' }} /><DashboardTable title="기획전 일정" view={campaignView} rows={campaignView.rows.filter((row) => row.status === '진행 중' || row.status === '예약')} link={{ label: '', menu: 'market', tab: 'campaigns' }} /></div>
  </>
}