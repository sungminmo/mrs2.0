import { useLayoutEffect, useRef, useState } from 'react'
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from 'react'
import { ArrowDownToLine, ArrowRight, ArrowUpDown, Box, Check, ChevronDown, ClipboardCheck, Clock, Layers, Leaf, PackagePlus, RotateCcw, Search, ShoppingCart, SlidersHorizontal, Tag, TrendingUp, X } from 'lucide-react'
import type { Asset } from './App'
import './AdminAssets.css'
import AdminShell from './AdminShell'
import ShopifyAssetDetail from './ShopifyAssetDetail'
import MarketRegistrationConfirm from './MarketRegistrationConfirm'
import { materialPhotos } from './assetPhotos'
import { categoryChain, categoryMatches, materialCategories } from './categories'
import CategorySelect from './CategorySelect'
import PageBanner from './PageBanner'

const amount = (value: string) => Number(value.replaceAll(',', ''))
const number = (value: number) => value.toLocaleString('ko-KR')
const money = (value: number) => `₩${number(value)}`
const statuses = ['전체', '판매 중', '보관 중', '대기 중'] as const
const statusClass = (status: string) => status === '판매 중' ? 'selling' : status === '대기 중' ? 'pending' : 'stored'
const STORAGE_FEE_DAYS = 30
const STORAGE_WARNING_DAYS = 7
const storageDays = (asset: Asset) => parseInt(asset.storageDays) || 0
const storageBuckets = [
  { label: '0–7일', min: 0, max: 7, tone: 'ok' },
  { label: '8–14일', min: 8, max: 14, tone: 'ok' },
  { label: '15–22일', min: 15, max: STORAGE_FEE_DAYS - STORAGE_WARNING_DAYS - 1, tone: 'ok' },
  { label: `23–${STORAGE_FEE_DAYS}일 · 부과 임박`, min: STORAGE_FEE_DAYS - STORAGE_WARNING_DAYS, max: STORAGE_FEE_DAYS, tone: 'warn' },
  { label: `${STORAGE_FEE_DAYS}일 초과 · 보관료 발생`, min: STORAGE_FEE_DAYS + 1, max: Infinity, tone: 'over' },
] as const
const categoryPalette = ['#349b75', '#7e9ccc', '#ddb655', '#c98b6b', '#8f7fc2', '#5fb3b3', '#a0a0a0']
const rootCategory = (asset: Asset) => categoryChain(materialCategories, asset.categoryId)[0]?.name ?? '기타'
function categoryShares(rows: Asset[]) {
  const sum = rows.reduce((acc, asset) => acc + amount(asset.appraisalValue), 0)
  return [...new Set(rows.map(rootCategory))]
    .map((name) => { const items = rows.filter((asset) => rootCategory(asset) === name); const value = items.reduce((acc, asset) => acc + amount(asset.appraisalValue), 0); return { name, count: items.length, value, share: sum ? value / sum * 100 : 0 } })
    .sort((first, second) => second.value - first.value)
    .map((row, index) => ({ ...row, color: categoryPalette[index % categoryPalette.length] }))
}

export type AssetValueSnapshot = { signature: string; values: number[] }
type ObserveAssetValues = (snapshot: AssetValueSnapshot) => AssetValueSnapshot | null

function useAssetValueMotion(inventory: Asset[], showingDetail: boolean, onValuesObserved: ObserveAssetValues) {
  const root = useRef<HTMLElement>(null)
  const pendingMotion = useRef<{ signature: string; previous: AssetValueSnapshot | null } | null>(null)
  const signature = JSON.stringify(inventory.map((asset) => [asset.code, amount(asset.appraisalValue)] as const).filter(([, value]) => value !== 0).sort(([first], [second]) => first.localeCompare(second)))
  const valuesKey = JSON.stringify(statuses.map((status) => inventory.reduce((sum, asset) => sum + (status === '전체' || asset.status === status ? amount(asset.appraisalValue) : 0), 0)))

  useLayoutEffect(() => {
    if (showingDetail || !root.current) return
    const values: number[] = JSON.parse(valuesKey)
    const observed = onValuesObserved({ signature, values })
    const previous = pendingMotion.current?.signature === signature ? pendingMotion.current.previous : observed
    if (previous?.signature === signature) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (motion.matches) { pendingMotion.current = null; return }
    pendingMotion.current = { signature, previous }
    const startValues = previous?.values ?? values.map(() => 0)
    const elements = root.current
    const animations: Animation[] = []
    let frame = 0
    const counters = Array.from(elements.querySelectorAll<HTMLElement>('[data-asset-value]'))
    const finish = () => {
      cancelAnimationFrame(frame)
      animations.forEach((animation) => animation.cancel())
      counters.forEach((counter) => { counter.textContent = money(Number(counter.dataset.assetValue)) })
    }
    const reveal = (selector: string, delay: number, duration = 280, stagger = 0, frames: Keyframe[] = [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }]) => {
      elements.querySelectorAll(selector).forEach((element, index) => {
        const animation = element.animate(frames, { duration, delay: delay + index * stagger, easing: 'cubic-bezier(0.25, 1, 0.5, 1)', fill: 'backwards' })
        animations.push(animation)
      })
    }
    reveal('.sa-hero', 0)
    reveal('.sa-stacked-bar', 450, 400, 0, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }])
    reveal('.sa-storage-row', 450, 240, 60)
    reveal('.sa-storage-bar > span', 500, 420, 60, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }])
    reveal('.sa-hero-stats > div', 600, 260, 70)
    reveal('.sa-metric', 800, 260, 80)
    reveal('.sa-metric-bar > span, .sa-share-bar > span', 900, 400, 80, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }])
    reveal('.sa-bottom-grid > section', 1150, 260, 90)
    reveal('.sa-notice', 1450, 240, 0, [{ opacity: 0 }, { opacity: 1 }])
    const start = performance.now()
    const tick = (time: number) => {
      const progress = Math.max(0, Math.min(1, (time - start) / 480))
      const eased = 1 - (1 - progress) ** 4
      counters.forEach((counter, index) => { counter.textContent = money(Math.round(startValues[index] + (values[index] - startValues[index]) * eased)) })
      if (progress < 1) frame = requestAnimationFrame((nextTime) => { pendingMotion.current = null; tick(nextTime) })
    }
    tick(start)
    const onMotionChange = () => { if (motion.matches) finish() }
    motion.addEventListener('change', onMotionChange)
    elements.addEventListener('focusin', finish)
    return () => {
      finish()
      motion.removeEventListener('change', onMotionChange)
      elements.removeEventListener('focusin', finish)
    }
  }, [signature, valuesKey, showingDetail, onValuesObserved])
  return root
}

function AssetImage({ asset }: { asset: Asset }) {
  const [failed, setFailed] = useState(false)
  return asset.image && !failed ? <img src={asset.image} alt={asset.name} loading="lazy" onError={() => setFailed(true)} /> : <Box size={24} aria-label="이미지 없음" />
}

function CategoryShare({ rows, label }: { rows: ReturnType<typeof categoryShares>; label: string }) {
  if (!rows.length) return <p className="sa-share-empty">표시할 자산이 없습니다.</p>
  return <>
    <div className="sa-share-bar" role="img" aria-label={`${label}: ${rows.map((row) => `${row.name} ${Math.round(row.share)}%`).join(', ')}`}>{rows.map((row) => <span key={row.name} style={{ width: `${row.share}%`, background: row.color }} />)}</div>
    <ul className="sa-share-legend">{rows.map((row) => <li key={row.name}><i style={{ background: row.color }} /><span>{row.name}</span><b>{Math.round(row.share)}%</b></li>)}</ul>
  </>
}

export default function AdminAssets({ assets: inventory, onAssetsChange: setInventory, navigation, onValuesObserved, inspectionActive, onInspectionView, inspectionContent, inspectionCount, onFaq }: { assets: Asset[]; onAssetsChange: Dispatch<SetStateAction<Asset[]>>; navigation: ReactNode; onValuesObserved: ObserveAssetValues; inspectionActive: boolean; onInspectionView: (active: boolean) => void; inspectionContent: ReactNode; inspectionCount: number; onFaq: () => void }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<string>('전체')
  const [location, setLocation] = useState('전체 위치')
  const [grade, setGrade] = useState('전체')
  const [category, setCategory] = useState('')
  const [receivedFrom, setReceivedFrom] = useState('')
  const [receivedTo, setReceivedTo] = useState('')
  const [storageDaysFrom, setStorageDaysFrom] = useState('')
  const [storageDaysTo, setStorageDaysTo] = useState('')
  const [draftQuery, setDraftQuery] = useState('')
  const [draftGrade, setDraftGrade] = useState('전체')
  const [draftCategory, setDraftCategory] = useState('')
  const [draftLocation, setDraftLocation] = useState('전체 위치')
  const [draftReceivedFrom, setDraftReceivedFrom] = useState('')
  const [draftReceivedTo, setDraftReceivedTo] = useState('')
  const [draftStorageDaysFrom, setDraftStorageDaysFrom] = useState('')
  const [draftStorageDaysTo, setDraftStorageDaysTo] = useState('')
  const [sort, setSort] = useState('newest')
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [detail, setDetail] = useState<Asset | null>(null)
  const [assetListActive, setAssetListActive] = useState(false)
  const overview = useAssetValueMotion(inventory, detail !== null || inspectionActive, onValuesObserved)
  const [message, setMessage] = useState('')
  const [marketConfirmOpen, setMarketConfirmOpen] = useState(false)
  const addDialog = useRef<HTMLDialogElement>(null)
  const total = inventory.reduce((sum, asset) => sum + amount(asset.appraisalValue), 0)
  const pending = inventory.filter((asset) => asset.status === '대기 중')
  const statusValue = (item: string) => inventory.reduce((sum, asset) => sum + (asset.status === item ? amount(asset.appraisalValue) : 0), 0)
  const saleTotal = inventory.reduce((sum, asset) => sum + amount(asset.salePrice), 0)
  const expectedGain = saleTotal - total
  const locationCount = new Set(inventory.map((asset) => asset.location)).size
  const feeSoon = inventory.filter((asset) => storageDays(asset) >= STORAGE_FEE_DAYS - STORAGE_WARNING_DAYS && storageDays(asset) <= STORAGE_FEE_DAYS)
  const feeCharged = inventory.filter((asset) => storageDays(asset) > STORAGE_FEE_DAYS)
  const storageRows = storageBuckets.map((bucket) => { const rows = inventory.filter((asset) => storageDays(asset) >= bucket.min && storageDays(asset) <= bucket.max); return { ...bucket, count: rows.length, value: rows.reduce((sum, asset) => sum + amount(asset.appraisalValue), 0) } })
  const storageMax = Math.max(...storageRows.map((row) => row.count), 1)
  const recent = [...inventory].sort((first, second) => second.receivedAt.localeCompare(first.receivedAt)).slice(0, 4)
  const categoryRows = categoryShares(inventory)
  const recentCategoryRows = categoryShares(recent)
  const topAsset = [...inventory].sort((first, second) => amount(second.appraisalValue) - amount(first.appraisalValue))[0]
  const visible = inventory.filter((asset) =>
    (status === '전체' || asset.status === status) &&
    (location === '전체 위치' || asset.location === location) &&
    (grade === '전체' || asset.grade === grade) &&
    (!category || categoryMatches(materialCategories, asset.categoryId, category)) &&
    (!receivedFrom || asset.receivedAt.replaceAll('.', '-') >= receivedFrom) &&
    (!receivedTo || asset.receivedAt.replaceAll('.', '-') <= receivedTo) &&
    (!storageDaysFrom || storageDays(asset) >= Number(storageDaysFrom)) &&
    (!storageDaysTo || storageDays(asset) <= Number(storageDaysTo)) &&
    `${asset.name} ${asset.code} ${asset.brand}`.toLowerCase().includes(query.trim().toLowerCase()),
  ).sort((first, second) => sort === 'value' ? amount(second.appraisalValue) - amount(first.appraisalValue) : sort === 'name' ? first.name.localeCompare(second.name, 'ko') : second.receivedAt.localeCompare(first.receivedAt))
  const advancedFilterCount = [grade !== '전체', !!category, location !== '전체 위치', !!receivedFrom, !!receivedTo, !!storageDaysFrom, !!storageDaysTo].filter(Boolean).length
  const selectedVisible = visible.filter((asset) => selected.includes(asset.code))
  const allSelected = visible.length > 0 && selectedVisible.length === visible.length
  const toggleSelection = (code: string) => setSelected((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code])
  const syncDraft = () => { setDraftQuery(query); setDraftGrade(grade); setDraftCategory(category); setDraftLocation(location); setDraftReceivedFrom(receivedFrom); setDraftReceivedTo(receivedTo); setDraftStorageDaysFrom(storageDaysFrom); setDraftStorageDaysTo(storageDaysTo) }
  const applySearch = () => { setQuery(draftQuery); setGrade(draftGrade); setCategory(draftCategory); setLocation(draftLocation); setReceivedFrom(draftReceivedFrom); setReceivedTo(draftReceivedTo); setStorageDaysFrom(draftStorageDaysFrom); setStorageDaysTo(draftStorageDaysTo) }
  const resetSearch = () => {
    setQuery(''); setStatus('전체'); setLocation('전체 위치'); setGrade('전체'); setCategory(''); setReceivedFrom(''); setReceivedTo(''); setStorageDaysFrom(''); setStorageDaysTo('')
    setDraftQuery(''); setDraftGrade('전체'); setDraftCategory(''); setDraftLocation('전체 위치'); setDraftReceivedFrom(''); setDraftReceivedTo(''); setDraftStorageDaysFrom(''); setDraftStorageDaysTo('')
  }
  const openDetail = (asset: Asset) => setDetail(asset)
  const openList = (item: string) => {
    setQuery(''); setStatus(item); setLocation('전체 위치'); setGrade('전체'); setCategory(''); setReceivedFrom(''); setReceivedTo(''); setStorageDaysFrom(''); setStorageDaysTo('')
    setDraftQuery(''); setDraftGrade('전체'); setDraftCategory(''); setDraftLocation('전체 위치'); setDraftReceivedFrom(''); setDraftReceivedTo(''); setDraftStorageDaysFrom(''); setDraftStorageDaysTo('')
    setAssetListActive(true)
  }

  const canRegisterMarket = selectedVisible.length > 0 && selectedVisible.every((asset) => asset.status === '보관 중')

  function registerSelectedMarket() {
    if (!canRegisterMarket) return
    setMarketConfirmOpen(true)
  }

  function confirmSelectedMarket() {
    setMarketConfirmOpen(false)
    if (!canRegisterMarket) return
    const codes = new Set(selectedVisible.map((asset) => asset.code))
    setInventory((current) => {
      const targets = current.filter((asset) => codes.has(asset.code))
      if (targets.length !== codes.size || targets.some((asset) => asset.status !== '보관 중')) return current
      return current.map((asset) => codes.has(asset.code) ? { ...asset, status: '대기 중' } : asset)
    })
    setSelected([])
    setMessage(`${codes.size}건의 마켓 등록을 신청했습니다. 검수 대기 중이며, 관리자 승인 후 판매 중으로 전환됩니다.`)
  }

  function exportAssets() {
    const rows = selectedVisible.length ? selectedVisible : visible
    const columns: (keyof Asset)[] = ['code', 'name', 'status', 'grade', 'quantity', 'unit', 'appraisalValue', 'location', 'receivedAt']
    const escape = (value: string) => `"${(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`
    const csv = [['자산 코드', '자산명', '상태', '등급', '수량', '단위', '평가 가치', '보관 위치', '입고일'], ...rows.map((asset) => columns.map((key) => asset[key]))].map((row) => row.map(escape).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'EcoMatX-assets.csv'
    link.click()
    URL.revokeObjectURL(url)
    setMessage(`${rows.length}건의 자산을 CSV로 내보냈습니다.`)
  }

  function registerAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const name = String(data.get('name')).trim()
    const storage = String(data.get('location')).trim()
    if (!name || !storage) return
    const receivedAt = new Intl.DateTimeFormat('sv-SE').format(new Date()).replaceAll('-', '.')
    const asset: Asset = {
      code: `EMX-NEW-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, name, categoryId: 'CAT-019',
      grade: String(data.get('grade')), quantity: String(data.get('quantity')), unit: String(data.get('unit')),
      location: storage, appraisalValue: number(Number(data.get('value'))), receivedAt, storageDays: '0일',
      status: '대기 중', salePrice: '0',
      brand: String(data.get('brand')).trim() || '미등록', specification: String(data.get('specification')).trim() || '미등록',
      shipmentUnit: '미등록', note: '신규 입고 자산입니다. 검수 후 보관 상태를 변경해 주세요.', image: '',
    }
    setInventory((current) => [asset, ...current])
    resetSearch()
    setSort('newest')
    form.reset()
    addDialog.current?.close()
    setMessage(`${name}을 등록했습니다. 변경은 새로고침 시 초기화됩니다.`)
  }

  const detailIndex = inventory.findIndex((asset) => asset.code === detail?.code)
  const search = <label className="sa-global-search"><Search size={18} /><input aria-label="자산 검색" placeholder="자산명, 코드, 브랜드 검색" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button className="sa-icon" aria-label="검색 지우기" onClick={() => setQuery('')}><X size={15} /></button>}</label>
  return <AdminShell navigation={navigation} search={detail || inspectionActive ? undefined : search}>
    {marketConfirmOpen && <MarketRegistrationConfirm subject={`선택한 자산 ${selectedVisible.length}건`} onCancel={() => setMarketConfirmOpen(false)} onConfirm={confirmSelectedMarket} />}
    <main ref={overview} className="sa-main sa-assets-main">
      {detail ? <ShopifyAssetDetail key={detail.code} asset={inventory[detailIndex]} previous={inventory[detailIndex - 1]} next={inventory[detailIndex + 1]} onBack={() => setDetail(null)} onNavigate={setDetail} onSave={(updated) => setInventory((current) => current.map((asset) => asset.code === updated.code ? updated : asset))} onFaq={onFaq} /> : <>
      <div className="sa-heading"><div><div className="sa-breadcrumb">워크스페이스 <span>/</span> 자산</div><h1>내 자산 <span>{inventory.length}</span></h1></div>{!inspectionActive && <div className="sa-heading-actions"><button className="sa-button" onClick={exportAssets} disabled={!visible.length}><ArrowDownToLine size={15} />내보내기</button><button className="sa-button sa-primary" onClick={() => addDialog.current?.showModal()}><PackagePlus size={16} />자산 등록</button></div>}</div>
      <div className="inspection-tabs" role="group" aria-label="내 자산 보기"><button className="sa-button" aria-pressed={!inspectionActive && !assetListActive} onClick={() => { setAssetListActive(false); onInspectionView(false) }}>자산 현황</button><button className="sa-button" aria-pressed={assetListActive} onClick={() => { syncDraft(); setAssetListActive(true); onInspectionView(false) }}>자산 목록</button><button className="sa-button" aria-pressed={inspectionActive} onClick={() => { setAssetListActive(false); onInspectionView(true) }}>검수·폐기 내역</button></div>
      {inspectionActive ? inspectionContent : <>
      {!assetListActive && <>
      <section className="sa-hero" aria-label="나의 자산 가치">
        <div className="sa-hero-value">
          <span className="sa-hero-label"><span className="sa-live-dot" />나의 총 자산 가치<small>입고 자산 평가 기준 · KRW</small></span>
          <strong aria-label={money(total)}><span aria-hidden="true" data-asset-value={total}>{money(total)}</span></strong>
          <div className="sa-hero-change"><span>입고 자산 {inventory.length}건 · 보관 위치 {locationCount}곳 · 자재 카테고리 {categoryRows.length}종</span></div>
          <div className="sa-stacked-bar" role="img" aria-label={statuses.slice(1).map((item) => `${item} ${money(statusValue(item))}`).join(', ')}>{statuses.slice(1).map((item) => <span key={item} className={statusClass(item)} style={{ width: `${total ? statusValue(item) / total * 100 : 0}%` }} />)}</div>
          <div className="sa-hero-legend">{statuses.slice(1).map((item) => <span key={item}><i className={`sa-dot ${statusClass(item)}`} />{item} {total ? Math.round(statusValue(item) / total * 100) : 0}%</span>)}</div>
        </div>
        <div className="sa-hero-trend"><div className="sa-hero-trend-title"><span>보관 기간별 자산 분포</span><span>{STORAGE_FEE_DAYS}일 경과 시 보관료 발생</span></div>
          <div className="sa-storage" role="img" aria-label={`보관 기간별 자산 분포: ${storageRows.map((row) => `${row.label} ${row.count}건`).join(', ')}`}>{storageRows.map((row) => <div key={row.label} className={`sa-storage-row is-${row.tone}`}><span>{row.label}</span><span className="sa-storage-bar"><span style={{ width: `${row.count / storageMax * 100}%` }} /></span><b>{row.count}건</b></div>)}</div>
        </div>
        <div className="sa-hero-stats">
          <div><span><Tag size={13} />판매 예정가 합계</span><b>{money(saleTotal)}</b><small>등록 판매가 기준</small></div>
          <div><span><TrendingUp size={13} />평가 대비 기대 차익</span><b className={expectedGain < 0 ? 'is-down' : 'is-up'}>{expectedGain < 0 ? '-' : '+'}{money(Math.abs(expectedGain))}</b><small>{total ? `${expectedGain < 0 ? '' : '+'}${(expectedGain / total * 100).toFixed(1)}%` : '—'} · 판매 완료 시</small></div>
          <div className={feeSoon.length || feeCharged.length ? 'is-alert' : ''}><span><Clock size={13} />보관료 부과 임박 (D-{STORAGE_WARNING_DAYS} 이내)</span><b><em className="sa-fee-badge">{feeSoon.length}건</em>{feeCharged.length > 0 && <small className="sa-fee-over">발생 중 {feeCharged.length}건</small>}</b><small>{feeSoon.length ? `${money(feeSoon.reduce((sum, asset) => sum + amount(asset.appraisalValue), 0))} · 프로모션 할인으로 판매 촉진 권장` : `${STORAGE_FEE_DAYS}일 경과 시 보관료 발생`}</small></div>
          <div><span><Box size={13} />최고 가치 자산</span><b>{topAsset ? money(amount(topAsset.appraisalValue)) : '—'}</b><small>{topAsset ? topAsset.name : '등록된 자산이 없습니다'}</small></div>
        </div>
      </section>
      <section className="sa-metrics" aria-label="상태별 자산 가치">
        {statuses.slice(1).map((item) => {
          const rows = inventory.filter((asset) => asset.status === item)
          const value = statusValue(item)
          const share = total ? Math.round(value / total * 100) : 0
          return <button key={item} className={`sa-metric ${statusClass(item)}`} onClick={() => openList(item)}><span className="sa-metric-label"><span className={`sa-dot ${statusClass(item)}`} />{item}<ArrowRight size={13} /></span><strong aria-label={money(value)}><span aria-hidden="true" data-asset-value={value}>{money(value)}</span></strong><span className="sa-metric-caption">{rows.length}건 · 전체 가치의 {share}%</span><span className="sa-metric-bar" aria-hidden="true"><span style={{ width: `${share}%` }} /></span></button>
        })}
      </section>
      <div className="sa-bottom-grid">
        <section className="sa-recent"><div className="sa-section-title"><h2>최근 입고</h2><button className="sa-text-button" onClick={() => openList('전체')}>전체 보기<ArrowRight size={12} /></button></div>
          <div className="sa-recent-share"><span className="sa-share-caption">최근 입고 {recent.length}건 카테고리 비중 · 평가 가치 기준</span><CategoryShare rows={recentCategoryRows} label="최근 입고 카테고리 비중" /></div>
          {recent.map((asset) => <button key={asset.code} onClick={() => openDetail(asset)}><span className="sa-thumbnail"><AssetImage asset={asset} /></span><span><b>{asset.name}</b><small>{rootCategory(asset)} · {asset.location} · {number(Number(asset.quantity))} {asset.unit}</small></span><span className="sa-recent-meta"><b>{money(amount(asset.appraisalValue))}</b><time>{asset.receivedAt.slice(5)}</time></span></button>)}</section>
        <section className="sa-categories"><div className="sa-section-title"><h2>자재 카테고리별 자산 비중</h2><span>{categoryRows.length}종 · 평가 가치 기준</span></div>
          <div className="sa-share-bar" role="img" aria-label={`카테고리별 자산 비중: ${categoryRows.map((row) => `${row.name} ${Math.round(row.share)}%`).join(', ')}`}>{categoryRows.map((row) => <span key={row.name} style={{ width: `${row.share}%`, background: row.color }} />)}</div>
          {categoryRows.map((row) => <div key={row.name} className="sa-category-row"><span className="sa-location-head"><span><Layers size={13} style={{ color: row.color }} />{row.name}</span><b>{money(row.value)}</b></span><span className="sa-location-bar" aria-hidden="true"><span style={{ width: `${row.share}%`, background: row.color }} /></span><small>{row.count}건 · 전체의 {Math.round(row.share)}%</small></div>)}
          {categoryRows.length === 0 && <p className="sa-share-empty">등록된 자산이 없습니다.</p>}
        </section>
        <section className="sa-todo" aria-label="확인이 필요한 항목"><div className="sa-section-title"><h2>확인이 필요한 항목</h2><span>{(feeSoon.length ? 1 : 0) + (pending.length ? 1 : 0) + (inspectionCount > 0 ? 1 : 0)}건</span></div>
          {feeSoon.length > 0 && <button className="is-warn" onClick={() => { openList('전체'); setSort('newest') }}><span className="sa-todo-icon warn"><Clock size={16} /></span><span><b>보관료 부과 임박 자산 {feeSoon.length}건</b><small>{feeSoon.map((asset) => asset.name).join(', ')} · 할인율 상향 프로모션을 검토해 주세요.</small></span><ArrowRight size={15} /></button>}
          {pending.length > 0 && <button onClick={() => openList('대기 중')}><span className="sa-todo-icon pending"><ClipboardCheck size={16} /></span><span><b>검수 대기 자산 {pending.length}건</b><small>입고 정보를 확인하고 다음 단계를 진행해 주세요.</small></span><ArrowRight size={15} /></button>}
          {inspectionCount > 0 && <button onClick={() => onInspectionView(true)}><span className="sa-todo-icon"><ClipboardCheck size={16} /></span><span><b>1차 검수 결과 도착 · 폐기 대상 포함</b><small>고객 확인 대기 {inspectionCount}건 · 예시</small></span><ArrowRight size={15} /></button>}
          {feeSoon.length === 0 && pending.length === 0 && inspectionCount === 0 && <p className="sa-todo-empty"><Check size={15} />모든 자산이 정상 처리되었습니다.</p>}
        </section>
      </div>
      <PageBanner label="MRS · Material Recycling Service" title="남은 자재의 가치, MRS에서 이어집니다" description="보관에서 재유통까지. MRS는 현장의 잉여 자재를 관리하고 필요한 수요처와 연결하는 건설자재 보관·거래 플랫폼입니다." action="MRS소개서 다운받기" href="/MRS-service-guide.txt" download="MRS-서비스소개서.txt" icon={<Leaf size={17} />} />
      </>}
      {assetListActive &&
      <section className="sa-inventory" aria-label="자산 목록">
        <form className="sa-detail-search" onSubmit={(event) => { event.preventDefault(); applySearch() }}>
          <div className="sa-detail-search-heading">
            <div><h2>상세 검색</h2><span>조건을 선택해 자산을 찾아보세요.</span></div>
            <button type="button" className="sa-filter-toggle" aria-expanded={filtersExpanded} aria-controls="sa-filter-panel" onClick={() => setFiltersExpanded((current) => { const next = !current; if (next) syncDraft(); return next })}><SlidersHorizontal size={14} />상세 필터{advancedFilterCount > 0 && <span className="sa-filter-count">{advancedFilterCount}</span>}<ChevronDown size={14} className="sa-chevron" /></button>
          </div>
          <div className="sa-detail-search-bar">
            <label className="sa-detail-keyword"><Search size={15} /><input aria-label="상세 검색어" placeholder="자산명, 코드, 브랜드 검색" value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} />{draftQuery && <button type="button" className="sa-icon sa-detail-keyword-clear" aria-label="검색어 지우기" onClick={() => setDraftQuery('')}><X size={13} /></button>}</label>
            <div className="sa-detail-search-buttons">
              <button type="button" className="sa-button" onClick={resetSearch}><RotateCcw size={13} />초기화</button>
              <button type="submit" className="sa-button sa-primary"><Search size={14} />검색</button>
            </div>
          </div>
          <div id="sa-filter-panel" className={`sa-filter-panel${filtersExpanded ? ' is-open' : ''}`} inert={!filtersExpanded}>
            <div className="sa-filter-panel-inner">
              <CategorySelect categories={materialCategories} value={draftCategory} onChange={setDraftCategory} />
              <div className="sa-filter-fields">
                <label><span>등급</span><select value={draftGrade} onChange={(event) => setDraftGrade(event.target.value)}>{['전체', 'S', 'A', 'B'].map((item) => <option key={item}>{item}</option>)}</select></label>
                <label><span>보관 위치</span><select value={draftLocation} onChange={(event) => setDraftLocation(event.target.value)}>{['전체 위치', ...new Set(inventory.map((asset) => asset.location))].map((item) => <option key={item}>{item}</option>)}</select></label>
                <label><span>입고 기간</span><div className="sa-date-range"><input aria-label="입고 시작일" type="date" value={draftReceivedFrom} onChange={(event) => setDraftReceivedFrom(event.target.value)} /><i>~</i><input aria-label="입고 종료일" type="date" value={draftReceivedTo} onChange={(event) => setDraftReceivedTo(event.target.value)} /></div></label>
                <label><span>보관 일수</span><div className="sa-day-range"><input aria-label="최소 보관 일수" type="number" min="0" placeholder="최소" value={draftStorageDaysFrom} onChange={(event) => setDraftStorageDaysFrom(event.target.value)} /><i>~</i><input aria-label="최대 보관 일수" type="number" min="0" placeholder="최대" value={draftStorageDaysTo} onChange={(event) => setDraftStorageDaysTo(event.target.value)} /><em>일</em></div></label>
              </div>
            </div>
          </div>
        </form>
        <div className="sa-asset-grid">
          <div className="sa-table-toolbar"><div className="sa-tabs" aria-label="자산 상태">{statuses.map((item) => <button key={item} aria-pressed={status === item} onClick={() => setStatus(item)}>{item}<span>{item === '전체' ? inventory.length : inventory.filter((asset) => asset.status === item).length}</span></button>)}</div><div className="sa-table-controls"><label className="sa-sort"><ArrowUpDown size={14} /><select aria-label="자산 정렬" value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">최근 입고순</option><option value="value">평가 가치순</option><option value="name">자산명순</option></select></label></div></div>
          {(query || status !== '전체' || location !== '전체 위치' || grade !== '전체' || category || receivedFrom || receivedTo || storageDaysFrom || storageDaysTo || selectedVisible.length > 0) && <div className="sa-results"><span>{selectedVisible.length > 0 ? `${selectedVisible.length}건 선택됨 · ${money(selectedVisible.reduce((sum, asset) => sum + amount(asset.appraisalValue), 0))}` : `${query ? `“${query}” · ` : ''}${visible.length}건의 자산`}</span>{selectedVisible.length > 0 ? <><div className="sa-bulk-actions" role="group" aria-label="선택 자산 마켓 등록"><button className="sa-button" disabled={!canRegisterMarket} onClick={registerSelectedMarket}><ShoppingCart size={15} />마켓에 등록하기</button></div><button className="sa-text-button" onClick={() => setSelected([])}>선택 해제</button></> : <button className="sa-text-button" onClick={resetSearch}>초기화<X size={13} /></button>}</div>}
          <div className="sa-table-scroll"><table className="sa-table"><thead><tr><th className="sa-check-cell"><input type="checkbox" aria-label="표시된 자산 모두 선택" checked={allSelected} ref={(element) => { if (element) element.indeterminate = selectedVisible.length > 0 && !allSelected }} onChange={() => setSelected((current) => allSelected ? current.filter((code) => !visible.some((asset) => asset.code === code)) : [...new Set([...current, ...visible.map((asset) => asset.code)])])} /></th><th>자산</th><th>상태</th><th>등급</th><th className="sa-numeric">재고 수량</th><th className="sa-numeric">평가 가치</th><th>입고일</th></tr></thead><tbody>{visible.map((asset) => <tr key={asset.code} className={selected.includes(asset.code) ? 'is-selected' : ''}><td className="sa-check-cell"><input type="checkbox" aria-label={`${asset.name} 선택`} checked={selected.includes(asset.code)} onChange={() => toggleSelection(asset.code)} /></td><td><button className="sa-asset-link" onClick={() => openDetail(asset)}><span className="sa-thumbnail"><AssetImage asset={asset} /></span><span><b>{asset.name}</b><small>{asset.code}</small></span></button></td><td><span className={`sa-badge ${statusClass(asset.status)}`}><span />{asset.status}</span></td><td><span className={`sa-grade grade-${asset.grade.toLowerCase()}`}>{asset.grade}</span></td><td className="sa-numeric">{number(Number(asset.quantity))}<span className="sa-unit"> {asset.unit}</span></td><td className="sa-numeric sa-value">{money(amount(asset.appraisalValue))}</td><td className="sa-date">{asset.receivedAt.slice(2)}</td></tr>)}</tbody></table></div>
          {visible.length === 0 && <div className="sa-empty"><Search size={26} /><h2>일치하는 자산이 없습니다</h2><button className="sa-button" onClick={resetSearch}>필터 초기화</button></div>}
          <div className="sa-table-footer"><span>총 {inventory.length}건 중 {visible.length}건 표시</span><span>평가 가치 합계 <b>{money(visible.reduce((sum, asset) => sum + amount(asset.appraisalValue), 0))}</b></span></div>
        </div>
      </section>
      }
      </>}
      </>}
      <footer className="sa-page-footer"><span><Leaf size={15} />자재의 다음 가치를 연결합니다.</span></footer>
      <details className="sa-photo-credits"><summary>참고 이미지 출처</summary><p>사진은 자재 종류를 보여주는 참고 이미지이며 실제 등록 자산 사진이 아닙니다.</p>{materialPhotos.map(([code, , author, license, file]) => <a key={code} href={`https://commons.wikimedia.org/wiki/File:${file}`} target="_blank" rel="noreferrer">{inventory.find((asset) => asset.code === code)?.name} · {author} · {license} (화면에 맞게 자름)</a>)}</details>
      {message && <div className="sa-notice" role="status"><Check size={17} /><span>{message}</span><button className="sa-icon" aria-label="알림 닫기" onClick={() => setMessage('')}><X size={16} /></button></div>}
    </main>
    <dialog ref={addDialog} className="sa-dialog" aria-label="신규 자산 등록"><form onSubmit={registerAsset}><div className="sa-dialog-heading"><h2>신규 자산 등록</h2><button type="button" className="sa-icon" aria-label="등록 닫기" onClick={() => addDialog.current?.close()}><X size={19} /></button></div><div className="sa-form-fields"><label className="sa-full-field">자산명<input name="name" required maxLength={100} placeholder="예: 재활용 H빔 A36" /></label><label>등급<select name="grade"><option>S</option><option>A</option><option>B</option></select></label><label>보관 위치<input name="location" required placeholder="예: B-12 창고" /></label><label>수량<input name="quantity" type="number" min="0.01" step="0.01" required /></label><label>단위<select name="unit">{['개', 'ton', 'm', 'm³', 'kg', '본'].map((unit) => <option key={unit}>{unit}</option>)}</select></label><label className="sa-full-field">평가 가치 (원)<input name="value" type="number" min="0" step="1" required /></label><label>브랜드<input name="brand" /></label><label>규격<input name="specification" /></label></div><p className="sa-form-note">등록한 자산은 메뉴 이동 시 유지되며 새로고침 시 초기화됩니다.</p><div className="sa-dialog-actions"><button type="button" className="sa-button" onClick={() => addDialog.current?.close()}>취소</button><button type="submit" className="sa-button sa-primary"><PackagePlus size={16} />자산 등록</button></div></form></dialog>
  </AdminShell>
}