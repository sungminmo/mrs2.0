import { authenticatedFetch, readAuthSession, type AuthSession } from './authSession'

export type NotificationTarget = { type: 'RECEIVING' | 'INSPECTION' | 'ASSET' | 'QUOTE' | 'ORDER'; id: string }
export type CustomerNotification = { id: string; kind: string; title: string; description: string; resourceCode: string; occurredAt: string; createdAt: string; readAt: string | null; target: NotificationTarget }
export type NotificationSummary = { totalCount: number; unreadCount: number; windowDays: 90; asOf: string }
export type NotificationPage = { items: CustomerNotification[]; hasMore: boolean; nextCursor: string | null; windowDays: 90 }
export class NotificationRequestError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}
const targets = new Set(['RECEIVING', 'INSPECTION', 'ASSET', 'QUOTE', 'ORDER'])
const validDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object'
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
export function parseNotificationSummary(value: unknown): NotificationSummary {
  if (!object(value) || !count(value.totalCount) || !count(value.unreadCount) || value.unreadCount > value.totalCount || value.windowDays !== 90 || !validDate(value.asOf)) throw new NotificationRequestError(502, '알림 응답을 확인할 수 없습니다.')
  return value as NotificationSummary
}
export function parseNotificationPage(value: unknown): NotificationPage {
  if (!object(value) || !Array.isArray(value.items) || typeof value.hasMore !== 'boolean' || value.windowDays !== 90 || !(value.nextCursor === null || typeof value.nextCursor === 'string') || (value.hasMore && !value.nextCursor)) throw new NotificationRequestError(502, '알림 목록 응답을 확인할 수 없습니다.')
  for (const item of value.items) {
    if (!object(item) || typeof item.id !== 'string' || !/^[1-9]\d{0,19}$/.test(item.id) || !['kind', 'title', 'description', 'resourceCode'].every(key => typeof item[key] === 'string') || !validDate(item.createdAt) || !validDate(item.occurredAt) || !(item.readAt === null || validDate(item.readAt)) || !object(item.target) || !targets.has(String(item.target.type)) || typeof item.target.id !== 'string' || !item.target.id) throw new NotificationRequestError(502, '알림 목록 응답을 확인할 수 없습니다.')
  }
  return value as NotificationPage
}
export async function notificationRequest<T>(session: AuthSession, path: string, parse: (data: unknown) => T, init: RequestInit = {}) {
  const active = () => readAuthSession()?.accessToken === session.accessToken && !init.signal?.aborted
  if (!active()) throw new NotificationRequestError(401, '로그인 상태가 변경되었습니다.')
  const response = await authenticatedFetch(`/api/customer/notifications${path}`, init)
  const body: unknown = await response.json().catch(() => null)
  if (!active()) throw new NotificationRequestError(401, '로그인 상태가 변경되었습니다.')
  if (!response.ok || !object(body) || body.success !== true || !object(body.data)) {
    const message = object(body) && object(body.error) && typeof body.error.message === 'string' ? body.error.message : '알림을 불러오지 못했습니다.'
    throw new NotificationRequestError(response.ok ? 502 : response.status, message)
  }
  return parse(body.data)
}
export const notificationPollingAllowed = (visible: boolean, status?: number) => visible && status !== 401 && status !== 403