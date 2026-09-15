import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Building2, Leaf, Phone } from 'lucide-react'
import './ServiceInquiryPage.css'

export default function ServiceInquiryPage() {
  const heading = useRef<HTMLHeadingElement>(null)
  const result = useRef<HTMLParagraphElement>(null)
  const [complete, setComplete] = useState(false)
  useEffect(() => { heading.current?.focus(); window.scrollTo(0, 0) }, [])
  useEffect(() => { if (complete) result.current?.focus() }, [complete])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    for (const field of form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[required]:not([type="checkbox"]), textarea[required]')) {
      if (!field.value.trim()) {
        field.setCustomValidity('필수 항목을 입력해 주세요.')
        field.reportValidity()
        return
      }
    }
    if (!form.reportValidity()) return
    setComplete(true)
  }

  return <div className="service-inquiry-page">
    <header className="si-header"><a className="si-brand" href="#"><Leaf size={24} />MRS</a><a href="#contact"><ArrowLeft size={16} />홈으로 돌아가기</a></header>
    <main className="si-main">
      <div className="si-heading"><span>CONTACT US</span><h1 ref={heading} tabIndex={-1}>서비스 사용 문의</h1><p>자재 보관과 거래, 서비스 도입에 대해 궁금한 내용을 남겨 주세요.</p></div>
      <div className="si-layout">
        <aside className="si-company" aria-labelledby="si-company-title"><h2 id="si-company-title"><Building2 size={19} />회사 정보</h2><strong className="si-company-name">MRS</strong><p>Material Recycling Service<br />건설자재 보관·거래 플랫폼</p><dl><div><dt>서비스</dt><dd>자재 보관·자산 관리<br />자재 거래·마켓<br />보관 비용·판매 정산</dd></div><div><dt>대표 문의 전화</dt><dd><a href="tel:0312981191"><Phone size={16} />031-298-1191</a></dd></div></dl></aside>
        <form className="si-form" onSubmit={submit} onInput={(event) => { setComplete(false); if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) event.target.setCustomValidity('') }}>
          <div className="si-form-heading"><h2>문의 정보</h2><span>이메일 외 필수 입력</span></div>
          <div className="si-fields">
            <label>성함<input name="name" autoComplete="name" required maxLength={80} /></label>
            <label>회사명<input name="company" autoComplete="organization" required maxLength={120} /></label>
            <label>연락처<input name="phone" type="tel" autoComplete="tel" required maxLength={30} pattern={'(?=(?:[^0-9]*[0-9]){7})[+0-9\\(\\) .\\-]{7,30}'} title="숫자 7자리 이상을 포함해 전화번호를 7~30자로 입력해 주세요." placeholder="010-0000-0000" /></label>
            <label>이메일 (선택)<input name="email" type="email" autoComplete="email" maxLength={254} placeholder="name@company.com" /></label>
            <label className="si-full">문의내용<textarea name="message" rows={7} required maxLength={2000} placeholder="자재 종류, 예상 수량, 이용 목적 등을 알려 주세요." /></label>
          </div>
          <div className="si-consent"><input id="privacy-consent" type="checkbox" name="privacy" required /><label htmlFor="privacy-consent"><a href="#/privacy">개인정보처리방침</a>에 동의합니다. (필수)</label></div>
          <p className="si-demo">현재는 문의 작성만 가능하며 운영팀에 전송되지 않습니다.</p>
          <button className="si-submit" type="submit" disabled={complete}>문의 작성 완료<ArrowRight size={17} /></button>
          {complete && <p ref={result} tabIndex={-1} className="si-result" role="status">문의 내용이 작성되었습니다. 아직 접수되거나 전송되지 않았습니다. 실제 상담은 031-298-1191로 연락해 주세요.</p>}
        </form>
      </div>
    </main>
    <footer className="si-footer">MRS · Material Recycling Service</footer>
  </div>
}