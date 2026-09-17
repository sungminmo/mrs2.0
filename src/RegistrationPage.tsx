import { useState, type FormEvent } from 'react'
import { ArrowLeft, Check, ChevronRight, Leaf, ShieldCheck } from 'lucide-react'
import './RegistrationPage.css'

type Step = 1 | 2 | 3

const steps = ['약관 동의', '회원정보 입력', '가입 신청 완료']

const termContents = {
  service: { title: '서비스 이용약관', body: <>제1조 (목적)<br /><br />본 약관은 MRS가 제공하는 건설자재 보관·거래 서비스의 이용 조건과 절차, 회사와 이용자의 권리 및 의무를 정하는 것을 목적으로 합니다.<br /><br />제2조 (서비스 이용)<br /><br />이용자는 등록한 회사 정보와 담당자 정보를 정확하게 유지해야 하며, 서비스는 관리자 승인 후 이용할 수 있습니다. 승인 전에는 일부 기능의 이용이 제한될 수 있습니다.<br /><br />제3조 (계정 관리)<br /><br />이용자는 계정 정보를 안전하게 관리해야 하며, 계정을 제3자에게 양도하거나 공유할 수 없습니다.</> },
  privacy: { title: '개인정보 수집 및 이용 동의', body: <>수집 항목: 회사명, 회사 연락처, 담당자명, 담당자 연락처, 이메일, 주소<br /><br />수집 및 이용 목적: 회원 가입 신청, 관리자 승인, 서비스 제공 및 이용자 관리<br /><br />보유 및 이용 기간: 회원 탈퇴 또는 수집 목적 달성 시까지. 관련 법령에 따라 보관이 필요한 정보는 해당 기간 동안 보관합니다.<br /><br />동의를 거부할 권리가 있으나, 필수 정보 수집·이용에 동의하지 않으면 회원가입이 제한됩니다.</> },
  business: { title: '기업회원 및 공급처 이용 동의', body: <>MRS 기업회원은 회사 또는 공급처를 대표하여 서비스를 이용할 수 있는 권한이 있는 담당자여야 합니다.<br /><br />등록한 자재 정보, 재고 수량, 품질 등급, 거래 조건은 사실에 근거해야 하며, 서비스 운영 정책 및 관련 법령을 준수해야 합니다.<br /><br />판매 등록, 견적, 입고 및 정산 과정에서 필요한 확인 요청에 성실히 응해야 하며, 관리자 검수와 승인 절차에 동의합니다.</> },
  marketing: { title: '마케팅 및 광고 알림 설정', body: <>MRS의 서비스 소식, 자재 거래 정보, 이벤트 및 혜택을 이메일 또는 문자로 받아볼 수 있습니다.<br /><br />동의하지 않아도 회원가입 및 기본 서비스 이용에는 영향이 없습니다. 알림 설정은 마이페이지에서 언제든 변경할 수 있습니다.</> },
}

export default function RegistrationPage() {
  const [step, setStep] = useState<Step>(1)
  const [serviceTermsAgreed, setServiceTermsAgreed] = useState(false)
  const [privacyTermsAgreed, setPrivacyTermsAgreed] = useState(false)
  const [businessTermsAgreed, setBusinessTermsAgreed] = useState(false)
  const [marketingAgreed, setMarketingAgreed] = useState(false)
  const [openTerm, setOpenTerm] = useState<keyof typeof termContents | null>(null)
  const [passwordError, setPasswordError] = useState('')
  const termsAgreed = serviceTermsAgreed && privacyTermsAgreed && businessTermsAgreed
  const allTermsAgreed = termsAgreed && marketingAgreed

  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const password = String(new FormData(form).get('password'))
    const confirmation = String(new FormData(form).get('passwordConfirmation'))
    if (password !== confirmation) {
      setPasswordError('비밀번호가 일치하지 않습니다.')
      return
    }
    setPasswordError('')
    setStep(3)
  }

  return <main className="registration-page">
    <header className="registration-header"><a href="#" aria-label="MRS 홈"><Leaf size={23} />MRS <span>Material Recycling Service</span></a><a className="registration-back" href="#"><ArrowLeft size={16} />홈으로</a></header>
    <section className="registration-shell" aria-labelledby="registration-title">
      <div className="registration-heading"><span className="registration-eyebrow">MRS 고객포탈</span><h1 id="registration-title">회원가입</h1><p>서비스 이용을 위한 기본 정보를 등록해 주세요.</p></div>
      <ol className="registration-steps" aria-label="회원가입 단계">{steps.map((label, index) => {
        const current = index + 1 as Step
        return <li key={label} className={step === current ? 'is-current' : step > current ? 'is-done' : ''}><span>{step > current ? <Check size={14} /> : `0${current}`}</span><b>{label}</b></li>
      })}</ol>

      {step === 1 && <section className="registration-panel" aria-labelledby="terms-title"><div className="registration-panel-heading"><div><span>STEP 01</span><h2 id="terms-title">약관 동의</h2></div><p>가입을 진행하려면 필수 약관에 동의해 주세요.</p></div><div className="registration-terms"><label className="registration-agree-all"><input type="checkbox" checked={allTermsAgreed} onChange={(event) => { setServiceTermsAgreed(event.target.checked); setPrivacyTermsAgreed(event.target.checked); setBusinessTermsAgreed(event.target.checked); setMarketingAgreed(event.target.checked) }} /><span><b>회원가입의 모든 약관을 확인하고 전체 동의합니다.</b><small>필수 및 선택 항목을 포함합니다.</small></span></label><TermRow term="service" required checked={serviceTermsAgreed} open={openTerm === 'service'} onChange={setServiceTermsAgreed} onToggle={() => setOpenTerm(openTerm === 'service' ? null : 'service')} /><TermRow term="privacy" required checked={privacyTermsAgreed} open={openTerm === 'privacy'} onChange={setPrivacyTermsAgreed} onToggle={() => setOpenTerm(openTerm === 'privacy' ? null : 'privacy')} /><TermRow term="business" required checked={businessTermsAgreed} open={openTerm === 'business'} onChange={setBusinessTermsAgreed} onToggle={() => setOpenTerm(openTerm === 'business' ? null : 'business')} /><TermRow term="marketing" checked={marketingAgreed} open={openTerm === 'marketing'} onChange={setMarketingAgreed} onToggle={() => setOpenTerm(openTerm === 'marketing' ? null : 'marketing')} /></div><div className="registration-actions"><a href="#">취소</a><button className="registration-primary" disabled={!termsAgreed} onClick={() => setStep(2)}>다음<ChevronRight size={17} /></button></div></section>}

      {step === 2 && <section className="registration-panel" aria-labelledby="profile-title"><div className="registration-panel-heading"><div><span>STEP 02</span><h2 id="profile-title">회원정보 입력</h2></div><p><em>*</em> 필수 입력 항목</p></div><form className="registration-form" onSubmit={submitProfile} noValidate={false}><div className="registration-fields"><label>아이디 <em>*</em><input name="email" type="email" required autoComplete="email" placeholder="name@company.com" /></label><label>비밀번호 <em>*</em><input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="8자 이상 입력" onChange={() => setPasswordError('')} /></label><label>비밀번호 확인 <em>*</em><input name="passwordConfirmation" type="password" required minLength={8} autoComplete="new-password" placeholder="비밀번호를 다시 입력" onChange={() => setPasswordError('')} /></label>{passwordError && <p className="registration-error" role="alert">{passwordError}</p>}<label>회사 <em>*</em><input name="company" required autoComplete="organization" placeholder="회사명을 입력해 주세요" /></label><label>회사 번호<input name="companyPhone" type="tel" autoComplete="tel" placeholder="02-0000-0000" /></label><label>담당자명 <em>*</em><input name="manager" required autoComplete="name" placeholder="담당자명을 입력해 주세요" /></label><label>담당자 연락처 <em>*</em><input name="managerPhone" type="tel" required autoComplete="tel" placeholder="010-0000-0000" /></label><label className="registration-field-wide">주소<input name="address" autoComplete="street-address" placeholder="주소를 입력해 주세요" /></label></div><div className="registration-actions"><button type="button" onClick={() => setStep(1)}>이전</button><button className="registration-primary" type="submit">회원가입 신청<ChevronRight size={17} /></button></div></form></section>}

      {step === 3 && <section className="registration-panel registration-complete" aria-labelledby="complete-title"><span className="registration-complete-icon"><ShieldCheck size={32} /></span><span className="registration-eyebrow">APPLICATION RECEIVED</span><h2 id="complete-title">회원가입 신청이 완료되었습니다.</h2><p>관리자 승인 후 서비스 이용이 가능합니다.<br />승인 결과는 등록한 이메일로 안내해 드립니다.</p><a className="registration-primary" href="#">홈으로 돌아가기<ArrowLeft size={17} /></a></section>}
    </section>
  </main>
}

function TermRow({ term, required = false, checked, open, onChange, onToggle }: { term: keyof typeof termContents; required?: boolean; checked: boolean; open: boolean; onChange: (checked: boolean) => void; onToggle: () => void }) {
  const content = termContents[term]
  return <div className="registration-term"><div className="registration-term-row"><label><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><b>{required ? '[필수]' : '[선택]'} {content.title}</b></label><button type="button" aria-expanded={open} aria-controls={`${term}-terms`} onClick={onToggle}>전체보기<ChevronRight size={14} /></button></div>{open && <div id={`${term}-terms`} className="registration-term-content" tabIndex={0}><h3>{content.title}</h3><p>{content.body}</p></div>}</div>
}