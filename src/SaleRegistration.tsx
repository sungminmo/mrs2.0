import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, ClipboardCheck, Info, X } from 'lucide-react'
import './SaleRegistration.css'

type SaleAsset = { name: string; grade: string; quantity: string; unit: string; salePrice: string }
const money = (value: number) => `₩${value.toLocaleString('ko-KR')}`
const gradeGuidance = [
  ['S', '사용 흔적이 적고 상태가 우수한 자재입니다. 규격과 품질 확인 후 판매 가격을 산정합니다.'],
  ['A', '재사용 가능한 양호한 자재입니다. 사용 흔적과 보수 필요 여부가 가격에 반영됩니다.'],
  ['B', '사용 흔적이나 일부 손상이 있는 자재입니다. 보수 비용과 활용 범위를 고려해 가격을 조정합니다.'],
]

export default function SaleRegistration({ asset, onClose, onRegister }: { asset: SaleAsset; onClose: () => void; onRegister: (price: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [price, setPrice] = useState('')
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(false)
  const submitted = useRef(false)
  const expected = Number(asset.salePrice.replaceAll(',', ''))
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = Number(price)
    if (!price.trim() || !Number.isSafeInteger(value) || value <= 0) {
      setError('희망가격을 1원 이상의 정수로 입력해 주세요.')
      return
    }
    if (submitted.current) return
    submitted.current = true
    onRegister(value.toLocaleString('ko-KR'))
    setComplete(true)
  }

  return <dialog ref={dialog} className="sale-registration" aria-labelledby="sale-title" onCancel={onClose}>
    <div className="sr-heading"><h2 id="sale-title">{complete ? '판매 등록 요청 완료' : '마켓 판매 등록'}</h2><button type="button" className="sr-icon" aria-label="판매 등록 닫기" onClick={onClose}><X size={18} /></button></div>
    {complete ? <><div className="sr-success" role="status"><span className="sr-success-icon"><Check size={25} /></span><h3>판매 등록 요청이 접수되었습니다.</h3><p><b>{asset.name}</b>의 판매를 위한 검수 작업을 진행합니다.<br />검수 후 관리자가 승인하면 판매 중 상태로 전환되어 마켓에 등록됩니다.</p><dl><div><dt>희망가격</dt><dd>{money(Number(price))}</dd></div><div><dt>진행 상태</dt><dd><span className="sr-review"><ClipboardCheck size={14} />검수 대기</span></dd></div></dl><p className="sr-disclaimer">현재는 시제품으로 실제 검수나 마켓 등록은 진행되지 않습니다. 변경은 새로고침 시 초기화됩니다.</p></div><div className="sr-actions"><button className="sr-button sr-primary" onClick={onClose}>확인</button></div></> : <form onSubmit={submit}>
      <div className="sr-body"><div className="sr-asset"><span className="sr-grade">{asset.grade}등급</span><h3>{asset.name}</h3><p>등록 수량 {asset.quantity} {asset.unit} · 전체 수량 기준 가격</p></div>
        <label className="sr-label" htmlFor="sr-price">희망가격 <span>필수</span></label><div className={`sr-price-input ${error ? 'has-error' : ''}`}><input autoFocus id="sr-price" type="number" min="1" step="1" max={Number.MAX_SAFE_INTEGER} required value={price} placeholder="희망 판매 가격 입력" aria-invalid={!!error} aria-describedby={error ? 'sr-price-error sr-price-help' : 'sr-price-help'} onChange={(event) => { setPrice(event.target.value); setError('') }} /><span>원</span></div>{error && <p id="sr-price-error" className="sr-error" role="alert">{error}</p>}<p id="sr-price-help" className="sr-help">단가가 아닌 전체 등록 수량의 판매 희망 금액을 입력해 주세요.</p>
        <div className="sr-estimate"><div><span>예상 판매 가격</span><strong>{Number.isFinite(expected) && expected > 0 ? money(expected) : '검수 후 산정'}</strong></div><p>기존 판매 참고가 기준이며 확정 가격이 아닙니다. 최종 판매 가격은 검수 결과와 자재 상태에 따라 달라질 수 있습니다.</p></div>
        <section className="sr-guidance" aria-labelledby="sr-grade-title"><h3 id="sr-grade-title"><Info size={16} />등급별 판매가격 안내</h3><dl>{gradeGuidance.map(([grade, description]) => <div key={grade} className={grade === asset.grade ? 'current-grade' : ''}><dt>{grade}등급{grade === asset.grade && <span>현재 등급</span>}</dt><dd>{description}</dd></div>)}</dl><p>동일 등급이라도 규격·수량·수요에 따라 가격이 달라집니다. 등급별 고정 가격이나 보장 금액은 없습니다.</p></section>
        <div className="sr-review-note"><ClipboardCheck size={18} /><p>신청 후 대기 중 상태로 전환됩니다. 검수 후 관리자가 승인하면 판매 중 상태로 전환되어 마켓에 등록되며, 마켓 등록 후에는 취소할 수 없습니다.</p></div>
      </div><div className="sr-actions"><button type="button" className="sr-button" onClick={onClose}>취소</button><button type="submit" className="sr-button sr-primary">마켓 등록 요청</button></div>
    </form>}
  </dialog>
}