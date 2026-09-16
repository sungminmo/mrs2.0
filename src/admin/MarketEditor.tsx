import { useState } from 'react'
import { Check, Save, X } from 'lucide-react'
import type { Campaign } from './adminData'
import type { MaterialCategory } from '../categories'
import CategorySelect from '../CategorySelect'
import { nextCode } from './adminInventory'
import { marketStatusOptions, validateCampaign, type MarketStatusTab } from './adminMarket'

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

export default function CampaignEditor({ campaign, campaigns, categories, cancelHref, onSave }: { campaign?: Campaign; campaigns: Campaign[]; categories: MaterialCategory[]; cancelHref: string; onSave: (campaign: Campaign) => void }) {
  const [category, setCategory] = useState(campaign?.category ?? '')
  const [error, setError] = useState('')
  const id = campaign?.id ?? nextCode('CAM-', campaigns, 3)
  return <div className="adm-editor"><form className="adm-edit-form" onSubmit={(event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const text = (key: string) => String(data.get(key) ?? '').trim()
    const next: Campaign = { id, name: text('name'), description: text('description'), category, enabled: data.has('enabled'), order: Number(text('order')), startsAt: `${text('startsAt')}:00+09:00`, endsAt: `${text('endsAt')}:00+09:00` }
    try { validateCampaign(next, categories, campaign); onSave(next) } catch (failure) { setError(failure instanceof Error ? failure.message : '기획전을 저장하지 못했습니다.') }
  }} onInput={() => setError('')}>
    <div className="adm-edit-fields">
      <label>기획전 번호<input value={id} readOnly /></label>
      <label>기획전 제목<input name="name" defaultValue={campaign?.name} required maxLength={120} /></label>
      <label>시작 일시 (KST, 포함)<input name="startsAt" type="datetime-local" defaultValue={kstInput(campaign?.startsAt)} required /></label>
      <label>종료 일시 (KST, 미포함)<input name="endsAt" type="datetime-local" defaultValue={kstInput(campaign?.endsAt)} required /></label>
      <label>노출 순서<input name="order" type="number" min={0} max={9999} step={1} defaultValue={campaign?.order ?? campaigns.length + 1} required /></label>
    </div>
    <div className="adm-campaign-category"><CategorySelect categories={categories} value={category} onChange={setCategory} /></div>
    <label className="adm-edit-memo">기획전 설명<textarea name="description" rows={4} defaultValue={campaign?.description} required maxLength={1000} /></label>
    <label className="adm-check"><input type="checkbox" name="enabled" defaultChecked={campaign?.enabled ?? false} />기획전 노출 사용</label>
    <div className="adm-edit-footer">{error && <p role="alert" className="adm-form-error">{error}</p>}<div className="adm-management-actions"><a className="adm-button" href={cancelHref}>취소</a><button className="adm-button adm-primary"><Save size={16} />기획전 임시 저장</button></div></div>
  </form></div>
}