export type AdminRole = 'SYSTEM_ADMIN' | 'ADMIN' | 'SALES' | 'LOGISTICS'
export const adminRoleLabels: Record<AdminRole, string> = { SYSTEM_ADMIN: '시스템 관리자', ADMIN: '관리자', SALES: '영업', LOGISTICS: '물류' }
export type AdminSession = {
  accessToken: string
  user: { id: string; email: string; managerName: string; role: 'ADMIN'; status: string; adminRole?: AdminRole | null }
}

const sessionKey = 'mrs.admin.auth.session'

function isAdminSession(value: unknown): value is AdminSession {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<AdminSession>
  return typeof candidate.accessToken === 'string' && candidate.user?.role === 'ADMIN'
}

export function readAdminSession() {
  try {
    const value = window.sessionStorage.getItem(sessionKey)
    if (!value) return null
    const session: unknown = JSON.parse(value)
    return isAdminSession(session) ? session : null
  } catch {
    return null
  }
}

export async function adminSignIn(id: string, password: string) {
  const response = await fetch('/api/admin/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, password }) })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok || !body || typeof body !== 'object' || !('data' in body) || !isAdminSession(body.data)) {
    const message = body && typeof body === 'object' && 'error' in body && body.error && typeof body.error === 'object' && 'message' in body.error && typeof body.error.message === 'string' ? body.error.message : '관리자 로그인에 실패했습니다.'
    throw new Error(message)
  }
  window.sessionStorage.setItem(sessionKey, JSON.stringify(body.data))
  return body.data
}

export async function adminAuthenticatedFetch(path: string, init: RequestInit = {}, completionMessage?: string) {
  const session = readAdminSession()
  if (!session) throw new Error('관리자 로그인이 필요합니다.')
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${session.accessToken}`)
  const response = await fetch(path, { ...init, headers, cache: 'no-store' })
  if (response.status === 401 && readAdminSession()?.accessToken === session.accessToken) {
    window.sessionStorage.removeItem(sessionKey)
    window.dispatchEvent(new Event('mrs-admin-auth-expired'))
  }
  const method = (init.method ?? 'GET').toUpperCase()
  if (response.ok && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !path.startsWith('/api/admin/images/')) {
    showAdminToast(completionMessage ?? (response.status === 201 ? '등록이 완료되었습니다.' : method === 'DELETE' ? '삭제가 완료되었습니다.' : '수정이 완료되었습니다.'))
  }
  return response
}

export function showAdminToast(message: string) {
  window.dispatchEvent(new CustomEvent('mrs-admin-toast', { detail: message }))
}

export function adminSignOut() {
  window.sessionStorage.removeItem(sessionKey)
  window.location.replace('/admin/')
}

export async function adminAccountRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await adminAuthenticatedFetch(path, init)
  const body = await response.json().catch(() => null) as { data?: T; error?: { message?: string } } | null
  if (!response.ok || !body?.data) throw new Error(body?.error?.message ?? '요청을 처리하지 못했습니다.')
  return body.data
}