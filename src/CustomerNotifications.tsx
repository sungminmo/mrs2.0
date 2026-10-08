import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Bell, Check, CheckCheck, ClipboardCheck, PackagePlus, RefreshCw, ShoppingCart, Truck } from 'lucide-react'
import { NotificationNavigation } from './notificationNavigation'
import { notificationPollingAllowed, notificationRequest, NotificationRequestError, parseNotificationPage, parseNotificationSummary, type CustomerNotification, type NotificationTarget } from './notificationClient'
import type { AuthSession } from './authSession'
import { useHistoryState } from './useHistoryState'
import { createUuid } from './uuid'
import './Notifications.css'

const CustomerNotificationContext = createContext<{
  session: AuthSession; scope: string; summary: ReturnType<typeof useNotificationSummary>; read: (ids?: string[]) => Promise<void>; busy: boolean; message: string
} | null>(null)

function useNotificationSummary(session: AuthSession, scope: string) {
  const client = useQueryClient()
  const [visible, setVisible] = useState(document.visibilityState === 'visible')
  const [interval] = useState(() => 120_000 + Math.floor(Math.random() * 10_000))
  useEffect(() => {
    const changed = () => {
      const active = document.visibilityState === 'visible'
      setVisible(active)
      if (!active) void client.cancelQueries({ queryKey: ['notifications', scope, 'summary'] })
    }
    document.addEventListener('visibilitychange', changed)
    return () => document.removeEventListener('visibilitychange', changed)
  }, [client, scope])
  return useQuery({ queryKey: ['notifications', scope, 'summary'], queryFn: ({ signal }) => notificationRequest(session, '/summary', parseNotificationSummary, { signal }), enabled: query => notificationPollingAllowed(visible, query.state.error instanceof NotificationRequestError ? query.state.error.status : undefined), staleTime: 60_000, retry: false, refetchOnWindowFocus: false, refetchInterval: query => notificationPollingAllowed(visible, query.state.error instanceof NotificationRequestError ? query.state.error.status : undefined) ? interval : false, refetchIntervalInBackground: false })
}

export function CustomerNotificationProvider({ session, active, onOpen, children }: { session: AuthSession; active: boolean; onOpen: () => void; children: ReactNode }) {
  const [scope] = useState(() => `${session.user.id}/${session.user.customerId}/${createUuid()}`)
  const summary = useNotificationSummary(session, scope)
  const client = useQueryClient()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const working = useRef(false)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; void client.cancelQueries({ queryKey: ['notifications', scope] }); client.removeQueries({ queryKey: ['notifications', scope] }) }
  }, [client, scope])
  async function read(ids?: string[]) {
    if (working.current) return
    working.current = true; setBusy(true); setMessage('')
    try {
      const result = await notificationRequest(session, ids ? '/read' : '/read-all', parseNotificationSummary, { method: ids ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ids ? { ids } : {}) })
      if (!mounted.current) return
      await client.cancelQueries({ queryKey: ['notifications', scope] })
      client.setQueryData(['notifications', scope, 'summary'], result)
      await client.invalidateQueries({ queryKey: ['notifications', scope, 'list'] })
    } catch (failure) {
      if (mounted.current) { setMessage(failure instanceof Error ? failure.message : '읽음 처리에 실패했습니다.'); void client.invalidateQueries({ queryKey: ['notifications', scope] }) }
    } finally { working.current = false; if (mounted.current) setBusy(false) }
  }
  const unread = summary.isError ? null : summary.data?.unreadCount ?? null
  return <CustomerNotificationContext value={{ session, scope, summary, read, busy, message }}><NotificationNavigation value={{ unread, active, onOpen, error: summary.isError }}>
    {message && !active && <p className="customer-notification-error" role="alert">{message}</p>}{children}
  </NotificationNavigation></CustomerNotificationContext>
}

function presentation(item: CustomerNotification) {
  if (item.target.type === 'INSPECTION') return { Icon: ClipboardCheck, label: '검수 · 폐기', className: 'inspection', action: '검수 결과 보기' }
  if (item.target.type === 'RECEIVING') return { Icon: PackagePlus, label: '입고', className: 'receipt', action: '입고 내역 보기' }
  if (item.target.type === 'ASSET') return { Icon: ShoppingCart, label: '판매 · 자산', className: 'sale', action: '자산 상세 보기' }
  if (item.target.type === 'ORDER') return { Icon: Truck, label: '출고 · 취소', className: 'receipt', action: '출고 내역 보기' }
  return { Icon: ClipboardCheck, label: '구매 견적', className: 'settlement', action: '견적 내역 보기' }
}

export default function CustomerNotifications({ onTarget, onAssets }: { onTarget: (target: NotificationTarget) => void; onAssets: () => void }) {
  const context = useContext(CustomerNotificationContext)
  if (!context) throw new Error('Customer notifications provider required')
  const { session, scope, summary, read, busy, message } = context
  const [unreadOnly, setUnreadOnly] = useHistoryState(`notification-filter:${session.user.id}:${session.user.customerId}`, false)
  const client = useQueryClient()
  const heading = useRef<HTMLHeadingElement>(null)
  const list = useInfiniteQuery({ queryKey: ['notifications', scope, 'list', unreadOnly], initialPageParam: null as string | null, queryFn: ({ signal, pageParam }) => notificationRequest(session, `?unreadOnly=${unreadOnly}&size=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`, parseNotificationPage, { signal }), getNextPageParam: page => page.nextCursor ?? undefined, retry: false, staleTime: 0, refetchOnWindowFocus: false })
  const refreshSummary = summary.refetch
  useEffect(() => { heading.current?.focus({ preventScroll: true }); void refreshSummary() }, [refreshSummary])
  const items = [...new Map(list.data?.pages.flatMap(page => page.items).map(item => [item.id, item]) ?? []).values()]
  const unread = summary.isError ? null : summary.data?.unreadCount ?? null
  const total = summary.isError ? null : summary.data?.totalCount ?? null
  const refresh = () => { void client.resetQueries({ queryKey: ['notifications', scope, 'list'] }); void summary.refetch() }
  return <section className="sa-notifications-page customer-notifications">
    <div className="sa-heading"><div><div className="sa-breadcrumb">{session.user.customer?.name ?? session.user.companyName} <span>/</span> 알림</div><h1 ref={heading} tabIndex={-1}>알림{unread !== null && <span>{unread}</span>}</h1></div><div className="customer-heading-actions"><button className="sa-icon" title="알림 새로고침" aria-label="알림 새로고침" disabled={list.isFetching || summary.isFetching || busy} onClick={refresh}><RefreshCw size={18} /></button><button className="sa-button" disabled={busy || unread === null || unread === 0} onClick={() => void read()}><CheckCheck size={16} />{busy ? '처리 중' : '모두 읽음'}</button></div></div>
    <div className="sa-notifications-toolbar"><div className="sa-tabs" role="group" aria-label="알림 필터"><button disabled={busy} aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>전체{total !== null && <span>{total}</span>}</button><button disabled={busy} aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>읽지 않음{unread !== null && <span>{unread}</span>}</button></div><span>최근 90일</span></div>
    {(message || list.error || summary.error) && <p className="customer-error" role="alert">{message || list.error?.message || summary.error?.message}<button className="sa-button" disabled={busy || list.isFetching} onClick={refresh}><RefreshCw size={15} />다시 조회</button></p>}
    {list.isPending && <p role="status">알림을 불러오는 중...</p>}
    <ul className="sa-notification-list" aria-label="알림 목록" aria-busy={list.isFetching}>{items.map(item => {
      const { Icon, label, className, action } = presentation(item)
      return <li key={item.id} className={item.readAt ? 'is-read' : 'is-unread'}><Icon size={20} className={`sa-notification-category ${className}`} aria-hidden="true" /><div className="sa-notification-content"><div className="sa-notification-meta"><span>{label}</span><span>{item.readAt ? '읽음' : '읽지 않음'}</span></div><h2>{item.title}</h2><p>{item.description}</p><small>{item.resourceCode}</small><div className="sa-notification-date">{new Date(item.occurredAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</div><div className="sa-notification-actions"><button className="sa-button" onClick={() => { if (!item.readAt) void read([item.id]); onTarget(item.target) }}>{action}<ArrowRight size={15} /></button>{!item.readAt && <button className="sa-button" aria-label={`${item.title} 읽음 처리`} disabled={busy} onClick={() => void read([item.id])}><Check size={15} />읽음 처리</button>}</div></div></li>
    })}</ul>
    {list.isSuccess && !items.length && <div className="sa-empty"><Bell size={28} /><h2>{unreadOnly ? '읽지 않은 알림이 없습니다' : '최근 알림이 없습니다'}</h2></div>}
    {list.hasNextPage && <div className="customer-notification-more"><button className="sa-button" disabled={list.isFetching || busy} onClick={() => void list.fetchNextPage()}>{list.isFetchingNextPage ? '불러오는 중' : '더 보기'}<ArrowRight size={15} /></button></div>}
    <div className="sa-notifications-footer"><button className="sa-button" onClick={onAssets}><ArrowLeft size={15} />내 자산으로</button></div>
  </section>
}