type Role = 'ADMIN' | 'CUSTOMER'

export type AuthSession = {
  accessToken: string
  user: {
    id: string
    email: string
    companyName: string
    managerName: string
    role: Role
    managerPhone?: string
    customerId?: string | null
    customerRole?: 'VIEWER' | 'MANAGER'
    customer?: { id: string; name: string; businessNumber: string | null; representativeName: string; address: string; phone: string; status: string } | null
  }
}

const sessionKey = 'mrs.auth.session'

function isSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<AuthSession>
  return typeof candidate.accessToken === 'string'
    && !!candidate.user
    && typeof candidate.user.email === 'string'
    && candidate.user.role === 'CUSTOMER'
}

export function readAuthSession() {
  try {
    const value = window.sessionStorage.getItem(sessionKey)
    if (!value) return null
    const session: unknown = JSON.parse(value)
    return isSession(session) ? session : null
  } catch {
    return null
  }
}

export async function signIn(email: string, password: string) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok || !body || typeof body !== 'object' || !('success' in body) || body.success !== true || !('data' in body) || !isSession(body.data)) {
    const message = body && typeof body === 'object' && 'error' in body && body.error && typeof body.error === 'object' && 'message' in body.error && typeof body.error.message === 'string'
      ? body.error.message
      : '로그인 처리 중 오류가 발생했습니다.'
    throw new Error(message)
  }
  window.sessionStorage.setItem(sessionKey, JSON.stringify(body.data))
  return body.data
}

export async function authenticatedFetch(path: string, init: RequestInit = {}) {
  const session = readAuthSession()
  if (!session) throw new Error('로그인이 필요합니다.')
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${session.accessToken}`)
  const response = await fetch(path, { ...init, headers, cache: 'no-store' })
  if (response.status === 401 && readAuthSession()?.accessToken === session.accessToken) {
    window.sessionStorage.removeItem(sessionKey)
    window.dispatchEvent(new Event('mrs-auth-expired'))
  }
  return response
}

export function signOut(destination = '/mrs2.0/') {
  window.sessionStorage.removeItem(sessionKey)
  window.location.replace(destination)
}