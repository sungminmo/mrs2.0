import { useEffect, useSyncExternalStore } from 'react'
import AdminPortal from './admin/AdminPortal'
import { readAuthSession } from './authSession'

const subscribe = (listener: () => void) => {
  window.addEventListener('hashchange', listener)
  return () => window.removeEventListener('hashchange', listener)
}

export default function AdminEntry() {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => '')
  const isAdmin = readAuthSession()?.user.role === 'ADMIN'

  useEffect(() => {
    if (!isAdmin) window.location.replace('/mrs2.0/')
  }, [isAdmin])

  if (!isAdmin) return <p role="status">관리자 로그인이 필요합니다. 로그인 화면으로 이동합니다.</p>
  return <AdminPortal hash={hash || '#/admin/dashboard'} />
}