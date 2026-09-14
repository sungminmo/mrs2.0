import { useLayoutEffect, useRef, useState } from 'react'
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from 'react'
import { ArrowDownToLine, ArrowRight, ArrowUpDown, Box, Check, ChevronDown, ClipboardCheck, Leaf, MapPin, PackagePlus, Search, ShoppingCart, SlidersHorizontal, X } from 'lucide-react'
import type { Asset } from './App'
import './AdminAssets.css'
import AdminShell from './AdminShell'
import ShopifyAssetDetail from './ShopifyAssetDetail'
import MarketRegistrationConfirm from './MarketRegistrationConfirm'
import { materialPhotos } from './assetPhotos'

const amount = (value: string) => Number(value.replaceAll(',', ''))
const number = (value: number) => value.toLocaleString('ko-KR')
const money = (value: number) => `₩${number(value)}`
const statuses = ['전체', '판매 중', '보관 중', '대기 중'] as const
const statusClass = (status: string) => status === '판매 중' ? 'selling' : status === '대기 중' ? 'pending' : 'stored'

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
    reveal('.sa-overview-heading, .sa-metrics', 0)
    reveal('.sa-distribution', 500)
    reveal('.sa-stacked-bar', 500, 400, 0, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }])
    reveal('.sa-recent .sa-section-title', 950)
    reveal('.sa-recent > button', 1030, 260, 60)
    reveal('.sa-attention', 1450, 240)
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

export default function AdminAssets({ assets: inventory, onAssetsChange: setInventory, navigation, onValuesObserved }: { assets: Asset[]; onAssetsChange: Dispatch<SetStateAction<Asset[]>>; navigation: ReactNode; onValuesObserved: ObserveAssetValues }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<string>('전체')
  const [location, setLocation] = useState('전체 위치')
  const [sort, setSort] = useState('newest')
  const [showFilters, setShowFilters] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [detail, setDetail] = useState<Asset | null>(null)
  const overview = useAssetValueMotion(inventory, detail !== null, onValuesObserved)
  const [message, setMessage] = useState('')
  const [marketConfirmOpen, setMarketConfirmOpen] = useState(false)
  const addDialog = useRef<HTMLDialogElement>(null)
  const total = inventory.reduce((sum, asset) => sum + amount(asset.appraisalValue), 0)
  const pending = inventory.filter((asset) => asset.status === '대기 중')
  const visible = inventory.filter((asset) =>
    (status === '전체' || asset.status === status) &&
    (location === '전체 위치' || asset.location === location) &&
    `${asset.name} ${asset.code} ${asset.brand}`.toLowerCase().includes(query.trim().toLowerCase()),
  ).sort((first, second) => sort === 'value' ? amount(second.appraisalValue) - amount(first.appraisalValue) : sort === 'name' ? first.name.localeCompare(second.name, 'ko') : second.receivedAt.localeCompare(first.receivedAt))
  const selectedVisible = visible.filter((asset) => selected.includes(asset.code))
  const allSelected = visible.length > 0 && selectedVisible.length === visible.length
  const toggleSelection = (code: string) => setSelected((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code])
  const clearFilters = () => { setQuery(''); setStatus('전체'); setLocation('전체 위치') }
  const openDetail = (asset: Asset) => setDetail(asset)

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
      code: `EMX-NEW-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, name,
      grade: String(data.get('grade')), quantity: String(data.get('quantity')), unit: String(data.get('unit')),
      location: storage, appraisalValue: number(Number(data.get('value'))), receivedAt, storageDays: '0일',
      status: '대기 중', salePrice: '0',
      brand: String(data.get('brand')).trim() || '미등록', specification: String(data.get('specification')).trim() || '미등록',
      shipmentUnit: '미등록', note: '신규 입고 자산입니다. 검수 후 보관 상태를 변경해 주세요.', image: '',
    }
    setInventory((current) => [asset, ...current])
    clearFilters()
    setSort('newest')
    form.reset()
    addDialog.current?.close()
    setMessage(`${name}을 등록했습니다. 변경은 새로고침 시 초기화됩니다.`)
  }

  const detailIndex = inventory.findIndex((asset) => asset.code === detail?.code)
  const search = <label className="sa-global-search"><Search size={18} /><input aria-label="자산 검색" placeholder="자산명, 코드, 브랜드 검색" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button className="sa-icon" aria-label="검색 지우기" onClick={() => setQuery('')}><X size={15} /></button>}</label>
  return <AdminShell navigation={navigation} search={detail ? undefined : search}>
    {marketConfirmOpen && <MarketRegistrationConfirm subject={`선택한 자산 ${selectedVisible.length}건`} onCancel={() => setMarketConfirmOpen(false)} onConfirm={confirmSelectedMarket} />}
    <main ref={overview} className="sa-main sa-assets-main">
      {detail ? <ShopifyAssetDetail key={detail.code} asset={inventory[detailIndex]} previous={inventory[detailIndex - 1]} next={inventory[detailIndex + 1]} onBack={() => setDetail(null)} onNavigate={setDetail} onSave={(updated) => setInventory((current) => current.map((asset) => asset.code === updated.code ? updated : asset))} /> : <>
      <div className="sa-heading"><div><div className="sa-breadcrumb">워크스페이스 <span>/</span> 자산</div><h1>내 자산 <span>{inventory.length}</span></h1></div><div className="sa-heading-actions"><button className="sa-button" onClick={exportAssets} disabled={!visible.length}><ArrowDownToLine size={15} />내보내기</button><button className="sa-button sa-primary" onClick={() => addDialog.current?.showModal()}><PackagePlus size={16} />자산 등록</button></div></div>
      <div className="sa-overview-heading"><span><span className="sa-live-dot" />전체 자산 현황</span><span>입고 자산 기준 · KRW</span></div>
      <section className="sa-metrics" aria-label="자산 요약">
        {statuses.map((item) => {
          const rows = item === '전체' ? inventory : inventory.filter((asset) => asset.status === item)
          const value = rows.reduce((sum, asset) => sum + amount(asset.appraisalValue), 0)
          return <button key={item} className={`sa-metric ${status === item ? 'is-active' : ''}`} onClick={() => setStatus(item)} aria-pressed={status === item}><span className="sa-metric-label">{item === '전체' ? '총 자산 가치' : item}<ChevronDown size={13} /></span><strong aria-label={money(value)}><span aria-hidden="true" data-asset-value={value}>{money(value)}</span></strong><span className="sa-metric-caption"><span className={`sa-dot ${statusClass(item)}`} />{item === '전체' ? `입고 자산 ${rows.length}건` : `${rows.length}건 · 전체 가치의 ${total ? Math.round(value / total * 100) : 0}%`}</span></button>
        })}
      </section>
      <div className="sa-bottom-grid">
        <section className="sa-distribution"><div className="sa-section-title"><h2>자산 가치 구성</h2><span>상태별 평가 가치</span></div><div className="sa-stacked-bar" role="img" aria-label={statuses.slice(1).map((item) => `${item} ${money(inventory.filter((asset) => asset.status === item).reduce((sum, asset) => sum + amount(asset.appraisalValue), 0))}`).join(', ')}>{statuses.slice(1).map((item) => <span key={item} className={statusClass(item)} style={{ width: `${total ? inventory.filter((asset) => asset.status === item).reduce((sum, asset) => sum + amount(asset.appraisalValue), 0) / total * 100 : 0}%` }} />)}</div><div className="sa-distribution-legend">{statuses.slice(1).map((item) => <div key={item}><span><i className={`sa-dot ${statusClass(item)}`} />{item}</span><b>{money(inventory.filter((asset) => asset.status === item).reduce((sum, asset) => sum + amount(asset.appraisalValue), 0))}</b></div>)}</div></section>
        <section className="sa-recent"><div className="sa-section-title"><h2>최근 입고</h2><span>최근 3건</span></div>{[...inventory].sort((first, second) => second.receivedAt.localeCompare(first.receivedAt)).slice(0, 3).map((asset) => <button key={asset.code} onClick={() => openDetail(asset)}><span className="sa-recent-icon"><PackagePlus size={16} /></span><span><b>{asset.name}</b><small>{asset.location} · {asset.quantity} {asset.unit}</small></span><time>{asset.receivedAt.slice(5)}</time></button>)}</section>
      </div>
      {pending.length > 0 && <div className="sa-attention" aria-label="검수 알림"><span className="sa-attention-icon"><ClipboardCheck size={19} /></span><div><b>검수 대기 자산 {pending.length}건</b><span>입고 정보를 확인하고 다음 단계를 진행해 주세요.</span></div><button onClick={() => { clearFilters(); setStatus('대기 중') }}>자산 확인<ArrowRight size={15} /></button></div>}
      <section className="sa-inventory" aria-label="자산 목록">
        <div className="sa-table-toolbar"><div className="sa-tabs" aria-label="자산 상태">{statuses.map((item) => <button key={item} aria-pressed={status === item} onClick={() => setStatus(item)}>{item}<span>{item === '전체' ? inventory.length : inventory.filter((asset) => asset.status === item).length}</span></button>)}</div><div className="sa-table-controls"><button className={`sa-icon ${showFilters ? 'is-active' : ''}`} title="보관 위치 필터" aria-label="보관 위치 필터" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}><SlidersHorizontal size={16} /></button><label className="sa-sort"><ArrowUpDown size={14} /><select aria-label="자산 정렬" value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">최근 입고순</option><option value="value">평가 가치순</option><option value="name">자산명순</option></select></label></div></div>
        {showFilters && <div className="sa-filter-row"><MapPin size={15} /><label>보관 위치<select aria-label="보관 위치 필터 선택" value={location} onChange={(event) => setLocation(event.target.value)}>{['전체 위치', ...new Set(inventory.map((asset) => asset.location))].map((item) => <option key={item}>{item}</option>)}</select></label><button className="sa-text-button" onClick={clearFilters}>필터 초기화</button></div>}
        {(query || location !== '전체 위치' || selectedVisible.length > 0) && <div className="sa-results"><span>{selectedVisible.length > 0 ? `${selectedVisible.length}건 선택됨 · ${money(selectedVisible.reduce((sum, asset) => sum + amount(asset.appraisalValue), 0))}` : `${query ? `“${query}” · ` : ''}${visible.length}건의 자산`}</span>{selectedVisible.length > 0 ? <><div className="sa-bulk-actions" role="group" aria-label="선택 자산 마켓 등록"><button className="sa-button" disabled={!canRegisterMarket} onClick={registerSelectedMarket}><ShoppingCart size={15} />마켓에 등록하기</button></div><button className="sa-text-button" onClick={() => setSelected([])}>선택 해제</button></> : <button className="sa-text-button" onClick={clearFilters}>초기화<X size={13} /></button>}</div>}
        <div className="sa-table-scroll"><table className="sa-table"><thead><tr><th className="sa-check-cell"><input type="checkbox" aria-label="표시된 자산 모두 선택" checked={allSelected} ref={(element) => { if (element) element.indeterminate = selectedVisible.length > 0 && !allSelected }} onChange={() => setSelected((current) => allSelected ? current.filter((code) => !visible.some((asset) => asset.code === code)) : [...new Set([...current, ...visible.map((asset) => asset.code)])])} /></th><th>자산</th><th>상태</th><th>등급</th><th className="sa-numeric">재고 수량</th><th className="sa-numeric">평가 가치</th><th>입고일</th></tr></thead><tbody>{visible.map((asset) => <tr key={asset.code} className={selected.includes(asset.code) ? 'is-selected' : ''}><td className="sa-check-cell"><input type="checkbox" aria-label={`${asset.name} 선택`} checked={selected.includes(asset.code)} onChange={() => toggleSelection(asset.code)} /></td><td><button className="sa-asset-link" onClick={() => openDetail(asset)}><span className="sa-thumbnail"><AssetImage asset={asset} /></span><span><b>{asset.name}</b><small>{asset.code}</small></span></button></td><td><span className={`sa-badge ${statusClass(asset.status)}`}><span />{asset.status}</span></td><td><span className={`sa-grade grade-${asset.grade.toLowerCase()}`}>{asset.grade}</span></td><td className="sa-numeric">{number(Number(asset.quantity))}<span className="sa-unit"> {asset.unit}</span></td><td className="sa-numeric sa-value">{money(amount(asset.appraisalValue))}</td><td className="sa-date">{asset.receivedAt.slice(2)}</td></tr>)}</tbody></table></div>
        {visible.length === 0 && <div className="sa-empty"><Search size={26} /><h2>일치하는 자산이 없습니다</h2><button className="sa-button" onClick={clearFilters}>필터 초기화</button></div>}
        <div className="sa-table-footer"><span>총 {inventory.length}건 중 {visible.length}건 표시</span><span>평가 가치 합계 <b>{money(visible.reduce((sum, asset) => sum + amount(asset.appraisalValue), 0))}</b></span></div>
      </section>
      </>}
      <footer className="sa-page-footer"><span><Leaf size={15} />자재의 다음 가치를 연결합니다.</span></footer>
      <details className="sa-photo-credits"><summary>참고 이미지 출처</summary><p>사진은 자재 종류를 보여주는 참고 이미지이며 실제 등록 자산 사진이 아닙니다.</p>{materialPhotos.map(([code, , author, license, file]) => <a key={code} href={`https://commons.wikimedia.org/wiki/File:${file}`} target="_blank" rel="noreferrer">{inventory.find((asset) => asset.code === code)?.name} · {author} · {license} (화면에 맞게 자름)</a>)}</details>
      {message && <div className="sa-notice" role="status"><Check size={17} /><span>{message}</span><button className="sa-icon" aria-label="알림 닫기" onClick={() => setMessage('')}><X size={16} /></button></div>}
    </main>
    <dialog ref={addDialog} className="sa-dialog" aria-label="신규 자산 등록"><form onSubmit={registerAsset}><div className="sa-dialog-heading"><h2>신규 자산 등록</h2><button type="button" className="sa-icon" aria-label="등록 닫기" onClick={() => addDialog.current?.close()}><X size={19} /></button></div><div className="sa-form-fields"><label className="sa-full-field">자산명<input name="name" required maxLength={100} placeholder="예: 재활용 H빔 A36" /></label><label>등급<select name="grade"><option>S</option><option>A</option><option>B</option></select></label><label>보관 위치<input name="location" required placeholder="예: B-12 창고" /></label><label>수량<input name="quantity" type="number" min="0.01" step="0.01" required /></label><label>단위<select name="unit">{['개', 'ton', 'm', 'm³', 'kg', '본'].map((unit) => <option key={unit}>{unit}</option>)}</select></label><label className="sa-full-field">평가 가치 (원)<input name="value" type="number" min="0" step="1" required /></label><label>브랜드<input name="brand" /></label><label>규격<input name="specification" /></label></div><p className="sa-form-note">등록한 자산은 메뉴 이동 시 유지되며 새로고침 시 초기화됩니다.</p><div className="sa-dialog-actions"><button type="button" className="sa-button" onClick={() => addDialog.current?.close()}>취소</button><button type="submit" className="sa-button sa-primary"><PackagePlus size={16} />자산 등록</button></div></form></dialog>
  </AdminShell>
}