import assert from 'node:assert/strict'
import { test } from 'node:test'
import { notificationPollingAllowed, notificationRequest, NotificationRequestError, parseNotificationPage, parseNotificationSummary } from '../src/notificationClient.ts'
import type { AuthSession } from '../src/authSession.ts'

test('notification transport validates exact personal counts and typed targets', () => {
  const summary = { totalCount: 5, unreadCount: 3, windowDays: 90, asOf: new Date().toISOString() }
  assert.deepEqual(parseNotificationSummary(summary), summary)
  for (const change of [{ unreadCount: 6 }, { unreadCount: -1 }, { windowDays: 30 }, { asOf: 'bad' }]) assert.throws(() => parseNotificationSummary({ ...summary, ...change }))
  const item = { id: '9007199254740993', kind: 'sale.approved', title: '제목', description: '설명', resourceCode: '자산', occurredAt: summary.asOf, createdAt: summary.asOf, readAt: null, target: { type: 'ASSET', id: '261007-9801' } }
  assert.equal(parseNotificationPage({ items: [item], hasMore: false, nextCursor: null, windowDays: 90 }).items[0]?.id, item.id)
  for (const target of [{ type: 'URL', id: 'https://invalid.test' }, { type: 'ASSET', id: '' }]) assert.throws(() => parseNotificationPage({ items: [{ ...item, target }], hasMore: false, nextCursor: null, windowDays: 90 }))
})

test('notification polling pauses while hidden and after authentication or permission loss', () => {
  assert.equal(notificationPollingAllowed(false), false)
  assert.equal(notificationPollingAllowed(true), true)
  assert.equal(notificationPollingAllowed(true, 500), true)
  for (const code of [401, 403]) assert.equal(notificationPollingAllowed(true, code), false)
})

test('notification requests discard late switched-account responses and never retry writes', async () => {
  const session: AuthSession = { accessToken: 'test-only-token', user: { id: 'test', email: 'test@example.test', companyName: 'Test', managerName: 'Test', role: 'CUSTOMER', customerId: 'Test' } }
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const originalFetch = globalThis.fetch
  let stored: string | null = JSON.stringify(session)
  let expired = 0
  let calls = 0
  const totals = { totalCount: 2, unreadCount: 1, windowDays: 90, asOf: new Date().toISOString() }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { sessionStorage: { getItem: () => stored, removeItem: () => { stored = null } }, dispatchEvent: () => { expired++; return true } } })
  try {
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    globalThis.fetch = async () => { calls++; await pending; return Response.json({ success: true, data: totals }) }
    const late = notificationRequest(session, '/summary', parseNotificationSummary)
    stored = JSON.stringify({ ...session, accessToken: 'new-account-token' })
    release()
    await assert.rejects(late, /로그인 상태가 변경/)
    assert.equal(calls, 1)
    stored = JSON.stringify(session)
    globalThis.fetch = async () => { calls++; return Response.json({ success: false, error: { message: '저장 실패' } }, { status: 500 }) }
    await assert.rejects(notificationRequest(session, '/read-all', parseNotificationSummary, { method: 'POST', body: '{}' }), failure => failure instanceof NotificationRequestError && failure.status === 500)
    assert.equal(calls, 2)
    globalThis.fetch = async () => Response.json({ success: false, data: totals })
    await assert.rejects(notificationRequest(session, '/summary', parseNotificationSummary), failure => failure instanceof NotificationRequestError && failure.status === 502)
    globalThis.fetch = async () => { calls++; return Response.json({ success: false, error: { message: '권한 없음' } }, { status: 403 }) }
    await assert.rejects(notificationRequest(session, '/summary', parseNotificationSummary), failure => failure instanceof NotificationRequestError && failure.status === 403)
    assert.equal(expired, 0)
    globalThis.fetch = async () => { calls++; return new Response(null, { status: 401 }) }
    await assert.rejects(notificationRequest(session, '/summary', parseNotificationSummary))
    assert.equal(expired, 1)
    assert.equal(stored, null)
  } finally {
    globalThis.fetch = originalFetch
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})