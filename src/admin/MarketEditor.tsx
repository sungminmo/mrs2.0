import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, ImageOff, LoaderCircle, Save, Search, Trash2, X } from 'lucide-react'
import type { Campaign, CampaignProduct, Product } from './adminData'
import { adminAccountRequest } from '../adminAuthSession'
import { appraisalMoney } from '../appraisal'
import type { Pagination } from './AdminPagination'
import './CampaignEditor.css'
import { discountedPrice, marketStatusOptions, setProductDiscount, validateCampaign, type MarketStatusTab } from './adminMarket'

export function ProductDiscountEditor({ product, cancelHref, onSave }: { product: Product; cancelHref: string; onSave: (product: Product) => void }) {
  const [discountRate, setDiscountRate] = useState(product.discountRate)
  const [error, setError] = useState('')
  const preview = discountedPrice({ ...product, discountRate: Number.isFinite(discountRate) ? discountRate : 0 })
  return <div className="adm-editor"><form className="adm-edit-form" onSubmit={(event) => {
    event.preventDefault()
    try { onSave(setProductDiscount(product, discountRate)); setError('') } catch (failure) { setError(failure instanceof Error ? failure.message : '할인율을 저장하지 못했습니다.') }
  }}>
    <h2>상품 할인율</h2>
    <div className="adm-edit-fields">
      <label>상품번호<input value={product.id} readOnly /></label>
      <label>상품명<input value={product.name} readOnly /></label>
      <label>판매 단가<input value={product.price.toLocaleString('ko-KR')} readOnly /></label>
      <label>할인율 (%)<input type="number" min={0} max={100} step={1} value={discountRate} onChange={(event) => { setDiscountRate(event.target.valueAsNumber); setError('') }} required autoFocus /></label>
      <label>할인 적용 단가<input value={preview.toLocaleString('ko-KR')} readOnly /></label>
    </div>
    <p className="adm-note">판매대기 상태에서만 할인율을 설정할 수 있습니다. 0%는 할인 없음으로 처리합니다.</p>
    <div className="adm-edit-footer">{error && <p role="alert" className="adm-form-error">{error}</p>}<div className="adm-management-actions"><a className="adm-button" href={cancelHref}>취소</a><button className="adm-button adm-primary"><Save size={16} />할인율 저장</button></div></div>
  </form></div>
}

export function MarketStatusEditor({ tab, ids, currentStatus, onChange, bulk = false, onDone }: { tab: MarketStatusTab; ids: string[]; currentStatus?: string; onChange: (ids: string[], status: string) => void; bulk?: boolean; onDone?: () => void }) {
  const [target, setTarget] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const destination = target === '판매취소' ? '판매대기' : target
  function apply() {
    try {
      onChange(ids, target)
      setError('')
      setConfirming(false)
      setTarget('')
      onDone?.()
    } catch (failure) { setError(failure instanceof Error ? failure.message : '상태를 변경하지 못했습니다.'); setConfirming(false) }
  }
  return <section className="adm-market-status" aria-label={bulk ? '일괄 상태 변경' : '개별 상태 변경'}>
    <form onSubmit={(event) => { event.preventDefault(); if (bulk) setConfirming(true); else apply() }}>
      {bulk && <strong>{ids.length}건 선택</strong>}
      <label>{bulk ? '일괄 변경 상태' : '변경할 상태'}<select required value={target} disabled={confirming} onChange={(event) => { setTarget(event.target.value); setError('') }}><option value="">상태 선택</option>{marketStatusOptions[tab].map((status) => <option key={status} value={status}>{status === '판매취소' ? '판매취소 (판매대기로 전환)' : status}</option>)}</select></label>
      <button className="adm-button adm-primary" disabled={!ids.length || !target || destination === currentStatus && target !== '판매취소' || confirming}><Check size={16} />{bulk ? '선택 상태 변경' : '상태 변경'}</button>
    </form>
    {confirming && <div className="adm-status-confirm" role="group" aria-label="일괄 변경 확인"><span>선택한 {ids.length}건을 {destination} 상태로 변경하시겠습니까?</span><button type="button" className="adm-button adm-primary" onClick={apply}><Check size={16} />변경 확정</button><button type="button" className="adm-button" onClick={() => setConfirming(false)}><X size={16} />취소</button></div>}
    {error && <p role="alert" className="adm-form-error">{error}</p>}
  </section>
}

const kstInput = (value?: string) => value ? new Date(Date.parse(value) + 9 * 60 * 60 * 1000).toISOString().slice(0, 16) : ''

export default function CampaignEditor({ campaign, cancelHref, onSave }: { campaign?: Campaign; cancelHref: string; onSave: (campaign: Campaign) => void }) {
  const [selected, setSelected] = useState<CampaignProduct[]>(campaign?.products ?? [])
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState({ q: '', status: '', page: 1 })
  const [result, setResult] = useState<{ products: CampaignProduct[]; pagination: Pagination } | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchError, setSearchError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submitting = useRef(false)
  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ q: query.q, page: String(query.page), rows: '20' })
    if (query.status) params.set('status', query.status)
    adminAccountRequest<{ products: CampaignProduct[]; pagination: Pagination }>(`/api/admin/campaign-products?${params}`, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) { setResult(data); setSearchError('') } }).catch(failure => { if (!controller.signal.aborted) setSearchError(failure instanceof Error ? failure.message : '상품을 불러오지 못했습니다.') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [query])
  const changeQuery = (next: typeof query) => { setLoading(true); setResult(null); setQuery(next) }
  const toggle = (product: CampaignProduct) => { setError(''); setSelected(current => current.some(entry => entry.id === product.id) ? current.filter(entry => entry.id !== product.id) : current.length < 100 ? [...current, product] : current) }
  const move = (index: number, direction: number) => setSelected(current => { const next = [...current]; const target = index + direction; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next })
  const labels = { DRAFT: '판매대기', AVAILABLE: '판매 중', OUT_OF_STOCK: '재고 없음' }
  const allSelected = !!result?.products.length && result.products.every(product => selected.some(entry => entry.id === product.id))
  return <div className="adm-editor campaign-editor"><form className="adm-edit-form" onSubmit={async (event) => {
    event.preventDefault()
    if (submitting.current) return
    const data = new FormData(event.currentTarget)
    const text = (key: string) => String(data.get(key) ?? '').trim()
    const next: Campaign = { id: campaign?.id ?? '', productIds: selected.map(product => product.id), name: text('name'), description: text('description'), enabled: data.has('enabled'), order: Number(text('order')), startsAt: `${text('startsAt')}:00+09:00`, endsAt: `${text('endsAt')}:00+09:00` }
    try {
      validateCampaign(next)
      submitting.current = true; setSaving(true); setError('')
      const { id: _id, ...fields } = next
      const saved = await adminAccountRequest<{ campaign: Campaign }>(campaign ? `/api/admin/campaigns/${encodeURIComponent(campaign.id)}` : '/api/admin/campaigns', { method: campaign ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...fields, ...(campaign ? { version: campaign.version } : {}), reason: text('reason') }) })
      onSave(saved.campaign)
    } catch (failure) { setError(failure instanceof Error ? failure.message : '기획전을 저장하지 못했습니다.') } finally { submitting.current = false; setSaving(false) }
  }} onInput={() => setError('')}>
    <fieldset disabled={saving} className="campaign-fields">
    <div className="adm-edit-fields">
      <label>기획전 번호<input value={campaign?.id ?? '저장 시 자동 생성'} readOnly /></label>
      <label>기획전 제목<input name="name" defaultValue={campaign?.name} required maxLength={120} /></label>
      <label>시작 일시 (KST, 포함)<input name="startsAt" type="datetime-local" defaultValue={kstInput(campaign?.startsAt)} required /></label>
      <label>종료 일시 (KST, 미포함)<input name="endsAt" type="datetime-local" defaultValue={kstInput(campaign?.endsAt)} required /></label>
      <label>노출 순서<input name="order" type="number" min={0} max={9999} step={1} defaultValue={campaign?.order ?? 0} required /></label>
    </div>
    <label className="adm-edit-memo">기획전 설명<textarea name="description" rows={4} defaultValue={campaign?.description} required maxLength={1000} /></label>
    <section className="campaign-composition" aria-label="기획전 상품 편성">
      <div className="adm-list-heading"><h2>편성 상품 <span aria-live="polite">{selected.length} / 100종</span></h2><span>현재 노출 가능 {selected.filter(product => product.visible).length}종</span></div>
      {!selected.length ? <p className="adm-empty">편성된 상품이 없습니다.</p> : <ol className="campaign-selected">{selected.map((product, index) => <li key={product.id}><span className="campaign-rank">{index + 1}</span>{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <ImageOff size={24} />}<div className="campaign-product-name"><strong>{product.name}</strong><small>{product.id} · {labels[product.status]} · {product.visible ? '노출 가능' : '현재 미노출'}</small></div><span className="campaign-price">{appraisalMoney(product.unitPrice)} / {product.unit}</span><div className="campaign-row-actions"><button type="button" className="adm-icon" title={`${product.name} 위로 이동`} aria-label={`${product.name} 위로 이동`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} /></button><button type="button" className="adm-icon" title={`${product.name} 아래로 이동`} aria-label={`${product.name} 아래로 이동`} disabled={index === selected.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} /></button><button type="button" className="adm-icon" title={`${product.name} 편성 제거`} aria-label={`${product.name} 편성 제거`} onClick={() => toggle(product)}><Trash2 size={16} /></button></div></li>)}</ol>}
      <div className="campaign-search"><label>상품 검색<input value={search} maxLength={160} placeholder="상품번호 · 상품명 · 규격" onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); changeQuery({ ...query, q: search, page: 1 }) } }} /></label><label>판매 상태<select value={query.status} onChange={event => changeQuery({ ...query, status: event.target.value, page: 1 })}><option value="">전체</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button type="button" className="adm-button" onClick={() => changeQuery({ ...query, q: search, page: 1 })}><Search size={16} />검색</button></div>
      {searchError && <p className="adm-form-error" role="alert">{searchError}</p>}
      {loading ? <p role="status">상품을 불러오는 중...</p> : result && <>
        <div className="adm-table-scroll" role="region" aria-label="편성 상품 검색 결과" tabIndex={0}><table><thead><tr><th><input type="checkbox" aria-label="현재 페이지 상품 전체 선택" checked={allSelected} disabled={!result.products.length || !allSelected && selected.length + result.products.filter(product => !selected.some(entry => entry.id === product.id)).length > 100} onChange={() => setSelected(current => allSelected ? current.filter(entry => !result.products.some(product => product.id === entry.id)) : [...current, ...result.products.filter(product => !current.some(entry => entry.id === product.id))])} /></th><th>상품</th><th>등급</th><th>판매 단가</th><th>가용 수량</th><th>판매 상태</th><th>고객 노출</th></tr></thead><tbody>{result.products.map(product => { const checked = selected.some(entry => entry.id === product.id); return <tr key={product.id}><td><input type="checkbox" aria-label={`${product.name} 편성 선택`} checked={checked} disabled={!checked && selected.length >= 100} onChange={() => toggle(product)} /></td><td><strong>{product.name}</strong><small>{product.id}</small></td><td>{product.grade ?? '-'}</td><td>{appraisalMoney(product.unitPrice)} / {product.unit}</td><td>{product.quantity} {product.unit}</td><td>{labels[product.status]}</td><td>{product.visible ? '노출 가능' : '현재 미노출'}</td></tr> })}</tbody></table></div>
        {!result.products.length && <p className="adm-empty">검색 결과가 없습니다.</p>}
        <div className="campaign-pagination"><span>{result.pagination.total}건 · {query.page} / {Math.max(1, Math.ceil(result.pagination.total / result.pagination.rows))}</span><div className="campaign-row-actions">
          <button className="adm-icon" type="button" title="이전 상품 페이지" aria-label="이전 상품 페이지" disabled={query.page <= 1} onClick={() => changeQuery({ ...query, page: query.page - 1 })}><ChevronLeft size={16} /></button>
          <button className="adm-icon" type="button" title="다음 상품 페이지" aria-label="다음 상품 페이지" disabled={query.page * result.pagination.rows >= result.pagination.total} onClick={() => changeQuery({ ...query, page: query.page + 1 })}><ChevronRight size={16} /></button>
        </div></div>
      </>}
    </section>
    <label className="adm-check"><input type="checkbox" name="enabled" defaultChecked={campaign?.enabled ?? false} />기획전 노출 사용</label>
    <label className="adm-edit-memo">변경 사유<textarea name="reason" rows={2} required maxLength={500} /></label>
    </fieldset>
    <div className="adm-edit-footer">{error && <p role="alert" className="adm-form-error">{error}</p>}<div className="adm-management-actions">{!saving && <a className="adm-button" href={cancelHref}>취소</a>}<button disabled={saving} className="adm-button adm-primary">{saving ? <LoaderCircle className="adm-spinner" size={16} /> : <Save size={16} />}{saving ? '저장 중...' : '기획전 저장'}</button></div></div>
  </form></div>
}