import { useContext, useState, type ReactNode } from 'react'
import { Bell, CircleHelp, Leaf, LogOut, Menu, Warehouse } from 'lucide-react'
import { signOut } from './authSession'
import { NotificationNavigation } from './notificationNavigation'
import { ReceivingRequestButton } from './ReceivingRequest'
import './AdminAssets.css'

export default function AdminShell({ navigation, search, children, className = '', isGuest = false, customerName, readOnly = false }: { navigation: ReactNode; search?: ReactNode; children: ReactNode; className?: string; isGuest?: boolean; customerName?: string; readOnly?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const notifications = useContext(NotificationNavigation)
  return <div className={`shop-admin ${className}`}>
    <div className="sa-topbar">
      <button className="sa-mobile-menu sa-icon" aria-label={menuOpen ? '메뉴 닫기' : '메뉴 열기'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><Menu size={20} /></button>
      <div className="sa-brand"><Leaf size={25} /><span>{customerName ? 'MRS' : <>EcoMat<span>X</span></>}</span></div>
      {search}
      <div className="sa-topbar-actions">
        {!isGuest && !readOnly && <ReceivingRequestButton />}
        {!isGuest && notifications && <button type="button" className="sa-icon sa-notification-button" title={notifications.error ? '알림 조회 실패' : '알림'} aria-label={`알림${notifications.error ? ', 조회 실패' : notifications.unread === null ? ', 조회 중' : `, 읽지 않은 알림 ${notifications.unread}건`}`} aria-current={notifications.active ? 'page' : undefined} onClick={() => { setMenuOpen(false); notifications.onOpen() }}><Bell size={20} />{notifications.unread !== null && notifications.unread > 0 && <span className="sa-notification-count" aria-hidden="true">{notifications.unread > 99 ? '99+' : notifications.unread}</span>}</button>}
        <div className="sa-account"><span className="sa-avatar">{isGuest ? 'G' : customerName?.slice(0, 2) ?? 'HC'}</span><b>{isGuest ? '비회원' : customerName ?? '현대건설(주)'}</b></div>
        {!isGuest && <button type="button" className="sa-icon" title="로그아웃" aria-label="로그아웃" onClick={() => signOut()}><LogOut size={19} /></button>}
      </div>
    </div>
    <aside className={`sa-sidebar ${menuOpen ? 'is-open' : ''}`}>
      <div className="sa-workspace"><span className="sa-workspace-icon"><Warehouse size={19} /></span><div><b>{isGuest ? '비회원 둘러보기' : customerName ?? '현대건설 워크스페이스'}</b><span>{isGuest ? '자재 마켓' : '고객 워크스페이스'}</span></div></div>
      <nav aria-label="주 메뉴" onClick={() => setMenuOpen(false)}>{navigation}</nav>
      <div className="sa-sidebar-bottom"><span className="sa-partner"><span />{isGuest ? '비회원 이용 중' : '파트너 계정 활성'}</span><button onClick={() => setShowHelp(!showHelp)} aria-expanded={showHelp}><CircleHelp size={17} />도움말 및 지원</button>{showHelp && <p><a href="tel:0312981191">MRS 문의 031-298-1191</a></p>}</div>
    </aside>
    {menuOpen && <button className="sa-menu-backdrop" aria-label="메뉴 닫기" onClick={() => setMenuOpen(false)} />}
    {children}
  </div>
}