import { useState, type FormEvent, type ReactNode } from 'react'
import { ArrowDownToLine, ArrowRight, Building2, Check, ClipboardCheck, FileText, Pencil, Save, ShieldCheck, Truck, UserRound, X } from 'lucide-react'
import type { AuthSession } from './authSession'
import './CustomerMyPage.css'

export type MemberProfile = Pick<AuthSession['user'], 'managerName' | 'managerPhone' | 'email'>
export type MyPageView = 'profile' | 'receivings' | 'inspections' | 'quotes' | 'orders'

const sections = [
  { id: 'profile', label: '회원 정보', Icon: UserRound },
  { id: 'receivings', label: '입고 내역', Icon: ArrowDownToLine },
  { id: 'inspections', label: '검수·폐기', Icon: ClipboardCheck },
  { id: 'quotes', label: '구매 견적', Icon: FileText },
  { id: 'orders', label: '주문·배송', Icon: Truck },
] as const

export default function CustomerMyPage({ view, onNavigate, user, profile, onProfileChange, children }: {
  view: MyPageView
  onNavigate: (view: MyPageView) => void
  user: AuthSession['user']
  profile: MemberProfile
  onProfileChange: (profile: MemberProfile) => void
  children: ReactNode
}) {
  const section = sections.find((entry) => entry.id === view)!
  const receiving = view === 'receivings' || view === 'inspections'
  return <div className="customer-mypage">
    <nav className="mypage-tabs" aria-label="마이페이지 메뉴">{sections.map(({ id, label, Icon }) => <button key={id} type="button" aria-current={view === id ? 'page' : undefined} onClick={() => onNavigate(id)}><Icon size={17} /><span>{label}</span></button>)}</nav>
    {view === 'profile' ? <MemberInformation user={user} profile={profile} onChange={onProfileChange} /> : <>
      <div className="mypage-history-heading"><h2>{section.label}</h2><span>고객사 이용 내역</span></div>
      <div className="mypage-process"><span>{receiving ? '입고·검수' : '구매·배송'}</span><ol aria-label={receiving ? '입고·검수 절차' : '구매·배송 절차'}>{(receiving ? ['입고 신청', '입고 승인', '입고·검수', '결과 확인·폐기 동의'] : ['견적 요청', '견적 회신', '승인·출고 요청', '출고·배송']).map((step, index) => <li key={step}>{index > 0 && <ArrowRight size={13} aria-hidden="true" />}<span>{step}</span></li>)}</ol></div>
      {children}
    </>}
  </div>
}

function MemberInformation({ user, profile, onChange }: { user: AuthSession['user']; profile: MemberProfile; onChange: (profile: MemberProfile) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(profile)
  const [message, setMessage] = useState('')
  const company = user.customer
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onChange({ managerName: draft.managerName.trim(), managerPhone: draft.managerPhone?.trim(), email: draft.email.trim() })
    setEditing(false)
    setMessage('변경 내용을 화면에 반영했습니다. 실제 계정 정보는 변경되지 않으며, 새로고침하면 초기화됩니다.')
  }
  return <>
    <header className="mypage-identity"><span className="mypage-avatar" aria-hidden="true"><UserRound size={27} /></span><div><h2>{profile.managerName}<span>님</span></h2><p>{company?.name ?? user.companyName}</p></div><span className="mypage-role"><ShieldCheck size={14} />{user.customerRole === 'MANAGER' ? '고객사 관리자' : '조회자'}</span></header>
    <section className="mypage-section" aria-labelledby="mypage-member-title">
      <div className="mypage-section-title"><h2 id="mypage-member-title">회원 정보</h2><span>개인 연락처</span></div>
      <form className="mypage-member-form" onSubmit={save}>
        <div className="mypage-fields">
          <label>담당자명{editing ? <input name="managerName" autoComplete="name" required maxLength={80} pattern=".*\S.*" value={draft.managerName} onChange={(event) => setDraft({ ...draft, managerName: event.target.value })} /> : <span>{profile.managerName || '미등록'}</span>}</label>
          <label>연락처{editing ? <input name="managerPhone" type="tel" autoComplete="tel" required maxLength={20} pattern="\+?[0-9][0-9\(\)\-\s]{6,17}[0-9]" value={draft.managerPhone ?? ''} onChange={(event) => setDraft({ ...draft, managerPhone: event.target.value })} /> : <span>{profile.managerPhone || '미등록'}</span>}</label>
          <label className="mypage-field-wide">이메일{editing ? <input name="email" type="email" autoComplete="email" required maxLength={254} value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /> : <span>{profile.email}</span>}</label>
        </div>
        <div className="mypage-form-footer"><p>{editing ? '수정 내용은 이번 접속에서만 반영됩니다.' : '로그인 계정과 소속 권한은 변경되지 않습니다.'}</p><div>{editing ? <><button className="sa-button" type="button" onClick={() => { setDraft(profile); setEditing(false) }}><X size={15} />취소</button><button className="sa-button sa-primary" type="submit"><Save size={15} />변경 내용 적용</button></> : <button className="sa-button" type="button" onClick={() => { setDraft(profile); setMessage(''); setEditing(true) }}><Pencil size={15} />정보 수정</button>}</div></div>
      </form>
      {message && <p className="mypage-feedback" role="status"><Check size={17} /><span>{message}</span></p>}
    </section>
    <section className="mypage-section" aria-labelledby="mypage-company-title"><div className="mypage-section-title"><h2 id="mypage-company-title"><Building2 size={17} />소속 고객사</h2><span>사업자 정보</span></div><dl className="mypage-company-fields">{[['고객사명', company?.name ?? user.companyName], ['사업자등록번호', company?.businessNumber], ['대표자', company?.representativeName], ['대표 연락처', company?.phone], ['사업장 주소', company?.address]].map(([label, value]) => <div key={label} className={label === '사업장 주소' ? 'mypage-field-wide' : undefined}><dt>{label}</dt><dd>{value || '미등록'}</dd></div>)}</dl><div className="mypage-company-footer"><span>고객사 정보·소속·권한 변경</span><a href="tel:0312981191">MRS 문의 <ArrowRight size={14} /></a></div></section>
  </>
}