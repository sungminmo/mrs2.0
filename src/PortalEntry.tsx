import { lazy, Suspense, useSyncExternalStore } from 'react'
import App from './App'

const AdminPortal = lazy(() => import('./admin/AdminPortal'))
const subscribe = (listener: () => void) => {
  window.addEventListener('hashchange', listener)
  return () => window.removeEventListener('hashchange', listener)
}
const getHash = () => window.location.hash

export default function PortalEntry() {
  const hash = useSyncExternalStore(subscribe, getHash, () => '')
  return /^#\/admin(?:[/?]|$)/.test(hash)
    ? <Suspense fallback={<p role="status">관리자 화면 불러오는 중...</p>}><AdminPortal hash={hash} /></Suspense>
    : <App />
}