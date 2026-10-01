import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Plus, RefreshCw, Save, Search } from 'lucide-react'
import { adminAccountRequest, adminRoleLabels, type AdminRole } from '../adminAuthSession'
import { jsonRequest } from '../customerAccounts'
import AdminPagination, { LoadingTable, type Pagination } from './AdminPagination'

type Account = { id: string; email: string; managerName: string; managerPhone: string; adminRole: AdminRole | null; status: 'ACTIVE' | 'SUSPENDED'; sessionVersion: number; createdAt: string }
const base = '#/admin/accounts?tab=list'

export default function AdminAccountManager({ params }: { params: URLSearchParams }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [revision, setRevision] = useState(0)
  const [loadedKey, setLoadedKey] = useState('')
  const [pagination, setPagination] = useState<Pagination>({ page: 1, rows: 25, total: 0 })
  const [pageState, setPageState] = useState({ scope: '', page: 1 })
  const [rows, setRows] = useState(25)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const filterScope = `${query}/${role}/${status}`
  const page = pageState.scope === filterScope ? pageState.page : 1
  const setPage = (next: number) => setPageState({ scope: filterScope, page: next })
  const creating = params.get('mode') === 'new'
  const id = params.get('id')
  const account = accounts.find((entry) => entry.id === id)
  const loadKey = `${revision}/${id}/${page}/${rows}/${query}/${role}/${status}`
  const loading = loadKey !== loadedKey
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
    const search = new URLSearchParams({ page: String(page), rows: String(rows), q: query, role, status })
    if (id) search.set('id', id)
    adminAccountRequest<{ accounts: Account[]; pagination: Pagination }>(`/api/admin/accounts?${search}`, { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) { setAccounts(data.accounts); setPagination(data.pagination); setError('') }
    }).catch((reason) => {
      if (!controller.signal.aborted) { setAccounts([]); setError(reason instanceof Error ? reason.message : '관리자 목록을 불러오지 못했습니다.') }
    }).finally(() => { if (!controller.signal.aborted) setLoadedKey(loadKey) })
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [revision, id, page, rows, query, role, status, loadKey])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const password = String(data.get('password') ?? '')
    if (password !== String(data.get('confirmation') ?? '')) { setError('비밀번호 확인이 일치하지 않습니다.'); return }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await adminAccountRequest(creating ? '/api/admin/accounts' : `/api/admin/accounts/${account!.id}`, jsonRequest(creating ? 'POST' : 'PATCH', {
        name: data.get('name'), phone: data.get('phone'), adminRole: data.get('adminRole'), status: data.get('status'), reason: data.get('reason'),
        ...(creating ? { loginId: data.get('loginId'), password } : { version: account!.sessionVersion, ...(password ? { password } : {}) }),
      }))
      setMessage(creating ? '관리자 계정이 생성되었습니다.' : '변경 사항이 저장되었습니다.')
      setRevision((value) => value + 1)
      window.location.hash = base
    } catch (reason) { setError(reason instanceof Error ? reason.message : '저장에 실패했습니다.') }
    finally { setSaving(false) }
  }
  const visible = accounts
  return <div className="adm-customer-manager">
    {error && <p className="adm-form-error" role="alert">{error}</p>}
    {message && <p className="adm-note" role="status">{message}</p>}
    {loading && (creating || id) ? <LoadingTable /> : creating || id ? <>
      <a href={base} className="adm-button"><ArrowLeft size={16} />목록으로</a>
      {creating || account ? <form key={`${account?.id ?? 'new'}/${account?.sessionVersion}`} className="adm-edit-form" onSubmit={submit}>
        <h2>{creating ? '관리자 계정 생성' : '관리자 계정 편집'}</h2>
        <fieldset className="customer-fieldset" disabled={saving}><div className="adm-edit-fields">
          <label>아이디<input name="loginId" required maxLength={254} minLength={3} pattern="[a-zA-Z0-9@._\-]+" defaultValue={account?.email ?? ''} readOnly={!creating} autoComplete="off" /></label>
          <label>이름<input name="name" required maxLength={80} defaultValue={account?.managerName ?? ''} /></label>
          <label>연락처<input name="phone" type="tel" maxLength={30} defaultValue={account?.managerPhone ?? ''} /></label>
          <label>권한<select name="adminRole" required defaultValue={account?.adminRole ?? 'ADMIN'}>{Object.entries(adminRoleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label>상태<select name="status" defaultValue={account?.status ?? 'ACTIVE'}><option value="ACTIVE">이용 중</option><option value="SUSPENDED">이용 정지</option></select></label>
          <label>{creating ? '비밀번호' : '새 비밀번호'}<input name="password" type="password" required={creating} minLength={8} maxLength={128} autoComplete="new-password" /></label>
          <label>비밀번호 확인<input name="confirmation" type="password" required={creating} minLength={8} maxLength={128} autoComplete="new-password" /></label>
        </div><label className="customer-reason">처리 사유<textarea name="reason" required rows={3} maxLength={500} /></label>
        <div className="adm-edit-footer"><button className="adm-button adm-primary"><Save size={16} />{saving ? '저장 중...' : creating ? '계정 생성' : '변경 저장'}</button></div></fieldset>
      </form> : <p role="status">관리자 계정을 찾을 수 없습니다.</p>}
    </> : <>
      <div className="adm-management-actions"><div className="customer-list-filters"><label><Search size={16} /><input aria-label="관리자 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="아이디 · 이름 · 연락처" /></label>
        <select aria-label="권한 필터" value={role} onChange={(event) => setRole(event.target.value)}><option value="">전체 권한</option>{Object.entries(adminRoleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
        <select aria-label="상태 필터" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">전체 상태</option><option value="ACTIVE">이용 중</option><option value="SUSPENDED">이용 정지</option></select></div>
        <div className="adm-management-buttons"><button className="adm-icon" title="새로고침" aria-label="새로고침" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={16} /></button><a className="adm-button adm-primary" href={`${base}&mode=new`}><Plus size={16} />관리자 생성</a></div></div>
      <div className="adm-list-heading"><h2>관리자 목록 <span>{pagination.total}건</span></h2></div>
      {loading ? <LoadingTable /> : <>
      <div className="customer-table-scroll" tabIndex={0} role="region" aria-label="관리자 계정 목록"><table className="adm-table"><thead><tr>{['아이디', '이름', '연락처', '권한', '상태', '등록일'].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{visible.map((entry) => <tr key={entry.id}><td><a href={`${base}&id=${entry.id}`}>{entry.email}</a></td><td>{entry.managerName}</td><td>{entry.managerPhone || '미등록'}</td><td>{entry.adminRole ? adminRoleLabels[entry.adminRole] : '미설정'}</td><td>{entry.status === 'ACTIVE' ? '이용 중' : '이용 정지'}</td><td>{new Date(entry.createdAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</td></tr>)}</tbody></table></div>
      {!visible.length && <p role="status">조건에 맞는 관리자 계정이 없습니다.</p>}
      </>}
      <AdminPagination pagination={{ ...pagination, page, rows }} loading={loading} onChange={(next, size) => { setPage(next); setRows(size) }} />
    </>}
  </div>
}