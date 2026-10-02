import { accountRequest } from './customerAccounts'

export type ReceivingRecord = {
  id: string; siteName: string; managerName: string; managerPhone: string; volume: string;
  status: string; note: string; requestedAt: string; scheduledAt: string | null;
  termsAgreedAt: string; termsVersion: string; termsText: string;
  images?: Array<{ id: string; name: string; url: string }>;
  decision?: { status: string; reason: string; at: string } | null;
}
export const receivingStatusLabels: Record<string, string> = { REQUESTED: '입고 신청', APPROVED: '입고 승인', RECEIVED: '입고 완료', REJECTED: '입고 반려', CANCELLED: '취소' }
export const receivingVolumeLabels: Record<string, string> = { UNDER_ONE_TON: '1톤 트럭 이하 (소량)', TWO_POINT_FIVE_TONS: '2.5톤 트럭 기준 (약 4~5 파렛트)', FIVE_TONS_OR_MORE: '5톤 트럭 이상 (대량)', OTHER: '기타' }
export async function submitReceiving(form: FormData) {
  const body = new FormData()
  for (const name of ['siteName', 'volume', 'note']) body.set(name, String(form.get(name) ?? ''))
  body.set('managerName', String(form.get('manager') ?? ''))
  body.set('managerPhone', String(form.get('phone') ?? ''))
  body.set('disposalTerms', form.get('disposalTerms') ? 'true' : 'false')
  for (const photo of form.getAll('photos')) if (photo instanceof File && photo.size) body.append('photos', photo)
  return (await accountRequest<{ receiving: ReceivingRecord }>('/api/customer/receivings', { method: 'POST', body })).receiving
}