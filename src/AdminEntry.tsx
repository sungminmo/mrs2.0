import { lazy, Suspense, useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import { adminAuthenticatedFetch, adminSignIn, readAdminSession, type AdminRole } from './adminAuthSession'
import './AdminEntry.css'

const AdminPortal = lazy(() => import('./admin/AdminPortal'))
const subscribe = (listener: () => void) => {
  window.addEventListener('hashchange', listener)
  return () => window.removeEventListener('hashchange', listener)
}

export default function AdminEntry() {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => '')
  const [session, setSession] = useState(readAdminSession)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [verifiedToken, setVerifiedToken] = useState<string | null>(null)
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null)

  useEffect(() => {
    const expired = () => { setSession(null); setVerifiedToken(null) }
    window.addEventListener('mrs-admin-auth-expired', expired)
    return () => window.removeEventListener('mrs-admin-auth-expired', expired)
  }, [])

  useEffect(() => {
    if (!session) return
    const controller = new AbortController()
    adminAuthenticatedFetch('/api/admin/auth/me', { signal: controller.signal }).then(async (response) => {
      const body = await response.json()
      if (!response.ok || body.data?.user?.role !== 'ADMIN') throw new Error('관리자 인증을 확인할 수 없습니다. 다시 로그인해 주세요.')
      if (!controller.signal.aborted) { setAdminRole(body.data.user.adminRole ?? null); setVerifiedToken(session.accessToken) }
    }).catch((reason) => {
      if (!controller.signal.aborted) { setSession(null); setVerifiedToken(null); setError(reason instanceof Error ? reason.message : '관리자 인증에 실패했습니다.') }
    })
    return () => controller.abort()
  }, [session])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setSubmitting(true)
    setError('')
    try { setSession(await adminSignIn(String(data.get('id')), String(data.get('password')))) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '관리자 로그인에 실패했습니다.') }
    finally { setSubmitting(false) }
  }

  if (!session) return <main className="admin-login"><form onSubmit={submit}><span>MRS OPERATIONS</span><h1>관리자 로그인</h1><p>MRS에서 생성한 관리자 계정만 사용할 수 있습니다.</p><label>관리자 아이디<input name="id" autoComplete="username" required disabled={submitting} /></label><label>비밀번호<input name="password" type="password" autoComplete="current-password" required disabled={submitting} /></label><button disabled={submitting}>{submitting ? '확인 중...' : '로그인'}</button>{error && <p role="alert">{error}</p>}</form></main>
  if (verifiedToken !== session.accessToken) return <main className="admin-login" role="status">관리자 권한 확인 중...</main>
  return <Suspense fallback={<main className="admin-login" role="status">관리 메뉴 불러오는 중...</main>}><AdminPortal hash={hash || '#/admin/dashboard'} adminRole={adminRole} /></Suspense>
}