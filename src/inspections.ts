import type { AdminImage } from './admin/adminData'

export const inspectionUnits = { EA: 'EA', SET: 'Set', ROLL: '롤', BAR: '봉', SURFACE: '면', BOX: 'Box', KG: 'kg', TON: 'ton', M: 'M', M3: 'm³', PIECE: '본', PAIR: '켤레', GROUP: '조', SHEET: '장', SETUP: '식', CASE: '건', CONTAINER: '통', BUNDLE: '묶음', UNIT: '대', BAG: '포', PACK: '곽', CARTON: '갑', OTHER: '기타' } as const
export type InspectionRow = { id: string; itemId: string; name: string; specification: string; brand: string; categoryId: string; unit: keyof typeof inspectionUnits | ''; grade: 'S' | 'A' | 'B' | 'F' | ''; received: string; usable: string; disposal: string; reason: string; locationId: string; photos: AdminImage[] }
export type InspectionReport = { id: string; receivingId: string; siteName: string; customerId: string; receivedAt: string; status: 'PENDING' | 'AWAITING_ACKNOWLEDGEMENT' | 'COMPLETED'; version: number; inspectedAt: string | null; acknowledgedAt: string | null; consentedAt: string | null; disposalStatus: string | null; consentText: string; rows: InspectionRow[]; assets: { rowId: string; id: string }[]; editable?: boolean; editBlock?: string }
export const inspectionLabels = { PENDING: '검수 대기', AWAITING_ACKNOWLEDGEMENT: '결과 확인 대기', COMPLETED: '검수 종료' }
export const emptyInspectionRow = (): InspectionRow => ({ id: crypto.randomUUID(), itemId: '', name: '', specification: '', brand: '', categoryId: '', unit: '', grade: '', received: '', usable: '', disposal: '', reason: '', locationId: '', photos: [] })
const amount = (value: string) => {
  if (!/^\d{1,10}(?:\.\d{1,3})?$/.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  const scaled = BigInt(whole!) * 1000n + BigInt(fraction.padEnd(3, '0'))
  return scaled <= 1_000_000_000_000n ? scaled : null
}
export function inspectionRowErrors(row: InspectionRow): string[] {
  const errors: string[] = []
  if (row.itemId && !/^\d{6}$/.test(row.itemId)) errors.push('품목코드: 6자리 숫자')
  if (!row.name.trim() || row.name.length > 160) errors.push('자산명: 1~160자')
  if (!row.specification.trim() || row.specification.length > 500) errors.push('규격: 1~500자')
  if (row.brand.length > 160) errors.push('브랜드: 160자 이하')
  if (!/^\d{6}$/.test(row.categoryId)) errors.push('카테고리: 6자리 코드')
  if (!row.unit || !(row.unit in inspectionUnits)) errors.push('단위 선택')
  if (!['S', 'A', 'B', 'F'].includes(row.grade)) errors.push('등급 선택')
  const received = amount(row.received), usable = amount(row.usable), disposal = amount(row.disposal)
  if (received === null || usable === null || disposal === null) errors.push('수량: 0~10억, 소수 3자리 이하')
  else {
    if (received === 0n || received !== usable + disposal) errors.push('입고수량 = 재사용수량 + 폐기수량 (입고 0 초과)')
    if (row.grade === 'F' && usable !== 0n) errors.push('F등급 재사용수량은 0')
    if (['EA', 'BOX', 'PIECE'].includes(row.unit) && [received, usable, disposal].some((value) => value % 1000n !== 0n)) errors.push('EA·Box·본 수량은 정수')
    if (disposal > 0n && !row.reason.trim()) errors.push('폐기사유 필수')
    if (usable > 0n && !row.locationId.trim()) errors.push('로케이션 필수')
  }
  if (row.reason.length > 1000 || row.locationId.length > 20) errors.push('폐기사유 1000자·로케이션코드 20자 이하')
  return errors
}