import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react'
import App from './App'

const ServiceInquiryPage = lazy(() => import('./ServiceInquiryPage'))
const PrivacyPolicyPage = lazy(() => import('./PrivacyPolicyPage'))
const RegistrationPage = lazy(() => import('./RegistrationPage'))
const subscribe = (listener: () => void) => {
  window.addEventListener('hashchange', listener)
  return () => window.removeEventListener('hashchange', listener)
}
const getHash = () => window.location.hash

export default function PortalEntry() {
  const hash = useSyncExternalStore(subscribe, getHash, () => '')
  if (/^#\/admin(?:[/?]|$)/.test(hash)) return <LegacyAdminRedirect hash={hash} />
  if (hash === '#/contact') return <Suspense fallback={<p role="status">문의 화면 불러오는 중...</p>}><ServiceInquiryPage /></Suspense>
  if (hash === '#/privacy') return <Suspense fallback={<p role="status">개인정보처리방침 불러오는 중...</p>}><PrivacyPolicyPage /></Suspense>
  if (hash === '#/register') return <Suspense fallback={<p role="status">회원가입 화면 불러오는 중...</p>}><RegistrationPage /></Suspense>
  return <App />
}

function LegacyAdminRedirect({ hash }: { hash: string }) {
  useEffect(() => { window.location.replace(`/admin/${hash}`) }, [hash])
  return <p role="status">관리자 화면으로 이동 중...</p>
}