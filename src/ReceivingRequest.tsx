import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, Camera, ClipboardCheck, X } from 'lucide-react'
import './AdminAssets.css'

type Contact = { name: string; phone: string }

type ReceivingRequestNavigation = { open: () => void }

const ReceivingRequestContext = createContext<ReceivingRequestNavigation | null>(null)

export function useReceivingRequest() {
  return useContext(ReceivingRequestContext)
}

export function ReceivingRequestProvider({ contact, children, onSubmit, onViewHistory }: { contact: Contact; children: ReactNode; onSubmit?: (form: FormData) => Promise<{ id: string }>; onViewHistory?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [submitted, setSubmitted] = useState(false)
  const [termsAgreed, setTermsAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const [error, setError] = useState('')
  const [requestId, setRequestId] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const previewUrls = useRef<string[]>([])
  const replacePhotos = (files: File[]) => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url))
    const urls = files.map((file) => URL.createObjectURL(file))
    previewUrls.current = urls
    setPhotos(files)
    setPreviews(urls)
  }
  useEffect(() => () => previewUrls.current.forEach((url) => URL.revokeObjectURL(url)), [])
  const reset = () => { dialog.current?.querySelector('form')?.reset(); setSubmitted(false); setTermsAgreed(false); setError(''); setRequestId(''); replacePhotos([]) }
  const close = () => { if (!submitting.current) { dialog.current?.close(); reset() } }

  return <ReceivingRequestContext value={{ open: () => { if (!dialog.current?.open) { reset(); dialog.current?.showModal() } } }}>
    {children}
    <dialog ref={dialog} className="sa-dialog sa-receiving-dialog" aria-labelledby="receiving-dialog-title" onCancel={(event) => { event.preventDefault(); close() }}>
      <form aria-busy={busy} onSubmit={async (event) => {
        event.preventDefault()
        if (submitting.current || submitted) return
        const form = new FormData(event.currentTarget)
        form.delete('photos')
        photos.forEach((file) => form.append('photos', file))
        setError('')
        if (!onSubmit) { setSubmitted(true); return }
        submitting.current = true; setBusy(true)
        try { const receiving = await onSubmit(form); setRequestId(receiving.id); setSubmitted(true) }
        catch (reason) { setError(`${reason instanceof Error ? reason.message : '응답을 확인하지 못했습니다.'} 신청 내역을 확인한 후 다시 시도해 주세요.`) }
        finally { submitting.current = false; setBusy(false) }
      }}>
        <div className="sa-dialog-heading"><div><span className="sa-dialog-eyebrow">MRS RECEIVING</span><h2 id="receiving-dialog-title">자재 수거 및 입고 신청</h2></div><button type="button" className="sa-icon" aria-label="입고 신청 닫기" onClick={close}><X size={18} /></button></div>
        <p className="sa-form-note">사진을 등록해 주시면 담당자가 확인 후 수거와 입고 절차를 안내합니다.</p>
        <fieldset className="sa-receiving-fieldset" disabled={busy || submitted}><div className="sa-form-fields sa-receiving-fields">
          <label className="sa-full-field">현장명 또는 상호 <b>필수</b><input name="siteName" placeholder="예: 강남구 역삼동 신축 현장" required maxLength={120} /></label>
          <label>담당자명 <b>필수</b><input name="manager" defaultValue={contact.name} autoComplete="name" required maxLength={80} /></label>
          <label>연락처 <b>필수</b><input name="phone" type="tel" defaultValue={contact.phone} autoComplete="tel" required maxLength={30} /></label>
          <label className="sa-full-field">예상 물량 (차량 기준) <b>필수</b><select name="volume" required defaultValue=""><option value="" disabled>선택해 주세요</option><option value="UNDER_ONE_TON">1톤 트럭 이하 (소량)</option><option value="TWO_POINT_FIVE_TONS">2.5톤 트럭 기준 (약 4~5 파렛트)</option><option value="FIVE_TONS_OR_MORE">5톤 트럭 이상 (대량)</option></select></label>
          <label className="sa-full-field">요청 메모 <span className="sa-optional">선택</span><textarea name="note" rows={4} maxLength={1000} placeholder="수거 희망 시간, 진입 조건, 하역 장비 등 담당자가 확인할 내용을 입력해 주세요." /></label>
          <label className="sa-full-field">자재 사진 등록 {onSubmit ? <span className="sa-optional">선택</span> : <b>필수</b>}<span className="sa-receiving-upload"><Camera size={20} /><span>사진 촬영 또는 갤러리 선택<small>JPG·PNG·WebP, 각 5MB 이하, 최대 5장</small></span><input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple required={!onSubmit && !photos.length} onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            event.target.value = ''
            if (photos.length + files.length > 5 || files.some((file) => !file.size || file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) { setError('사진은 JPG·PNG·WebP 형식, 각 5MB 이하로 최대 5장까지 등록해 주세요.'); return }
            setError(''); replacePhotos([...photos, ...files])
          }} /></span></label>
          {!!photos.length && <div className="sa-full-field sa-receiving-previews">{photos.map((file, index) => <figure key={`${index}/${file.name}`}><img src={previews[index]} alt={file.name} /><figcaption>{file.name}</figcaption><button type="button" className="sa-icon" aria-label={`${file.name} 삭제`} title="사진 삭제" onClick={() => replacePhotos(photos.filter((_, position) => position !== index))}><X size={16} /></button></figure>)}</div>}
          {onSubmit && <p className="sa-full-field sa-form-note">사진은 공개 주소로 저장됩니다. 개인정보나 민감한 내용이 포함된 사진은 등록하지 마세요.</p>}
          <label className="sa-receiving-terms sa-full-field"><span className="sa-receiving-terms-heading"><input name="disposalTerms" type="checkbox" required checked={termsAgreed} onChange={(event) => setTermsAgreed(event.target.checked)} /><strong>[필수] F등급(폐기물) 처리 규정 동의</strong></span><span className="sa-receiving-terms-copy">입고 후 검수에서 재사용 불가 판정된 자재는 당사 규정에 따라 자동 폐기 처리되며, 폐기 비용이 청구될 수 있음에 동의합니다.</span></label>
        </div></fieldset>
        {error && <p className="customer-error" role="alert">{error}</p>}
        {submitted && <p className="sa-receiving-success" role="status">입고 신청이 접수되었습니다.{requestId && <> 신청번호: <strong>{requestId}</strong></>} 담당자가 확인 후 수거와 입고 절차를 안내합니다.</p>}
        <div className="sa-dialog-actions"><button type="button" className="sa-button" disabled={busy} onClick={close}>{submitted ? '닫기' : '취소'}</button>{submitted && onViewHistory ? <button type="button" className="sa-button sa-primary" onClick={() => { close(); onViewHistory() }}>신청 내역 확인<ArrowRight size={15} /></button> : <button type="submit" className="sa-button sa-primary" disabled={!termsAgreed || busy || submitted}>{busy ? '접수 중...' : '입고 신청 접수하기'}<ArrowRight size={15} /></button>}</div>
      </form>
    </dialog>
  </ReceivingRequestContext>
}

export function ReceivingRequestButton() {
  const receivingRequest = useReceivingRequest()
  if (!receivingRequest) return null
  return <button type="button" className="sa-receiving-button" onClick={receivingRequest.open}><ClipboardCheck size={16} />입고 신청</button>
}
