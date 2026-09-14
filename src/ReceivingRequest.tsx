import { createContext, useContext, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, Camera, ClipboardCheck, X } from 'lucide-react'
import './AdminAssets.css'

type Contact = { name: string; phone: string }

type ReceivingRequestNavigation = { open: () => void }

const ReceivingRequestContext = createContext<ReceivingRequestNavigation | null>(null)

export function useReceivingRequest() {
  return useContext(ReceivingRequestContext)
}

export function ReceivingRequestProvider({ contact, children }: { contact: Contact; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [submitted, setSubmitted] = useState(false)
  const [termsAgreed, setTermsAgreed] = useState(false)
  const close = () => dialog.current?.close()

  return <ReceivingRequestContext value={{ open: () => dialog.current?.showModal() }}>
    {children}
    <dialog ref={dialog} className="sa-dialog sa-receiving-dialog" aria-labelledby="receiving-dialog-title" onCancel={(event) => { event.preventDefault(); close() }} onClose={() => { dialog.current?.querySelector('form')?.reset(); setSubmitted(false); setTermsAgreed(false) }}>
      <form onSubmit={(event) => { event.preventDefault(); setSubmitted(true) }}>
        <div className="sa-dialog-heading"><div><span className="sa-dialog-eyebrow">MRS RECEIVING</span><h2 id="receiving-dialog-title">자재 수거 및 입고 신청</h2></div><button type="button" className="sa-icon" aria-label="입고 신청 닫기" onClick={close}><X size={18} /></button></div>
        <p className="sa-form-note">사진을 등록해 주시면 담당자가 확인 후 수거와 입고 절차를 안내합니다.</p>
        <div className="sa-form-fields sa-receiving-fields">
          <label className="sa-full-field">현장명 또는 상호 <b>필수</b><input name="siteName" placeholder="예: 강남구 역삼동 신축 현장" required maxLength={120} /></label>
          <label>담당자명 <b>필수</b><input name="manager" defaultValue={contact.name} autoComplete="name" required maxLength={80} /></label>
          <label>연락처 <b>필수</b><input name="phone" type="tel" defaultValue={contact.phone} autoComplete="tel" required maxLength={30} /></label>
          <label className="sa-full-field">예상 물량 (차량 기준) <b>필수</b><select name="volume" required defaultValue=""><option value="" disabled>선택해 주세요</option><option value="under-1t">1톤 트럭 이하 (소량)</option><option value="2.5t">2.5톤 트럭 기준 (약 4~5 파렛트)</option><option value="over-5t">5톤 트럭 이상 (대량)</option></select></label>
          <label className="sa-full-field">자재 사진 등록 <b>필수</b><span className="sa-receiving-upload"><Camera size={20} /><span>사진 촬영 또는 갤러리 선택<small>전체적인 자재 물량이 보이게 촬영해 주세요. 최대 5장</small></span><input name="photos" type="file" accept="image/*" multiple required /></span></label>
          <label className="sa-receiving-terms sa-full-field"><span className="sa-receiving-terms-heading"><input name="disposalTerms" type="checkbox" required checked={termsAgreed} onChange={(event) => setTermsAgreed(event.target.checked)} /><strong>[필수] F등급(폐기물) 처리 규정 동의</strong></span><span className="sa-receiving-terms-copy">입고 후 검수에서 재사용 불가 판정된 자재는 당사 규정에 따라 자동 폐기 처리되며, 폐기 비용이 청구될 수 있음에 동의합니다.</span></label>
        </div>
        {submitted && <p className="sa-receiving-success" role="status">입고 신청이 접수되었습니다. 1영업일 내 담당자가 배차 안내를 드립니다.</p>}
        <div className="sa-dialog-actions"><button type="button" className="sa-button" onClick={close}>취소</button><button type="submit" className="sa-button sa-primary" disabled={!termsAgreed}>입고 신청 접수하기<ArrowRight size={15} /></button></div>
      </form>
    </dialog>
  </ReceivingRequestContext>
}

export function ReceivingRequestButton() {
  const receivingRequest = useReceivingRequest()
  if (!receivingRequest) return null
  return <button type="button" className="sa-receiving-button" onClick={receivingRequest.open}><ClipboardCheck size={16} />입고 신청</button>
}
