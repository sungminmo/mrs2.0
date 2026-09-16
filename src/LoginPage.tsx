import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, Eye, EyeOff, Leaf, LogIn, MessageSquare, Phone, ReceiptText, ShoppingBag, Warehouse, X } from 'lucide-react'
import './LoginPage.css'

const valueMetrics = [
  { label: '등록 자재 가치', value: 6104000, description: '남은 자재를 관리 가능한 자산으로' },
  { label: '보관 자산 가치', value: 2234000, description: '다음 사용을 위해 보관하는 가치' },
  { label: '판매 중 자산 가치', value: 3480000, description: '새로운 수요와 연결 중인 가치' },
  { label: '누적 판매 수익', value: 4120000, description: '자재 거래를 통해 회수한 수익' },
]

function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const distance = document.documentElement.scrollHeight - window.innerHeight
      const progress = distance > 0 ? Math.min(1, Math.max(0, window.scrollY / distance)) : 0
      if (bar.current) {
        bar.current.style.transform = `scaleX(${progress})`
        bar.current.parentElement?.setAttribute('aria-valuenow', String(Math.round(progress * 100)))
      }
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    const observer = new ResizeObserver(schedule)
    observer.observe(document.body)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    update()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [])
  return <div className="login-scroll-progress" role="progressbar" aria-label="페이지 스크롤 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}><div ref={bar} /></div>
}

function MaterialValueGrid() {
  const section = useRef<HTMLElement>(null)
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let started = false
    const finish = () => { cancelAnimationFrame(frame); setProgress(1) }
    const observer = new IntersectionObserver((entries) => {
      if (started || !entries.some((entry) => entry.isIntersecting)) return
      started = true
      observer.disconnect()
      if (motion.matches) { finish(); return }
      const start = performance.now()
      const tick = (time: number) => {
        const elapsed = Math.min(1, (time - start) / 1400)
        setProgress(1 - (1 - elapsed) ** 4)
        if (elapsed < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }, { threshold: 0.15 })
    const onMotionChange = () => { if (motion.matches) { started = true; observer.disconnect(); finish() } }
    if (motion.matches) finish()
    else if (section.current) observer.observe(section.current)
    motion.addEventListener('change', onMotionChange)
    return () => { cancelAnimationFrame(frame); observer.disconnect(); motion.removeEventListener('change', onMotionChange) }
  }, [])
  return <section ref={section} className="login-value-section" aria-labelledby="value-title"><div className="login-value-inner">
    <div className="login-section-heading" data-scroll-reveal><div><span className="login-eyebrow">VALUE IN CIRCULATION</span><h2 id="value-title">남겨진 자재에서,<br />다시 움직이는 자산으로.</h2></div><p>무엇이 얼마나 남았는지 아는 것부터 시작합니다.<br />MRS는 보관과 거래 정보를 연결해<br />재사용과 판매를 판단할 근거를 만듭니다.</p></div>
    <ol className="login-solution-flow">
      <li data-scroll-reveal><span>01 / 자산화</span><h3>흩어진 자재를 한눈에</h3><p>자재의 수량·상태·보관 위치를 기록하고 평가 가치를 확인합니다. 다시 쓸 자재와 판매할 자재를 구분할 수 있습니다.</p></li>
      <li data-scroll-reveal><span>02 / 수요 연결</span><h3>보관을 넘어 다음 현장으로</h3><p>판매할 자재는 검수와 관리자 승인 후 마켓에 등록합니다. 필요한 현장의 견적 요청을 통해 거래를 시작합니다.</p></li>
      <li data-scroll-reveal><span>03 / 가치 확인</span><h3>비용과 회수 금액을 함께</h3><p>로케이션별 보관 비용과 판매 정산 내역을 확인합니다. 계속 보관할지, 판매할지 판단할 정보를 모읍니다.</p></li>
    </ol>
    <h3 className="login-value-caption" data-scroll-reveal>자재의 흐름을 가치로 살펴보면 <span>활용 예시</span></h3>
    <dl className="login-value-grid">{valueMetrics.map((metric) => <div key={metric.label} data-scroll-reveal><dt>{metric.label}</dt><dd aria-label={`${metric.value.toLocaleString('ko-KR')}원`}><span aria-hidden="true"><small>₩</small><span className="login-value-number">{Math.round(metric.value * progress).toLocaleString('ko-KR')}</span></span></dd><p>{metric.description}</p></div>)}</dl>
    <p className="login-value-note" data-scroll-reveal>서비스 활용을 설명하기 위한 예시 데이터입니다. 실제 이용 실적이나 수익을 보장하지 않습니다. 누적 판매 수익은 자산 가치와 별도 지표입니다.</p>
  </div></section>
}

export default function LoginPage({ onLogin, onBrowse }: { onLogin: () => void; onBrowse: () => void }) {
  const [visible, setVisible] = useState(false)
  const [notice, setNotice] = useState('')
  const page = useRef<HTMLDivElement>(null)
  const loginDialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const targets = [...(page.current?.querySelectorAll<HTMLElement>('[data-scroll-reveal]') ?? [])]
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (motion.matches) { targets.forEach((target) => target.classList.add('is-revealed')); return }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-revealed')
        observer.unobserve(entry.target)
      })
    }, { threshold: 0.12, rootMargin: '0px 0px -32px' })
    targets.forEach((target) => observer.observe(target))
    return () => observer.disconnect()
  }, [])
  const openLogin = () => loginDialog.current?.showModal()
  const closeLogin = () => loginDialog.current?.close()
  return <div ref={page} className="login-page">
    <ScrollProgress />
    <header className="login-header"><a href="#" aria-label="MRS 홈"><Leaf size={24} />MRS <span>Material Recycling Service</span></a><nav aria-label="홈페이지 메뉴"><a href="#services">서비스 소개</a><button onClick={openLogin} aria-haspopup="dialog">로그인<ArrowRight size={15} /></button></nav></header>
    <main className="login-main">
      <section className="login-hero" aria-labelledby="home-title"><img className="login-hero-image" src="https://thumb.wikimedia.org/wikipedia/commons/thumb/5/59/A_bunch_of_rebar_up_close.jpg/1280px-A_bunch_of_rebar_up_close.jpg" alt="보관 중인 건설용 철근 자재" fetchPriority="high" /><div className="login-hero-inner"><span className="login-eyebrow">보관에서 거래까지, 자재의 새로운 순환</span><h1 id="home-title">MRS<span>건설자재 보관·거래 플랫폼</span></h1><p>현장에 남은 자재를 보관하고, 필요한 곳으로 연결합니다.<br />입고부터 판매와 정산까지 한곳에서 관리하세요.</p><div className="login-hero-actions"><button className="login-primary" onClick={onBrowse}>마켓 둘러보기<ArrowRight size={18} /></button><button className="login-hero-login" onClick={openLogin} aria-haspopup="dialog">로그인<LogIn size={17} /></button></div><a className="login-hero-more" href="#services">MRS 제공 서비스<ArrowDown size={16} /></a></div></section>
      <section id="material-challenges" className="login-problem-section" aria-labelledby="problem-title"><div className="login-problem-inner">
        <div className="login-section-heading" data-scroll-reveal><div><span className="login-eyebrow">AFTER THE PROJECT</span><h2 id="problem-title">공사는 끝났는데,<br />남은 자재는 어디로 가나요?</h2></div><p>다시 쓸 수 있는 자재도 관리가 끊기면 짐이 됩니다.<br />현장을 정리하는 순간, 다음 고민이 시작됩니다.</p></div>
        <div className="login-problem-grid">
          <article data-scroll-reveal><span>보관 공간</span><h3>일단 쌓아두면,<br />얼마나 더 보관해야 할까요?</h3><p>다음 사용 일정은 불확실한데 보관 공간은 계속 필요합니다. 어느 위치를 얼마나 점유하는지 모르면 비용을 판단하기도 어렵습니다.</p></article>
          <article data-scroll-reveal><span>재고 파악</span><h3>어디에, 얼마나,<br />어떤 상태로 남아 있을까요?</h3><p>현장과 담당자마다 흩어진 기록으로는 남은 수량과 상태를 확인하기 어렵습니다. 쓸 수 있는 자재를 놓치고 새로 구매할 수도 있습니다.</p></article>
          <article data-scroll-reveal><span>처분 판단</span><h3>다시 쓸 수 있는데,<br />처분만이 답일까요?</h3><p>필요한 수요처를 찾지 못하면 판매도 미뤄집니다. 자재의 가치와 보관 비용을 함께 알아야 재사용·판매·처분을 비교할 수 있습니다.</p></article>
        </div>
        <p className="login-problem-bridge" data-scroll-reveal>남은 자재를 없애는 일보다, <strong>다음 쓰임을 찾는 관리가 먼저입니다.</strong><ArrowDown size={20} aria-hidden="true" /></p>
      </div></section>
      <MaterialValueGrid />
      <section id="services" className="login-services" aria-labelledby="services-title"><div className="login-section-heading" data-scroll-reveal><div><span className="login-eyebrow">OUR SERVICES</span><h2 id="services-title">현장의 고민을 덜어줄 세 가지 서비스</h2></div><p>보관 현황을 파악하고, 필요한 현장과 연결하고,<br />거래 이후의 정산까지 이어갑니다.</p></div><div className="login-service-grid">
        <article className="login-service-card" data-scroll-reveal><div className="login-service-top"><Warehouse size={25} /><span>01 / STORAGE</span></div><h3>자재 보관·자산 관리</h3><p>흩어진 재고 기록을 자재별로 모으세요. 수량·상태와 보관 위치를 확인해 재사용과 판매 계획을 세울 수 있습니다.</p><ul><li>자재별 재고와 평가 가치</li><li>로케이션별 점유 현황</li><li>보관·판매·검수 상태 관리</li></ul><button onClick={openLogin} aria-haspopup="dialog">내 자산 관리하기<ArrowRight size={17} /></button></article>
        <article className="login-service-card" data-scroll-reveal><div className="login-service-top"><ShoppingBag size={25} /><span>02 / MARKET</span></div><h3>자재 거래·마켓</h3><p>남은 자재가 필요한 현장을 만날 수 있도록 판매를 준비하세요. 구매자는 자재와 품질 등급을 비교하고 견적을 요청할 수 있습니다.</p><ul><li>검수 및 승인 후 판매 등록</li><li>품질 등급별 자재 탐색</li><li>상품·장바구니 견적 요청</li></ul><button onClick={onBrowse}>마켓 둘러보기<ArrowRight size={17} /></button></article>
        <article className="login-service-card" data-scroll-reveal><div className="login-service-top"><ReceiptText size={25} /><span>03 / SETTLEMENT</span></div><h3>보관 비용·판매 정산</h3><p>보관에 든 비용과 판매로 회수한 금액을 함께 살펴보세요. 거래별 명세를 확인하고 다음 자재 운영 계획에 활용할 수 있습니다.</p><ul><li>판매 수익과 비용 내역</li><li>로케이션 단위 보관료 명세</li><li>기간별 조회와 내역 다운로드</li></ul><button onClick={openLogin} aria-haspopup="dialog">정산 관리 시작하기<ArrowRight size={17} /></button></article>
      </div></section>
      <dialog ref={loginDialog} className="login-dialog" aria-labelledby="login-dialog-title" onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); closeLogin() } }} onCancel={(event) => { event.preventDefault(); closeLogin() }} onClose={() => { loginDialog.current?.querySelector('form')?.reset(); setVisible(false); setNotice('') }}><button type="button" className="login-dialog-close" aria-label="로그인 닫기" onClick={closeLogin}><X size={20} /></button><div className="login-form-inner"><span className="login-eyebrow">MRS 고객포탈</span><h2 id="login-dialog-title">로그인</h2><p>자재와 거래 현황을 한곳에서 관리하세요.</p>
        <form onSubmit={(event) => { event.preventDefault(); onLogin() }}>
          <label>아이디 (이메일)<input type="email" name="email" autoComplete="username" placeholder="name@company.com" /></label>
          <label>비밀번호<span className="login-password"><input type={visible ? 'text' : 'password'} name="password" autoComplete="current-password" placeholder="비밀번호 입력" /><button type="button" aria-label={visible ? '비밀번호 숨기기' : '비밀번호 표시'} title={visible ? '비밀번호 숨기기' : '비밀번호 표시'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
          <div className="login-links"><button type="button" onClick={() => setNotice('아이디 찾기는 계정 서비스 연결 후 이용할 수 있습니다.')}>아이디 찾기</button><button type="button" onClick={() => setNotice('비밀번호 찾기는 계정 서비스 연결 후 이용할 수 있습니다.')}>비밀번호 찾기</button></div>
          <button type="submit" className="login-primary"><LogIn size={17} />로그인</button>
        </form>
        <button className="login-browse" onClick={onBrowse}>둘러보기<ArrowRight size={17} /></button>
        <div className="login-register">아직 회원이 아니신가요? <button onClick={() => setNotice('회원가입은 계정 서비스 연결 후 이용할 수 있습니다.')}>회원가입</button></div>
        <p className="login-demo">시제품에서는 계정 입력 없이 로그인할 수 있습니다. 입력한 비밀번호는 저장하거나 전송하지 않습니다.</p>
        {notice && <div className="login-notice" role="status"><span>{notice}</span><button aria-label="안내 닫기" onClick={() => setNotice('')}><X size={16} /></button></div>}
      </div></dialog>
      <section id="contact" className="login-contact-section" aria-labelledby="contact-title"><div className="login-contact-inner">
        <span className="login-eyebrow" data-scroll-reveal>CONTACT US</span>
        <h2 id="contact-title" data-scroll-reveal>우리 현장에 맞는 활용 방법,<br />함께 알아보세요</h2>
        <p className="login-contact-description" data-scroll-reveal>보관할 자재의 종류와 수량, 마켓 판매 계획, 서비스 도입 범위 등 궁금한 내용을 남겨 주세요.</p>
        <ul className="login-inquiry-topics" data-scroll-reveal><li>보관 가능한 자재와 입고 절차</li><li>마켓 등록 및 검수 진행 방식</li><li>보관 비용과 정산 기준</li><li>기업 단위 서비스 도입</li></ul>
        <div className="login-contact-actions" data-scroll-reveal><a className="login-contact-cta login-contact-cta-primary" href="#/contact"><MessageSquare size={17} />서비스 사용 문의</a><a className="login-contact-cta" href="tel:0312981191"><Phone size={17} />031-298-1191</a></div>
      </div></section>
    </main><footer className="login-footer">© 2026 MRS · Material Recycling Service <a href="#/admin/dashboard">관리자 시안</a><a href="https://commons.wikimedia.org/wiki/File:A_bunch_of_rebar_up_close.jpg" target="_blank" rel="noreferrer">사진: W.carter · CC BY-SA 4.0 (화면에 맞게 자름)</a></footer>
  </div>
}