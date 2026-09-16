import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowDownToLine, ArrowLeft, Box, Check, FileText } from 'lucide-react'

export type QuoteItem = { name: string; category: string; price: number; unit: string; quantity: number; image?: string }
const money = (value: number) => `₩${value.toLocaleString('ko-KR')}`

export default function QuoteRequestPage({ items, onBack, backLabel }: { items: QuoteItem[]; onBack: () => void; backLabel: string }) {
  const [draft, setDraft] = useState({ company: '', name: '', phone: '', email: '', address: '', deliveryDate: '', note: '' })
  const [request, setRequest] = useState<typeof draft | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const companyInput = useRef<HTMLInputElement>(null)
  const submitted = useRef(false)
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const validItems = items.length > 0 && items.every((item) => Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 9999)
  useEffect(() => { window.scrollTo(0, 0); heading.current?.focus({ preventScroll: true }) }, [])

  function submitQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!validItems || submitted.current) return
    for (const field of event.currentTarget.querySelectorAll<HTMLInputElement>('input[required]')) {
      if (!field.value.trim()) {
        field.setCustomValidity('필수 항목을 입력해 주세요.')
        field.reportValidity()
        return
      }
    }
    submitted.current = true
    setRequest({ company: draft.company.trim(), name: draft.name.trim(), phone: draft.phone.trim(), email: draft.email.trim(), address: draft.address.trim(), deliveryDate: draft.deliveryDate, note: draft.note.trim() })
  }

  function downloadQuote() {
    if (!request) return
    const rows = [['자재명', '카테고리', '단가', '수량', '단위', '예상 자재 금액', '업체명', '담당자명', '연락처', '이메일', '주소', '희망 납기일', '요청사항'], ...items.map((item) => [item.name, item.category, String(item.price), String(item.quantity), item.unit, String(item.price * item.quantity), request.company, request.name, request.phone, request.email, request.address, request.deliveryDate, request.note])]
    const escape = (value: string) => `"${(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`
    const url = URL.createObjectURL(new Blob(['\uFEFF', rows.map((row) => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'EcoMatX-quote-request.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return <article className="sm-request-page">
    <div className="sm-detail-title"><button className="sa-icon" title={backLabel} aria-label={backLabel} onClick={onBack}><ArrowLeft size={18} /></button><h1 ref={heading} tabIndex={-1}>견적 요청 상세</h1></div>
    <div className="sm-request-layout">
      <section className="sm-request-items" aria-label="견적 요청 상품">
        <div className="sa-section-title"><h2>요청 상품</h2><span>{items.length}종</span></div>
        {items.map((item) => <div className="sm-request-item" key={item.name}><span className="sa-thumbnail">{item.image ? <img src={item.image} alt={item.name} onError={(event) => { event.currentTarget.hidden = true }} /> : <Box size={24} />}</span><div><h3>{item.name}</h3><p>{item.category}</p><p>{money(item.price)} / {item.unit}</p><span>{item.quantity.toLocaleString('ko-KR')} {item.unit}</span></div><strong>{money(item.price * item.quantity)}</strong></div>)}
        <div className="sm-quote-total"><span>예상 자재 금액</span><strong>{money(total)}</strong></div>
        <p className="sa-form-note">배송비·부가세 별도 확인. 주문이나 결제는 진행되지 않습니다.</p>
      </section>
      {request ? <section className="sm-quote-result" aria-label="견적 요청 작성 결과"><h3 tabIndex={-1} ref={(element) => element?.focus()}><Check size={18} />견적 요청서 작성 완료</h3><dl>{[['업체명', request.company], ['담당자명', request.name], ['연락처', request.phone], ['이메일', request.email], ['주소', request.address], ['희망 납기일', request.deliveryDate], ['요청사항', request.note]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '-'}</dd></div>)}</dl><p role="status">요청서가 이 화면에 작성되었습니다. 현재는 시제품으로 공급사에 전송되지 않으며, 페이지를 나가면 초기화됩니다.</p><button className="sa-button sa-primary" onClick={downloadQuote}><ArrowDownToLine size={16} />요청서 다운로드</button><button className="sa-button" onClick={() => { submitted.current = false; setRequest(null); requestAnimationFrame(() => companyInput.current?.focus()) }}>요청 내용 수정</button></section> : <form onSubmit={submitQuote} onInput={(event) => { if (event.target instanceof HTMLInputElement) event.target.setCustomValidity('') }}>
        <div className="sm-quote-fields"><h2>견적 요청 사항</h2>
          <label>업체명 <span>필수</span><input ref={companyInput} name="company" autoComplete="organization" placeholder="예: 에코건설" required maxLength={120} value={draft.company} onChange={(event) => setDraft({ ...draft, company: event.target.value })} /></label>
          <label>담당자명 <span>필수</span><input name="contact" autoComplete="name" placeholder="예: 홍길동" required maxLength={80} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label>연락처 <span>필수</span><input name="phone" type="tel" autoComplete="tel" placeholder="예: 010-1234-5678" required maxLength={40} value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
          <label>이메일 <span>선택</span><input name="email" type="email" autoComplete="email" placeholder="예: contact@example.com" maxLength={254} value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label>
          <label>주소 <span>선택</span><input name="address" autoComplete="street-address" placeholder="납품받을 주소와 상세주소 입력" maxLength={300} value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} /></label>
          <label>희망 납기일 <span>선택</span><span className={`sm-date-field ${draft.deliveryDate ? '' : 'is-empty'}`}><input name="deliveryDate" type="date" value={draft.deliveryDate} onChange={(event) => setDraft({ ...draft, deliveryDate: event.target.value })} />{!draft.deliveryDate && <span className="sm-date-placeholder" aria-hidden="true">희망 납기일 선택</span>}</span></label>
          <label>요청사항 <span>선택</span><textarea name="note" rows={4} maxLength={1000} placeholder="필요한 규격, 납품 조건 등 요청사항 입력" value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label>
          <p className="sa-form-note">시제품 화면입니다. 입력한 정보는 외부로 전송되지 않습니다.</p><div className="sm-quote-actions"><button className="sa-button" type="button" onClick={onBack}>취소</button><button className="sa-button sa-primary" type="submit" disabled={!validItems}><FileText size={16} />견적 요청서 작성</button></div>
        </div>
      </form>}
    </div>
  </article>
}