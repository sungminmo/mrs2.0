import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, ClipboardCheck, Info, X } from 'lucide-react'
import { requestAssetSale, submitAssetSales, type SaleSubmissionResult } from './saleRequests'
import './SaleRegistration.css'

type SaleAsset = { name: string; grade: string; quantity: string; unit: string; salePrice: string }
const money = (value: number) => `₩${value.toLocaleString('ko-KR')}`
const gradeGuidance = [
  ['S', '사용 흔적이 적고 상태가 우수한 자재입니다. 규격과 품질 확인 후 판매 가격을 산정합니다.'],
  ['A', '재사용 가능한 양호한 자재입니다. 사용 흔적과 보수 필요 여부가 가격에 반영됩니다.'],
  ['B', '사용 흔적이나 일부 손상이 있는 자재입니다. 보수 비용과 활용 범위를 고려해 가격을 조정합니다.'],
]

type BatchSaleAsset = { id: string; name: string; grade: string; quantity: string; unit: string }

export function BatchSaleRegistration({ assets, accessToken, onClose, onViewHistory }: { assets: BatchSaleAsset[]; accessToken: string; onClose: (refresh: boolean) => void; onViewHistory: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const mounted = useRef(false)
  const working = useRef(false)
  const [attempted, setAttempted] = useState(false)
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [results, setResults] = useState<Record<string, SaleSubmissionResult>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const remaining = assets.filter(asset => !results[asset.id] || results[asset.id].state === 'failed')
  const succeeded = assets.filter(asset => results[asset.id]?.state === 'success').length
  const unresolved = assets.filter(asset => ['blocked', 'unknown'].includes(results[asset.id]?.state ?? '')).length
  const total = assets.reduce((sum, asset) => { const price = Number(prices[asset.id]); return sum + (Number.isSafeInteger(price) && price > 0 && price <= 1e12 ? price : 0) }, 0)
  useEffect(() => {
    mounted.current = true
    const element = dialog.current
    element?.showModal()
    element?.querySelector<HTMLInputElement>('input')?.focus()
    return () => { mounted.current = false; element?.close() }
  }, [])
  useEffect(() => {
    if (!busy) return
    const preventLeave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    const preventSignout = (event: Event) => event.preventDefault()
    window.addEventListener('beforeunload', preventLeave)
    window.addEventListener('mrs-before-signout', preventSignout)
    return () => { window.removeEventListener('beforeunload', preventLeave); window.removeEventListener('mrs-before-signout', preventSignout) }
  }, [busy])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (working.current || !remaining.length) return
    const invalid: Record<string, string> = {}
    for (const asset of remaining) {
      const value = Number(prices[asset.id])
      if (!prices[asset.id]?.trim() || !Number.isSafeInteger(value) || value < 1 || value > 1e12) invalid[asset.id] = '1원 이상 1조원 이하의 정수로 입력해 주세요.'
    }
    setErrors(invalid)
    setError('')
    if (Object.keys(invalid).length) { dialog.current?.querySelector<HTMLInputElement>(`#batch-sale-price-${Object.keys(invalid)[0]}`)?.focus(); return }
    working.current = true
    setAttempted(true)
    setBusy(true)
    try {
      await submitAssetSales(remaining.map(asset => ({ assetId: asset.id, expectedQuantity: asset.quantity, desiredAmount: Number(prices[asset.id]) })), accessToken, result => setResults(previous => ({ ...previous, [result.assetId]: result })), () => !mounted.current, async (input, token) => { setActiveId(input.assetId); return requestAssetSale(input, token) })
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : '판매 요청에 실패했습니다.')
    } finally {
      working.current = false
      if (mounted.current) { setBusy(false); setActiveId(null) }
    }
  }

  return <dialog ref={dialog} className="sale-registration sr-batch" aria-labelledby="batch-sale-title" onCancel={event => { if (working.current) event.preventDefault(); else onClose(attempted) }}>
    <div className="sr-heading"><h2 id="batch-sale-title">선택 자산 판매 요청 <span>{assets.length}건</span></h2><button type="button" className="sr-icon" aria-label="선택 자산 판매 요청 닫기" disabled={busy} onClick={() => onClose(attempted)}><X size={18} /></button></div>
    <form onSubmit={submit} noValidate>
      <div className="sr-body">
        <div className="sr-batch-summary" role="status">{busy ? `${succeeded}건 접수 · 요청 중` : attempted ? `${succeeded}건 접수 완료 · ${remaining.length}건 미접수${unresolved ? ` · ${unresolved}건 확인 필요` : ''}` : `${assets.length}개 자산의 전체 수량을 판매 요청합니다.`}<span>입력 희망금액 합계 <b>{money(total)}</b></span></div>
        <div className="sr-batch-items">{assets.map((asset, index) => {
          const result = results[asset.id]
          const locked = busy || !!result && result.state !== 'failed'
          const inputId = `batch-sale-price-${asset.id}`
          const messageId = `${inputId}-message`
          return <section key={asset.id} className="sr-batch-item" aria-label={`${asset.name} 판매 요청`}>
            <div className="sr-batch-asset"><span className="sr-grade">{asset.grade}등급</span><h3>{asset.name}</h3><small>{asset.id} · 전체 수량 {asset.quantity} {asset.unit}</small></div>
            <div className="sr-batch-price"><label className="sr-label" htmlFor={inputId}>희망금액 (전체 수량)</label><div className={`sr-price-input${errors[asset.id] ? ' has-error' : ''}`}><input id={inputId} type="number" inputMode="numeric" autoFocus={index === 0} min={1} max={1e12} step={1} required disabled={locked} value={prices[asset.id] ?? ''} aria-invalid={!!errors[asset.id]} aria-describedby={errors[asset.id] || result ? messageId : undefined} onChange={event => { setPrices(previous => ({ ...previous, [asset.id]: event.target.value })); setErrors(previous => ({ ...previous, [asset.id]: '' })) }} /><span>원</span></div></div>
            {(errors[asset.id] || result || activeId === asset.id) && <p id={messageId} className={`sr-batch-result ${result?.state ?? ''}`} role={errors[asset.id] ? 'alert' : 'status'}>{errors[asset.id] || (activeId === asset.id && busy ? '요청 중...' : result?.message)}{result?.requestId && <small>요청번호 {result.requestId}</small>}</p>}
          </section>
        })}</div>
        <div className="sr-review-note"><ClipboardCheck size={18} /><p>자산별 전체 수량의 희망금액입니다. 요청은 각각 접수되며 일부만 성공할 수 있습니다. 접수만으로 판매가 시작되거나 재고가 차감되지는 않습니다. 희망금액은 정산액이 아닙니다.</p></div>
        {unresolved > 0 && <p className="sr-error" role="alert">확인이 필요한 자산은 요청 내역과 현재 수량을 확인해 주세요. 접수 여부가 불명확한 요청은 다시 전송하지 않습니다.</p>}
        {error && <p className="sr-error" role="alert">{error}</p>}
      </div>
      <div className="sr-actions">{attempted && <button type="button" className="sr-button" disabled={busy} onClick={onViewHistory}><ClipboardCheck size={15} />판매 요청 내역 보기</button>}<button type="button" className="sr-button" disabled={busy} onClick={() => onClose(attempted)}>{attempted ? '닫기' : '취소'}</button>{remaining.length > 0 && <button type="submit" className="sr-button sr-primary" disabled={busy}><ClipboardCheck size={15} />{busy ? '요청 중...' : attempted ? `미접수 ${remaining.length}건 재시도` : `${remaining.length}건 판매 요청`}</button>}</div>
    </form>
  </dialog>
}

export default function SaleRegistration({ asset, onClose, onRegister, persistent = false }: { asset: SaleAsset; onClose: () => void; onRegister: (price: string) => void | Promise<void>; persistent?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [price, setPrice] = useState('')
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(false)
  const [busy, setBusy] = useState(false)
  const submitted = useRef(false)
  const expected = Number(asset.salePrice.replaceAll(',', ''))
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = Number(price)
    if (!price.trim() || !Number.isSafeInteger(value) || value <= 0 || value > 1e12) {
      setError('희망가격을 1원 이상 1조원 이하의 정수로 입력해 주세요.')
      return
    }
    if (submitted.current) return
    submitted.current = true
    setBusy(true)
    try { await onRegister(value.toLocaleString('ko-KR')); setComplete(true) }
    catch (failure) { setError(failure instanceof Error ? failure.message : '판매 요청에 실패했습니다.'); submitted.current = false }
    finally { setBusy(false) }
  }

  return <dialog ref={dialog} className="sale-registration" aria-labelledby="sale-title" onCancel={(event) => { if (busy) event.preventDefault(); else onClose() }}>
    <div className="sr-heading"><h2 id="sale-title">{complete ? '판매 등록 요청 완료' : '마켓 판매 등록'}</h2><button type="button" className="sr-icon" aria-label="판매 등록 닫기" disabled={busy} onClick={onClose}><X size={18} /></button></div>
    {complete ? <><div className="sr-success" role="status"><span className="sr-success-icon"><Check size={25} /></span><h3>판매 등록 요청이 접수되었습니다.</h3><p><b>{asset.name}</b>{persistent ? '의 판매 요청을 관리자가 확인합니다.' : '의 판매를 위한 검수 작업을 진행합니다.'}<br />{persistent ? '상세 검수 후 판매 승인 여부를 결정합니다.' : '검수 후 관리자가 승인하면 판매 중 상태로 전환되어 마켓에 등록됩니다.'}</p><dl><div><dt>희망가격</dt><dd>{money(Number(price))}</dd></div><div><dt>진행 상태</dt><dd><span className="sr-review"><ClipboardCheck size={14} />검수 대기</span></dd></div></dl>{!persistent && <p className="sr-disclaimer">현재는 시제품으로 실제 검수나 마켓 등록은 진행되지 않습니다. 변경은 새로고침 시 초기화됩니다.</p>}</div><div className="sr-actions"><button className="sr-button sr-primary" onClick={onClose}>확인</button></div></> : <form onSubmit={submit}>
      <div className="sr-body"><div className="sr-asset"><span className="sr-grade">{asset.grade}등급</span><h3>{asset.name}</h3><p>등록 수량 {asset.quantity} {asset.unit} · 전체 수량 기준 가격</p></div>
        <label className="sr-label" htmlFor="sr-price">희망가격 <span>필수</span></label><div className={`sr-price-input ${error ? 'has-error' : ''}`}><input autoFocus id="sr-price" type="number" min="1" step="1" max={1e12} disabled={busy} required value={price} placeholder="희망 판매 가격 입력" aria-invalid={!!error} aria-describedby={error ? 'sr-price-error sr-price-help' : 'sr-price-help'} onChange={(event) => { setPrice(event.target.value); setError('') }} /><span>원</span></div>{error && <p id="sr-price-error" className="sr-error" role="alert">{error}</p>}<p id="sr-price-help" className="sr-help">단가가 아닌 전체 등록 수량의 판매 희망 금액을 입력해 주세요.</p>
        <div className="sr-estimate"><div><span>예상 판매 가격</span><strong>{Number.isFinite(expected) && expected > 0 ? money(expected) : '검수 후 산정'}</strong></div><p>기존 판매 참고가 기준이며 확정 가격이 아닙니다. 최종 판매 가격은 검수 결과와 자재 상태에 따라 달라질 수 있습니다.</p></div>
        <section className="sr-guidance" aria-labelledby="sr-grade-title"><h3 id="sr-grade-title"><Info size={16} />등급별 판매가격 안내</h3><dl>{gradeGuidance.map(([grade, description]) => <div key={grade} className={grade === asset.grade ? 'current-grade' : ''}><dt>{grade}등급{grade === asset.grade && <span>현재 등급</span>}</dt><dd>{description}</dd></div>)}</dl><p>동일 등급이라도 규격·수량·수요에 따라 가격이 달라집니다. 등급별 고정 가격이나 보장 금액은 없습니다.</p></section>
        <div className="sr-review-note"><ClipboardCheck size={18} /><p>{persistent ? '판매 요청은 승인 대기·상세 검수 대기로 접수됩니다. 접수만으로 판매가 시작되거나 재고가 차감되지는 않습니다. 희망금액은 실제 정산액이 아닙니다.' : '신청 후 대기 중 상태로 전환됩니다. 검수 후 관리자가 승인하면 판매 중 상태로 전환되어 마켓에 등록되며, 마켓 등록 후에는 취소할 수 없습니다.'}</p></div>
      </div><div className="sr-actions"><button type="button" className="sr-button" disabled={busy} onClick={onClose}>취소</button><button type="submit" className="sr-button sr-primary" disabled={busy}>{busy ? '요청 중...' : '마켓 등록 요청'}</button></div>
    </form>}
  </dialog>
}