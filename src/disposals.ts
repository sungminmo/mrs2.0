export type DisposalCost =
  | { status: '미산정'; estimate: null }
  | { status: '예상 비용 안내'; estimate: number }
  | { status: '비용 확정'; estimate: number | null; amount: number }
  | { status: '청구 완료'; estimate: number | null; amount: number; invoice: string; billedAt: string; lines: { label: string; amount: number }[] }

export type DisposalRecord = {
  id: string; receivedAt: string; inspectedAt: string; siteName: string; notifiedAt: string; channel: string
  materials: { code: string; name: string; grade: string; received: number; usable: number; disposal: number; processed: number | null; unit: string; reason: string; photos: { url: string; caption: string }[] }[]
  status: '고객 확인 대기' | '처리 예정' | '처리 완료'
  acknowledgedAt: string | null; consentRequired: boolean; consentedAt: string | null
  scheduledAt: string | null; completedAt: string | null
  evidence: string | null; cost: DisposalCost; comments: { text: string; createdAt: string }[]
}

export const demoDisposals: DisposalRecord[] = [
  { id: 'RCV-DEMO-0908', receivedAt: '2026.09.08', inspectedAt: '2026.09.09 09:30', siteName: '강동 주거단지 신축 현장 (예시)', notifiedAt: '2026.09.09 10:00', channel: '이메일 (발송 예시)',
    materials: [{ code: 'EMX-CON-240908', name: '업사이클링 콘크리트 블록', grade: 'B', received: 550, usable: 500, disposal: 50, processed: null, unit: '개', reason: '균열과 모서리 파손으로 재사용이 어려운 수량입니다.', photos: [] }],
    status: '고객 확인 대기', acknowledgedAt: null, consentRequired: true, consentedAt: null, scheduledAt: null, completedAt: null, evidence: null, cost: { status: '미산정', estimate: null }, comments: [] },
  { id: 'RCV-DEMO-0902', receivedAt: '2026.09.02', inspectedAt: '2026.09.03 11:00', siteName: '성수 업무시설 리모델링 현장 (예시)', notifiedAt: '2026.09.03 11:30', channel: '이메일 (발송 예시)',
    materials: [{ code: 'EMX-WOD-240902', name: '회수 참나무 구조목 2 x 4', grade: 'S', received: 85, usable: 80, disposal: 5, processed: null, unit: 'm³', reason: '부패와 심한 변형으로 구조용 재사용이 어렵습니다.', photos: [] }],
    status: '고객 확인 대기', acknowledgedAt: null, consentRequired: true, consentedAt: null, scheduledAt: null, completedAt: null, evidence: null, cost: { status: '예상 비용 안내', estimate: 48000 }, comments: [] },
  { id: 'RCV-DEMO-0827', receivedAt: '2026.08.27', inspectedAt: '2026.08.28 08:30', siteName: '송도 기반시설 정비 현장 (예시)', notifiedAt: '2026.08.28 09:00', channel: '이메일 (발송 예시)',
    materials: [{ code: 'EMX-PIP-240827', name: '고밀도 폴리에틸렌 파이프 DN100', grade: 'A', received: 220, usable: 200, disposal: 20, processed: 20, unit: 'm', reason: '관벽 손상 및 접합부 변형이 확인되었습니다.', photos: [] }],
    status: '처리 완료', acknowledgedAt: '2026.08.28 14:00', consentRequired: true, consentedAt: '2026.08.28 14:10', scheduledAt: '2026.08.30', completedAt: '2026.08.30', evidence: '처리기록 DEMO-DSP-0830 · 손상 파이프 20m 분리 및 폐기 완료 (예시)',
    cost: { status: '청구 완료', estimate: 60000, amount: 65000, invoice: 'DSP-DEMO-0901', billedAt: '2026.09.01 10:00', lines: [{ label: '폐기 처리비 (부가세 포함)', amount: 45000 }, { label: '운반비 (부가세 포함)', amount: 20000 }] }, comments: [] },
]

export const disposalMoney = (value: number | null) => value === null ? '미산정' : `₩${value.toLocaleString('ko-KR')}`
export const disposalCostLabel = (cost: DisposalCost) => cost.status === '미산정' ? '미산정' : cost.status === '예상 비용 안내' ? `${disposalMoney(cost.estimate)} · 예상 / 청구 전` : `${disposalMoney(cost.amount)} · ${cost.status}`

export type DisposalAction = { type: 'acknowledge'; at: string } | { type: 'consent'; at: string } | { type: 'comment'; at: string; text: string }
export function updateDisposal(record: DisposalRecord, action: DisposalAction): DisposalRecord {
  if (action.type === 'acknowledge') return record.acknowledgedAt ? record : { ...record, acknowledgedAt: action.at }
  if (action.type === 'consent') {
    if (!record.acknowledgedAt || record.consentedAt || !record.consentRequired || record.cost.status === '미산정' || record.status !== '고객 확인 대기') return record
    return { ...record, consentedAt: action.at, status: '처리 예정' }
  }
  const text = action.text.trim()
  return !text || text.length > 2000 ? record : { ...record, comments: [...record.comments, { text, createdAt: action.at }] }
}