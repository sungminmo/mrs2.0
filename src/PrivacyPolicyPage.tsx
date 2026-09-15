import { useEffect, useRef } from 'react'
import { ArrowLeft, Leaf } from 'lucide-react'
import './PrivacyPolicyPage.css'

export default function PrivacyPolicyPage() {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus(); window.scrollTo(0, 0) }, [])

  return <div className="privacy-policy-page">
    <header className="pp-header"><a className="pp-brand" href="#"><Leaf size={24} />MRS</a><a href="#/contact"><ArrowLeft size={16} />문의 화면으로</a></header>
    <main className="pp-main">
      <div className="pp-heading"><span>PRIVACY POLICY</span><h1 ref={heading} tabIndex={-1}>개인정보처리방침</h1><p>MRS는 서비스 문의에 필요한 최소한의 개인정보만 처리합니다.</p></div>
      <section className="pp-content" aria-label="개인정보처리방침 내용">
        <p className="pp-effective">시행일: 2026년 9월 15일</p>
        <article><h2>1. 개인정보의 수집 및 이용 목적</h2><p>MRS는 서비스 문의의 확인, 상담 및 회신을 위해 개인정보를 처리합니다.</p></article>
        <article><h2>2. 수집하는 개인정보 항목</h2><p>필수 항목: 성함, 회사명, 연락처, 문의내용</p><p>선택 항목: 이메일 주소</p></article>
        <article><h2>3. 개인정보의 보유 및 이용 기간</h2><p>현재 서비스 문의 화면은 시제품으로 운영되며, 입력한 개인정보를 서버에 수집하거나 저장하지 않습니다. 입력 내용은 화면을 벗어나거나 새로고침하면 초기화됩니다.</p><p>실제 문의 접수 서비스 운영 시 수집 주체와 보유·이용 기간은 운영 정책 확정 후 별도로 안내합니다.</p></article>
        <article><h2>4. 동의 거부 권리 및 불이익</h2><p>개인정보 수집·이용에 대한 동의를 거부할 수 있습니다. 다만, 필수 항목의 수집·이용에 동의하지 않으면 문의 작성 완료가 제한됩니다.</p></article>
        <article><h2>5. 문의</h2><p>개인정보 처리에 관한 문의는 <a href="tel:0312981191">031-298-1191</a>로 연락해 주세요.</p></article>
      </section>
    </main>
    <footer className="pp-footer">MRS · Material Recycling Service</footer>
  </div>
}