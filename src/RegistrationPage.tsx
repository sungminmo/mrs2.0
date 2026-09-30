import { useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, Check, ChevronRight, Leaf, Search, ShieldCheck } from 'lucide-react'
import './RegistrationPage.css'

type Step = 1 | 2 | 3

const steps = ['약관 동의', '회원정보 입력', '가입 신청 완료']

const termContents = {
  service: { title: '서비스 이용약관', body: <>제1조 (목적)<br /><br />본 약관은 MRS가 제공하는 건설자재 보관·거래 서비스의 이용 조건과 절차, 회사와 이용자의 권리 및 의무를 정하는 것을 목적으로 합니다.<br /><br />제2조 (서비스 이용)<br /><br />이용자는 등록한 회사 정보와 담당자 정보를 정확하게 유지해야 하며, 서비스는 관리자 승인 후 이용할 수 있습니다. 승인 전에는 일부 기능의 이용이 제한될 수 있습니다.<br /><br />제3조 (계정 관리)<br /><br />이용자는 계정 정보를 안전하게 관리해야 하며, 계정을 제3자에게 양도하거나 공유할 수 없습니다.</> },
  privacy: { title: '개인정보 수집 및 이용 동의', body: <>수집 항목: 고객사명, 사업자등록번호, 대표자명, 대표 연락처, 사업장 주소, 담당자명, 담당자 연락처, 이메일<br /><br />수집 및 이용 목적: 고객사 및 회원 소속 확인, 회원 가입 신청, MRS 승인, 서비스 제공 및 이용자 관리<br /><br />보유 및 이용 기간: 회원 탈퇴 또는 수집 목적 달성 시까지. 관련 법령에 따라 보관이 필요한 정보는 해당 기간 동안 보관합니다.<br /><br />동의를 거부할 권리가 있으나, 필수 정보 수집·이용에 동의하지 않으면 회원가입이 제한됩니다.</> },
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
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [newCustomer, setNewCustomer] = useState(false)
  const [businessNumber, setBusinessNumber] = useState('')
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null)
  const [searching, setSearching] = useState(false)
  const [lookupMessage, setLookupMessage] = useState('')
  const lookupVersion = useRef(0)
  const termsAgreed = serviceTermsAgreed && privacyTermsAgreed && businessTermsAgreed
  const allTermsAgreed = termsAgreed && marketingAgreed

  async function lookupCustomer() {
    const version = ++lookupVersion.current
    setSearching(true)
    setCustomer(null)
    setLookupMessage('')
    try {
      const response = await fetch('/api/customers/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessNumber }) })
      const body = await response.json() as { data?: { customer: { id: string; name: string } | null }; error?: { message: string } }
      if (version !== lookupVersion.current) return
      if (!response.ok) throw new Error(body.error?.message ?? '고객사 검색에 실패했습니다.')
      setCustomer(body.data?.customer ?? null)
      setLookupMessage(body.data?.customer ? '' : '선택 가능한 고객사가 없습니다. 신규 등록 또는 MRS 확인이 필요합니다.')
    } catch (error) {
      if (version === lookupVersion.current) setLookupMessage(error instanceof Error ? error.message : '고객사 검색에 실패했습니다.')
    } finally {
      if (version === lookupVersion.current) setSearching(false)
    }
  }

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    const password = String(formData.get('password'))
    const confirmation = String(formData.get('passwordConfirmation'))
    if (!newCustomer && !customer) { setSubmitError('고객사를 검색하고 선택해 주세요.'); return }
    if (password !== confirmation) {
      setPasswordError('비밀번호가 일치하지 않습니다.')
      return
    }
    setPasswordError('')
    setSubmitError('')
    setSubmitting(true)
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.get('email'),
          password,
          ...(newCustomer ? { customerType: 'new', customer: { name: formData.get('company'), businessNumber: formData.get('businessNumber'), representativeName: formData.get('representativeName'), address: formData.get('address'), phone: formData.get('companyPhone') } } : { customerType: 'existing', customerId: customer!.id }),
          managerName: formData.get('manager'),
          managerPhone: formData.get('managerPhone'),
        }),
      })
      const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null
      if (!response.ok) {
        throw new Error(body?.error?.message ?? '회원가입 신청을 처리하지 못했습니다. 입력 내용을 확인해 주세요.')
      }
      setStep(3)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '회원가입 신청 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
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

      {step === 2 && <section className="registration-panel" aria-labelledby="profile-title">
        <div className="registration-panel-heading"><div><span>STEP 02</span><h2 id="profile-title">회원정보 입력</h2></div><p><em>*</em> 필수 입력 항목</p></div>
        <form className="registration-form" onSubmit={submitProfile}><fieldset disabled={submitting} className="registration-form-group">
          <div className="registration-fields">
            <label>아이디 <em>*</em><input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
            <label>담당자명 <em>*</em><input name="manager" required maxLength={80} autoComplete="name" /></label>
            <label>비밀번호 <em>*</em><input name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" onChange={() => setPasswordError('')} /></label>
            <label>비밀번호 확인 <em>*</em><input name="passwordConfirmation" type="password" required minLength={8} maxLength={128} autoComplete="new-password" onChange={() => setPasswordError('')} /></label>
            <label>담당자 연락처 <em>*</em><input name="managerPhone" type="tel" required maxLength={30} autoComplete="tel" /></label>
            {passwordError && <p className="registration-error" role="alert">{passwordError}</p>}
          </div>
          <h3>고객사</h3>
          <label className="registration-new-customer"><input type="checkbox" checked={newCustomer} onChange={(event) => { lookupVersion.current += 1; setNewCustomer(event.target.checked); setCustomer(null); setSearching(false); setLookupMessage(''); setSubmitError('') }} />신규 고객사</label>
          {newCustomer ? <div className="registration-fields" key="new">
            <label>고객사명 <em>*</em><input name="company" required maxLength={160} autoComplete="organization" /></label>
            <label>사업자등록번호 <em>*</em><input name="businessNumber" required maxLength={12} inputMode="numeric" /></label>
            <label>대표자명 <em>*</em><input name="representativeName" required maxLength={80} /></label>
            <label>대표 연락처 <em>*</em><input name="companyPhone" type="tel" required maxLength={30} /></label>
            <label className="registration-field-wide">사업장 주소 <em>*</em><input name="address" required maxLength={500} autoComplete="street-address" /></label>
          </div> : <div className="registration-fields" key="existing">
            <label className="registration-field-wide">사업자등록번호 <em>*</em><span className="registration-lookup"><input value={businessNumber} maxLength={12} inputMode="numeric" onChange={(event) => { lookupVersion.current += 1; setBusinessNumber(event.target.value); setCustomer(null); setSearching(false); setLookupMessage('') }} /><button className="registration-primary" type="button" disabled={searching || !businessNumber.trim()} onClick={() => void lookupCustomer()}><Search size={16} />{searching ? '검색 중' : '검색'}</button></span></label>
            {customer && <label className="registration-field-wide">선택 고객사<input value={customer.name} readOnly /></label>}
            {lookupMessage && <p className="registration-error" role="status">{lookupMessage}</p>}
          </div>}
          {submitError && <p className="registration-error" role="alert">{submitError}</p>}
        </fieldset><div className="registration-actions"><button type="button" disabled={submitting} onClick={() => setStep(1)}>이전</button><button className="registration-primary" type="submit" disabled={submitting || !newCustomer && !customer}>{submitting ? '신청 처리 중' : '회원가입 신청'}<ChevronRight size={17} /></button></div></form>
      </section>}

      {step === 3 && <section className="registration-panel registration-complete" aria-labelledby="complete-title"><span className="registration-complete-icon"><ShieldCheck size={32} /></span><h2 id="complete-title">회원가입 신청이 완료되었습니다.</h2><p>고객사 및 소속 확인 후 MRS가 가입을 승인합니다.</p><a className="registration-primary" href="#">홈으로 돌아가기<ArrowLeft size={17} /></a></section>}
    </section>
  </main>
}

function TermRow({ term, required = false, checked, open, onChange, onToggle }: { term: keyof typeof termContents; required?: boolean; checked: boolean; open: boolean; onChange: (checked: boolean) => void; onToggle: () => void }) {
  const content = termContents[term]
  return <div className="registration-term"><div className="registration-term-row"><label><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><b>{required ? '[필수]' : '[선택]'} {content.title}</b></label><button type="button" aria-expanded={open} aria-controls={`${term}-terms`} onClick={onToggle}>전체보기<ChevronRight size={14} /></button></div>{open && <div id={`${term}-terms`} className="registration-term-content" tabIndex={0}><h3>{content.title}</h3><p>{content.body}</p></div>}</div>
}