import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Bell, Check, CheckCheck, ClipboardCheck, PackagePlus, ReceiptText, ShoppingCart } from 'lucide-react'
import AdminShell from './AdminShell'
import './Notifications.css'

const notificationTypes = {
  '검수 결과': { icon: ClipboardCheck, className: 'inspection', action: '검수 결과 보기' },
  '폐기 완료': { icon: ClipboardCheck, className: 'inspection', action: '처리 내역 보기' },
  '폐기 비용': { icon: ReceiptText, className: 'settlement', action: '청구 명세 보기' },
  '검수 대기': { icon: ClipboardCheck, className: 'inspection', action: '내 자산 보기' },
  '판매 완료': { icon: ShoppingCart, className: 'sale', action: '거래 내역 보기' },
  '정산 완료': { icon: ReceiptText, className: 'settlement', action: '정산 내역 보기' },
  '신규 입고': { icon: PackagePlus, className: 'receipt', action: '내 자산 보기' },
}
export type NotificationItem = { id: string; title: string; description: string; code: string; read: boolean; category: keyof typeof notificationTypes; date: string; dateLabel: string; inspectionId?: string }

export default function Notifications({ navigation, items, onRead, onAssets, onSales, onSettlements, onInspection }: { navigation: ReactNode; items: NotificationItem[]; onRead: (ids: string[]) => void; onAssets: () => void; onSales: () => void; onSettlements: () => void; onInspection: (id: string) => void }) {
  const [unreadOnly, setUnreadOnly] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const unread = items.filter((item) => !item.read)
  const shown = unreadOnly ? unread : items
  useEffect(() => { heading.current?.focus() }, [])

  return <AdminShell navigation={navigation}><main className="sa-main sa-notifications-page">
    <div className="sa-heading"><div><div className="sa-breadcrumb">워크스페이스 <span>/</span> 알림</div><h1 ref={heading} tabIndex={-1}>알림 <span>{unread.length}</span></h1></div><button className="sa-button" onClick={() => onRead(unread.map((item) => item.id))} disabled={!unread.length}><CheckCheck size={16} />모두 읽음</button></div>
    <div className="sa-notifications-toolbar"><div className="sa-tabs" role="group" aria-label="알림 필터"><button aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>전체 <span>{items.length}</span></button><button aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>읽지 않음 <span>{unread.length}</span></button></div><span role="status">읽지 않은 알림 {unread.length}건</span></div>
    <ul className="sa-notification-list" aria-label="알림 목록">{shown.map((item) => {
      const type = notificationTypes[item.category]
      const Icon = type.icon
      return <li key={item.id} className={item.read ? 'is-read' : 'is-unread'}>
        <Icon className={`sa-notification-category ${type.className}`} size={20} aria-hidden="true" />
        <div className="sa-notification-content"><div className="sa-notification-meta"><span>{item.category}</span><span>{item.read ? '읽음' : '읽지 않음'}</span></div><h2>{item.title}</h2><p>{item.description}</p><small>{item.code}</small><div className="sa-notification-date">{item.dateLabel} · {item.date}</div><div className="sa-notification-actions"><button className="sa-button" onClick={() => { onRead([item.id]); if (item.inspectionId) onInspection(item.inspectionId); else if (item.category === '판매 완료') onSales(); else if (item.category === '정산 완료') onSettlements(); else onAssets() }}>{type.action}<ArrowRight size={15} /></button>{!item.read && <button className="sa-button" aria-label={`${item.title} 읽음 처리`} onClick={() => onRead([item.id])}><Check size={15} />읽음 처리</button>}</div></div>
      </li>
    })}</ul>
    {!shown.length && <div className="sa-empty"><Bell size={28} /><h2>{unreadOnly ? '읽지 않은 알림이 없습니다' : '새로운 알림이 없습니다'}</h2>{unreadOnly && items.length > 0 && <button className="sa-button" onClick={() => setUnreadOnly(false)}>전체 알림 보기</button>}</div>}
    <div className="sa-notifications-footer"><button className="sa-button" onClick={onAssets}><ArrowLeft size={15} />내 자산으로</button></div>
  </main></AdminShell>
}