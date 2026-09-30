import { authenticatedFetch } from './authSession'

export type CustomerFields = { name: string; businessNumber: string; representativeName: string; address: string; phone: string }
export type CustomerAccount = Omit<CustomerFields, 'businessNumber'> & { id: string; businessNumber: string | null; status: 'PENDING' | 'ACTIVE' | 'SUSPENDED'; version: number; _count?: { users?: number; assets: number }; users?: CustomerMember[]; changes?: Array<{ id: string; action: string; reason: string; actorUserId: string; createdAt: string; changes: unknown }> }
export type CustomerMember = { id: string; email: string; managerName: string; managerPhone: string; companyName: string; customerId: string | null; customerRole: 'VIEWER' | 'MANAGER'; role: 'ADMIN' | 'CUSTOMER'; status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED'; sessionVersion: number; customer: CustomerAccount | null; customerApplication: { id: string; status: string } | null }
export type CustomerApplication = CustomerFields & { id: string; userId: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; version: number; reviewReason: string; user: Pick<CustomerMember, 'email' | 'managerName' | 'managerPhone'> }
export const accountStatus = { PENDING: '승인 대기', ACTIVE: '이용 중', SUSPENDED: '이용 정지', REJECTED: '반려', APPROVED: '승인 완료' }

export async function accountRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(path, init)
  const body = await response.json().catch(() => null) as { data?: T; error?: { message?: string } } | null
  if (!response.ok || !body?.data) throw new Error(body?.error?.message ?? '요청을 처리하지 못했습니다.')
  return body.data
}

export function jsonRequest(method: string, value: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }
}