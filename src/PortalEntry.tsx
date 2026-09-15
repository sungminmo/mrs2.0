import { lazy, Suspense, useSyncExternalStore } from 'react'
import App from './App'

const AdminPortal = lazy(() => import('./admin/AdminPortal'))
const ServiceInquiryPage = lazy(() => import('./ServiceInquiryPage'))
const PrivacyPolicyPage = lazy(() => import('./PrivacyPolicyPage'))
const subscribe = (listener: () => void) => {
  window.addEventListener('hashchange', listener)
  return () => window.removeEventListener('hashchange', listener)
}
const getHash = () => window.location.hash

export default function PortalEntry() {
  const hash = useSyncExternalStore(subscribe, getHash, () => '')
  if (hash === '#/contact') return <Suspense fallback={<p role="status">문의 화면 불러오는 중...</p>}><ServiceInquiryPage /></Suspense>
  if (hash === '#/privacy') return <Suspense fallback={<p role="status">개인정보처리방침 불러오는 중...</p>}><PrivacyPolicyPage /></Suspense>
  return /^#\/admin(?:[/?]|$)/.test(hash)
    ? <Suspense fallback={<p role="status">관리자 화면 불러오는 중...</p>}><AdminPortal hash={hash} /></Suspense>
    : <App />
}