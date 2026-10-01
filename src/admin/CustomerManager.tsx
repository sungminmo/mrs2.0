import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Check, Plus, RefreshCw, Save, Search } from 'lucide-react'
import { accountStatus, jsonRequest, type CustomerAccount, type CustomerApplication, type CustomerFields, type CustomerMember } from '../customerAccounts'
import { adminAccountRequest } from '../adminAuthSession'

const fieldDefinitions = [['name', '고객사명', 160], ['businessNumber', '사업자등록번호', 12], ['representativeName', '대표자명', 80], ['phone', '대표 연락처', 30], ['address', '사업장 주소', 500]] as const
const labels = { approve: '소속 승인', reject: '반려', suspend: '이용 정지', reactivate: '이용 복구', role: '권한 변경', reassign: '소속 재심사', reopen: '재검토' }
type MemberAction = keyof typeof labels

export default function CustomerManager({ params, membersOnly = false, onChanged }: { params: URLSearchParams; membersOnly?: boolean; onChanged: () => void }) {
  const [customers, setCustomers] = useState<CustomerAccount[]>([])
  const [members, setMembers] = useState<CustomerMember[]>([])
  const [applications, setApplications] = useState<CustomerApplication[]>([])
  const [detail, setDetail] = useState<CustomerAccount | null>(null)
  const [revision, setRevision] = useState(0)
  const [loadedKey, setLoadedKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const id = params.get('id')
  const creating = !membersOnly && params.get('mode') === 'new'
  const applicationMode = !membersOnly && params.get('tab') === 'applications'
  const loadKey = `${revision}/${id}/${membersOnly}/${applicationMode}`
  const loading = loadedKey !== loadKey
  const base = membersOnly ? `#/admin/members?tab=${params.get('tab') === 'applications' ? 'applications' : 'list'}` : `#/admin/customers?tab=${applicationMode ? 'applications' : 'companies'}`
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      adminAccountRequest<{ customers: CustomerAccount[] }>('/api/admin/customers', { signal: controller.signal }),
      adminAccountRequest<{ members: CustomerMember[] }>('/api/admin/members', { signal: controller.signal }),
      adminAccountRequest<{ applications: CustomerApplication[] }>('/api/admin/customer-applications', { signal: controller.signal }),
      id && !membersOnly && !applicationMode ? adminAccountRequest<{ customer: CustomerAccount }>(`/api/admin/customers/${encodeURIComponent(id)}`, { signal: controller.signal }) : Promise.resolve(null),
    ]).then(([companyData, memberData, applicationData, detailData]) => {
      if (controller.signal.aborted) return
      setError('')
      setCustomers(companyData.customers)
      setMembers(memberData.members.filter((member) => member.role === 'CUSTOMER'))
      setApplications(applicationData.applications)
      setDetail(detailData?.customer ?? null)
    }).catch((reason) => { if (!controller.signal.aborted) { setCustomers([]); setMembers([]); setApplications([]); setDetail(null); setError(reason instanceof Error ? reason.message : '조회에 실패했습니다.') } }).finally(() => { if (!controller.signal.aborted) setLoadedKey(loadKey) })
    return () => controller.abort()
  }, [revision, id, membersOnly, applicationMode, loadKey])

  async function run(path: string, method: string, data: unknown) {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await adminAccountRequest(path, jsonRequest(method, data))
      setMessage('저장되었습니다.')
      setRevision((value) => value + 1)
      onChanged()
      if (creating) window.location.hash = base
    } catch (reason) { setError(reason instanceof Error ? reason.message : '처리에 실패했습니다.') } finally { setSaving(false) }
  }

  const member = members.find((entry) => entry.id === id)
  const application = applications.find((entry) => entry.id === id)
  const company = detail ?? customers.find((entry) => entry.id === id)
  const matches = (text: string, value: string) => (!status || value === status) && text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  return <div className="adm-customer-manager">
    {error && <p className="adm-form-error" role="alert">{error}</p>}
    {message && <p className="adm-note" role="status">{message}</p>}
    {loading ? <p role="status">불러오는 중...</p> : id || creating ? <>
      <a className="adm-button" href={base}><ArrowLeft size={16} />목록으로</a>
      {membersOnly && member ? <>
        <section className="adm-detail-section"><h2>{member.managerName}</h2><dl className="customer-facts">{[['이메일', member.email], ['연락처', member.managerPhone], ['고객사', member.companyName], ['고객사 코드', member.customerId ?? '미연결'], ['상태', accountStatus[member.status]], ['권한', member.customerRole === 'MANAGER' ? '고객사 관리자' : '조회자']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{member.customerApplication && <a className="adm-button" href={`#/admin/customers?tab=applications&id=${member.customerApplication.id}`}>고객사 등록 신청</a>}</section>
        <MemberForm key={`${member.id}/${member.sessionVersion}`} member={member} customers={customers} saving={saving} onSubmit={(data) => run(`/api/admin/members/${member.id}/actions`, 'POST', data)} />
      </> : applicationMode && application ? <>
        <section className="adm-detail-section"><h2>{application.name}</h2><p>{accountStatus[application.status]} · {application.user.managerName} · {application.user.email}</p><p>{application.user.managerPhone}</p>{application.reviewReason && <p>검토 사유: {application.reviewReason}</p>}</section>
        <ApplicationForm key={`${application.id}/${application.version}`} application={application} customers={customers} saving={saving} onSubmit={(data) => run(`/api/admin/customer-applications/${application.id}/review`, 'POST', data)} />
      </> : !membersOnly && !applicationMode && (company || creating) ? <>
        <form key={`${company?.id ?? 'new'}/${company?.version}`} className="adm-edit-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void run(creating ? '/api/admin/customers' : `/api/admin/customers/${company!.id}`, creating ? 'POST' : 'PATCH', { ...readFields(data), reason: data.get('reason'), ...(!creating ? { version: company!.version } : {}) }) }}>
          <h2>{creating ? '고객사 등록' : `${company!.name} · ${accountStatus[company!.status]}`}</h2>
          <fieldset disabled={saving} className="customer-fieldset"><CompanyFields fields={creating ? undefined : company} immutableNumber={!!company?.businessNumber} /><Reason /><div className="adm-edit-footer"><button className="adm-button adm-primary"><Save size={16} />{saving ? '저장 중' : '저장'}</button></div></fieldset>
        </form>
        {!creating && company && <>
          <form className="adm-edit-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void run(`/api/admin/customers/${company.id}/${company.status === 'ACTIVE' ? 'suspend' : 'reactivate'}`, 'POST', { reason: data.get('reason'), version: company.version }) }}>
            <h2>{company.status === 'ACTIVE' ? '고객사 이용 정지' : company.status === 'PENDING' ? '고객사 확인 및 활성화' : '고객사 이용 복구'}</h2><fieldset disabled={saving} className="customer-fieldset"><Reason /><button className="adm-button" disabled={saving}><Check size={16} />{company.status === 'ACTIVE' ? '전체 소속 회원 접근 정지' : '확인 후 활성화'}</button></fieldset>
          </form>
          <section className="adm-detail-section"><h2>연결 내역</h2><div className="adm-related"><a href={`#/admin/inventory?tab=stock&customer=${encodeURIComponent(company.id)}`}>자산 {company._count?.assets ?? 0}건</a>{members.filter((entry) => entry.customerId === company.id).map((entry) => <a key={entry.id} href={`#/admin/members?tab=list&id=${entry.id}`}>{entry.managerName} · {accountStatus[entry.status]}</a>)}</div></section>
          <section className="adm-detail-section"><h2>변경 이력</h2>{!company.changes?.length && <p>기록이 없습니다.</p>}{company.changes?.map((entry) => <details key={entry.id}><summary>{new Date(entry.createdAt).toLocaleString('ko-KR')} · {entry.action} · {entry.reason}</summary><p>처리자: {entry.actorUserId}</p><pre>{JSON.stringify(entry.changes, null, 2)}</pre></details>)}</section>
        </>}
      </> : <p role="status">내역을 찾을 수 없습니다.</p>}
    </> : <>
      <div className="adm-management-actions"><div className="customer-list-filters"><label><Search size={16} /><input aria-label="고객사 및 회원 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름 · 사업자번호 · 이메일" /></label><select aria-label="이용 상태" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">전체 상태</option>{Object.entries(accountStatus).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="adm-management-buttons"><button className="adm-icon" title="새로고침" aria-label="새로고침" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={16} /></button>{!membersOnly && !applicationMode && <a className="adm-button adm-primary" href={`${base}&mode=new`}><Plus size={16} />고객사 등록</a>}</div></div>
      <div className="customer-table-scroll"><table className="adm-table"><thead><tr>{(membersOnly ? ['담당자', '고객사', '이메일', '권한', '상태'] : applicationMode ? ['고객사', '사업자번호', '신청인', '상태'] : ['고객사', '고객사 코드', '사업자번호', '회원', '자산', '상태']).map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>
        {membersOnly ? members.filter((entry) => (params.get('tab') !== 'applications' || entry.status === 'PENDING') && matches(`${entry.managerName} ${entry.companyName} ${entry.email}`, entry.status)).map((entry) => <tr key={entry.id}><td><a href={`${base}&id=${entry.id}`}>{entry.managerName}</a></td><td>{entry.companyName}</td><td>{entry.email}</td><td>{entry.customerRole === 'MANAGER' ? '관리자' : '조회자'}</td><td>{accountStatus[entry.status]}</td></tr>)
          : applicationMode ? applications.filter((entry) => matches(`${entry.name} ${entry.businessNumber} ${entry.user.email}`, entry.status)).map((entry) => <tr key={entry.id}><td><a href={`${base}&id=${entry.id}`}>{entry.name}</a></td><td>{entry.businessNumber}</td><td>{entry.user.managerName}</td><td>{accountStatus[entry.status]}</td></tr>)
            : customers.filter((entry) => matches(`${entry.name} ${entry.businessNumber ?? ''} ${entry.id}`, entry.status)).map((entry) => <tr key={entry.id}><td><a href={`${base}&id=${entry.id}`}>{entry.name}</a></td><td>{entry.id}</td><td>{entry.businessNumber ?? '미확인'}</td><td>{entry._count?.users ?? 0}</td><td>{entry._count?.assets ?? 0}</td><td>{accountStatus[entry.status]}</td></tr>)}
      </tbody></table></div>
    </>}
  </div>
}

function CompanyFields({ fields, immutableNumber = false }: { fields?: Partial<Omit<CustomerFields, 'businessNumber'> & { businessNumber: string | null }>; immutableNumber?: boolean }) {
  return <div className="adm-edit-fields">{fieldDefinitions.map(([name, label, max]) => <label key={name}>{label}<input name={name} required maxLength={max} defaultValue={fields?.[name] ?? ''} readOnly={name === 'businessNumber' && immutableNumber} /></label>)}</div>
}
function readFields(data: FormData): CustomerFields {
  return { name: String(data.get('name')), businessNumber: String(data.get('businessNumber')), representativeName: String(data.get('representativeName')), phone: String(data.get('phone')), address: String(data.get('address')) }
}
function Reason() {
  return <label className="customer-reason">확인 근거 및 처리 사유<textarea name="reason" required maxLength={500} rows={3} /></label>
}
function MemberForm({ member, customers, saving, onSubmit }: { member: CustomerMember; customers: CustomerAccount[]; saving: boolean; onSubmit: (data: unknown) => Promise<void> }) {
  const available: MemberAction[] = member.status === 'PENDING' ? ['approve', 'reject', 'reassign'] : member.status === 'ACTIVE' ? ['role', 'suspend', 'reassign'] : member.status === 'SUSPENDED' ? ['reactivate', 'reassign'] : ['reopen']
  const [action, setAction] = useState<MemberAction>(available[0])
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); void onSubmit({ action, version: member.sessionVersion, customerRole: data.get('customerRole') ?? member.customerRole, reason: data.get('reason'), ...(action === 'reassign' ? { customerId: data.get('customerId') } : {}) }) }
  return <form className="adm-edit-form" onSubmit={submit}><h2>회원 승인 및 권한</h2><fieldset className="customer-fieldset" disabled={saving}><div className="adm-edit-fields"><label>처리<select value={action} onChange={(event) => setAction(event.target.value as MemberAction)}>{available.map((value) => <option key={value} value={value}>{labels[value]}</option>)}</select></label>
    {['approve', 'reactivate', 'role'].includes(action) && <label>고객사 내 권한<select name="customerRole" defaultValue={member.customerRole}><option value="VIEWER">조회자</option><option value="MANAGER">고객사 관리자</option></select></label>}
    {action === 'reassign' && <label>재심사 고객사<select name="customerId" required defaultValue=""><option value="">고객사 선택</option>{customers.filter((entry) => entry.status === 'ACTIVE').map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.businessNumber}</option>)}</select></label>}</div>
    <Reason /><div className="adm-edit-footer"><button className="adm-button adm-primary"><Check size={16} />{saving ? '처리 중' : `${labels[action]} 확정`}</button></div></fieldset></form>
}
function ApplicationForm({ application, customers, saving, onSubmit }: { application: CustomerApplication; customers: CustomerAccount[]; saving: boolean; onSubmit: (data: unknown) => Promise<void> }) {
  const [action, setAction] = useState(application.status === 'REJECTED' ? 'reopen' : 'approve')
  if (application.status === 'APPROVED') return <a className="adm-button" href={`#/admin/members?tab=applications&id=${application.userId}`}>회원 소속 승인</a>
  return <form className="adm-edit-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void onSubmit({ action, reason: data.get('reason'), version: application.version, fields: readFields(data), ...(data.get('customerId') ? { customerId: data.get('customerId') } : {}) }) }}><h2>고객사 신청 심사</h2><fieldset className="customer-fieldset" disabled={saving}><CompanyFields fields={application} /><div className="adm-edit-fields"><label>처리<select value={action} onChange={(event) => setAction(event.target.value)}>{application.status === 'REJECTED' ? <option value="reopen">수정 후 재검토</option> : <><option value="approve">고객사 승인</option><option value="reject">반려</option></>}</select></label><label>기존 고객사 연결<select name="customerId" defaultValue=""><option value="">신규 고객사 생성</option>{customers.filter((entry) => entry.status === 'ACTIVE').map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.businessNumber}</option>)}</select></label></div><Reason /><div className="adm-edit-footer"><button className="adm-button adm-primary"><Check size={16} />{saving ? '처리 중' : '심사 확정'}</button></div></fieldset></form>
}