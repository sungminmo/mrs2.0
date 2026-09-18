export const referenceDate = '2026-09-14T12:00:00+09:00'
export const money = (amount: number | null) => amount === null ? '미산정' : `₩${amount.toLocaleString('ko-KR')}`
export const dateText = (value: string | null) => value ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)) : '미등록'

type Customer = { id: string; name: string; manager: string; phone: string; email: string; status: '이용 중' | '상담 중' }
type Site = { id: string; customerId: string; name: string; address: string; status: '운영 중' | '종료' }
type Receiving = { id: string; siteId: string; date: string; volume: string; summary: string; status: '접수 대기' | '견적 안내' | '입고 예정' | '입고 완료' | '취소'; scheduledAt: string | null; termsAt: string; estimate: number | null; note: string }
type Material = { assetId: string | null; name: string; grade: 'S' | 'A' | 'B' | 'F' | null; unit: string; received: number; usable: number | null; disposal: number | null; processed: number | null; reason: string }
type Inspection = { id: string; receivingId: string; date: string; inspectedAt: string | null; notifiedAt: string | null; status: '검수 대기' | '결과 확인 대기' | '검수 종료'; acknowledgedAt: string | null; disposalStatus: '판정 대기' | '미처리' | '처리 예정' | '폐기 완료'; materials: Material[]; evidence: string | null }
export const itemUnits = ['EA', 'Box', 'kg', 'ton', 'm', 'm³', '본'] as const
export type AdminImage = { id: string; name: string; url: string }
export type MasterItem = { id: string; name: string; category: string; specification: string; brand: string; unit: typeof itemUnits[number]; inboundPrice: number | null; outboundPrice: number | null; standardPrice: number | null; enabled: boolean; note: string; images: AdminImage[] }
export type AssetChange = { at: string; reason: string; changes: [string, string, string][] }
export type Inventory = { id: string; itemId: string; receivingId: string; customerId: string; receiptId: string | null; locationId: string; name: string; category: string; brand: string; grade: 'S' | 'A' | 'B' | 'F'; quantity: number; unit: typeof itemUnits[number]; appraisal: number | null; status: '입고대기' | '보관중' | '출고완료'; saleStatus: '판매대기' | '판매중' | '판매완료'; specification: string; images: AdminImage[]; history: AssetChange[] }
export type Location = { id: string; name: string; zone: string; status: '사용 중' | '비어 있음'; rate: number | null }
export type SaleRequest = { id: string; assetId: string; date: string; quantity: number; desiredAmount: number; status: '승인 대기' | '승인 완료' | '반려'; inspection: string }
export type Product = { id: string; assetId: string; name: string; price: number; unit: string; status: '판매대기' | '판매 중' | '재고 없음' }
export type Quote = { id: string; customerId: string; date: string; dueAt: string; status: '접수 대기' | '견적 회신' | '출고 완료'; lines: { productId: string; name: string; quantity: number; unit: string; unitPrice: number | null }[]; address: string; note: string }
export type Campaign = { id: string; name: string; category: string; description: string; enabled: boolean; order: number; startsAt: string; endsAt: string }
export type MemberAccount = { id: string; type: '기업회원' | '공급처'; email: string; companyName: string; businessNumber: string; representativeName: string; managerName: string; managerPhone: string; companyPhone: string; faxNumber: string; lastLoginAt: string | null; joinedAt: string; status: '가입 승인 대기' | '이용 중' | '승인 반려' }
type Invoice = { id: string; customerId: string; type: '보관료' | '판매 정산' | '폐기 비용'; date: string; period: string; status: '미청구' | '청구 완료' | '수납 완료' | '정산 완료'; estimate: number | null; lines: { label: string; amount: number }[]; receiptId?: string; locationId?: string; quoteId?: string }
type Inquiry = { id: string; customerId: string; date: string; type: '서비스' | '입고' | '검수 이의' | '구매'; title: string; text: string; status: '미답변' | '확인 중' | '답변 완료'; answer: string | null; receiptId?: string; receivingId?: string; quoteId?: string }

export const customers: Customer[] = [
  { id: 'CUS-001', name: '새봄건설 (예시)', manager: '김담당', phone: '010-0000-1001', email: 'operations@example.com', status: '이용 중' },
  { id: 'CUS-002', name: '다온인테리어 (예시)', manager: '이담당', phone: '010-0000-1002', email: 'design@example.com', status: '이용 중' },
  { id: 'CUS-003', name: '한결자재 (예시)', manager: '박담당', phone: '010-0000-1003', email: 'materials@example.com', status: '상담 중' },
]
export const memberAccounts: MemberAccount[] = [
  { id: 'MBR-000001', type: '기업회원', email: 'operations@saebom.example.com', companyName: '새봄건설(주)', businessNumber: '123-45-67890', representativeName: '김새봄', managerName: '김담당', managerPhone: '010-0000-1001', companyPhone: '02-0000-1101', faxNumber: '02-0000-1102', lastLoginAt: '2026-09-14T09:10:00+09:00', joinedAt: '2026-08-18T10:00:00+09:00', status: '이용 중' },
  { id: 'MBR-000002', type: '기업회원', email: 'design@daon.example.com', companyName: '다온인테리어(주)', businessNumber: '234-56-78901', representativeName: '이 다온', managerName: '이담당', managerPhone: '010-0000-1002', companyPhone: '02-0000-1201', faxNumber: '', lastLoginAt: '2026-09-13T16:24:00+09:00', joinedAt: '2026-08-25T09:30:00+09:00', status: '이용 중' },
  { id: 'MBR-000003', type: '공급처', email: 'partner@hangyeol.example.com', companyName: '한결자재', businessNumber: '345-67-89012', representativeName: '박한결', managerName: '박담당', managerPhone: '010-0000-1003', companyPhone: '031-000-1301', faxNumber: '031-000-1302', lastLoginAt: null, joinedAt: '2026-09-14T09:15:00+09:00', status: '가입 승인 대기' },
  { id: 'MBR-000004', type: '기업회원', email: 'materials@greenbuild.example.com', companyName: '그린빌드', businessNumber: '456-78-90123', representativeName: '최그린', managerName: '최담당', managerPhone: '010-0000-1004', companyPhone: '02-0000-1401', faxNumber: '', lastLoginAt: null, joinedAt: '2026-09-15T14:20:00+09:00', status: '가입 승인 대기' },
]
export const sites: Site[] = [
  { id: 'SITE-001', customerId: 'CUS-001', name: '강동 주거단지', address: '서울 강동구 · 예시 현장', status: '운영 중' },
  { id: 'SITE-002', customerId: 'CUS-002', name: '성수 업무시설', address: '서울 성동구 · 예시 현장', status: '운영 중' },
  { id: 'SITE-003', customerId: 'CUS-001', name: '송도 기반시설', address: '인천 연수구 · 예시 현장', status: '종료' },
  { id: 'SITE-004', customerId: 'CUS-003', name: '수원 자재센터', address: '경기 수원시 · 예시 현장', status: '운영 중' },
]
export const receivings: Receiving[] = [
  { id: 'REQ-0914-01', siteId: 'SITE-004', date: '2026-09-14T09:00:00+09:00', volume: '2.5톤 트럭 · 약 4~5 파렛트', summary: '가설재 및 합판', status: '접수 대기', scheduledAt: null, termsAt: '2026-09-14T09:00:00+09:00', estimate: null, note: '오전 수거 가능 여부 문의' },
  { id: 'REQ-0913-01', siteId: 'SITE-002', date: '2026-09-13T11:00:00+09:00', volume: '1톤 트럭 이하', summary: '마감용 타일', status: '견적 안내', scheduledAt: null, termsAt: '2026-09-13T11:00:00+09:00', estimate: 120000, note: '운반비 120,000원 견적 예시 · 보관료 별도' },
  { id: 'REQ-0912-01', siteId: 'SITE-001', date: '2026-09-12T10:00:00+09:00', volume: '5톤 트럭 이상', summary: '구조용 H빔', status: '입고 예정', scheduledAt: '2026-09-15T10:00:00+09:00', termsAt: '2026-09-12T10:00:00+09:00', estimate: 240000, note: '운반비 240,000원 견적 예시 · 하역 장비 필요' },
  { id: 'REQ-0907-01', siteId: 'SITE-001', date: '2026-09-07T10:00:00+09:00', volume: '2.5톤 트럭 · 약 4~5 파렛트', summary: '콘크리트 블록', status: '입고 완료', scheduledAt: '2026-09-08T10:00:00+09:00', termsAt: '2026-09-07T10:00:00+09:00', estimate: 150000, note: '운반비 견적 예시' },
  { id: 'REQ-0901-01', siteId: 'SITE-002', date: '2026-09-01T10:00:00+09:00', volume: '5톤 트럭 이상', summary: '회수 참나무 구조목', status: '입고 완료', scheduledAt: '2026-09-02T10:00:00+09:00', termsAt: '2026-09-01T10:00:00+09:00', estimate: 300000, note: '운반비 견적 예시' },
  { id: 'REQ-0826-01', siteId: 'SITE-003', date: '2026-08-26T10:00:00+09:00', volume: '1톤 트럭 이하', summary: '폴리에틸렌 파이프', status: '입고 완료', scheduledAt: '2026-08-27T10:00:00+09:00', termsAt: '2026-08-26T10:00:00+09:00', estimate: 90000, note: '운반비 견적 예시' },
  { id: 'REQ-0910-01', siteId: 'SITE-004', date: '2026-09-10T10:00:00+09:00', volume: '1톤 트럭 이하', summary: '알루미늄 프레임', status: '취소', scheduledAt: null, termsAt: '2026-09-10T10:00:00+09:00', estimate: null, note: '고객 일정 변경으로 취소' },
  { id: 'REQ-0914-02', siteId: 'SITE-004', date: '2026-09-14T08:00:00+09:00', volume: '1톤 트럭 이하', summary: '재사용 바닥 타일', status: '입고 완료', scheduledAt: '2026-09-14T11:00:00+09:00', termsAt: '2026-09-14T08:00:00+09:00', estimate: 80000, note: '운반비 견적 예시' },
]
export const inspections: Inspection[] = [
  { id: 'RCV-0908', receivingId: 'REQ-0907-01', date: '2026-09-08T10:00:00+09:00', inspectedAt: '2026-09-09T09:30:00+09:00', notifiedAt: '2026-09-09T10:00:00+09:00', status: '결과 확인 대기', acknowledgedAt: null, disposalStatus: '미처리', materials: [{ assetId: 'AST-001', name: '콘크리트 블록', grade: 'B', unit: '개', received: 550, usable: 500, disposal: 50, processed: 0, reason: '균열 및 모서리 파손' }], evidence: null },
  { id: 'RCV-0902', receivingId: 'REQ-0901-01', date: '2026-09-02T10:00:00+09:00', inspectedAt: '2026-09-03T11:00:00+09:00', notifiedAt: '2026-09-03T11:30:00+09:00', status: '검수 종료', acknowledgedAt: '2026-09-04T10:00:00+09:00', disposalStatus: '처리 예정', materials: [{ assetId: 'AST-002', name: '회수 참나무 구조목', grade: 'S', unit: 'm³', received: 85, usable: 80, disposal: 5, processed: 0, reason: '부패 및 심한 변형' }], evidence: null },
  { id: 'RCV-0827', receivingId: 'REQ-0826-01', date: '2026-08-27T10:00:00+09:00', inspectedAt: '2026-08-28T08:30:00+09:00', notifiedAt: '2026-08-28T09:00:00+09:00', status: '검수 종료', acknowledgedAt: '2026-08-28T14:00:00+09:00', disposalStatus: '폐기 완료', materials: [{ assetId: 'AST-003', name: '폴리에틸렌 파이프 DN100', grade: 'A', unit: 'm', received: 220, usable: 200, disposal: 20, processed: 20, reason: '관벽 손상 및 접합부 변형' }], evidence: 'DEMO-DSP-0830 · 처리 수량 20m (문서 원본 미등록)' },
  { id: 'RCV-0914', receivingId: 'REQ-0914-02', date: '2026-09-14T11:00:00+09:00', inspectedAt: null, notifiedAt: null, status: '검수 대기', acknowledgedAt: null, disposalStatus: '판정 대기', materials: [{ assetId: null, name: '재사용 바닥 타일', grade: null, unit: '개', received: 120, usable: null, disposal: null, processed: null, reason: '검수 전' }], evidence: null },
]
export const locations: Location[] = [
  { id: 'LOC-B08', name: 'B-08 창고', zone: 'B구역', status: '사용 중', rate: null },
  { id: 'LOC-A03', name: 'A-03 창고', zone: 'A구역', status: '사용 중', rate: null },
  { id: 'LOC-C07', name: 'C-07 야적장', zone: 'C구역', status: '사용 중', rate: null },
  { id: 'LOC-A04', name: 'A-04 창고', zone: 'A구역', status: '비어 있음', rate: null },
]
export const masterItems: MasterItem[] = [
  { id: 'ITM-000001', name: '콘크리트 블록', category: 'CAT-015', specification: '390 × 190 × 190 mm', brand: '', unit: 'EA', inboundPrice: null, outboundPrice: 850, standardPrice: 780, enabled: true, note: '기준 단가 예시 · 부가세 포함', images: [] },
  { id: 'ITM-000002', name: '회수 참나무 구조목', category: 'CAT-009', specification: '38 × 89 mm, 2.4 m', brand: '', unit: 'm³', inboundPrice: null, outboundPrice: 43500, standardPrice: 43500, enabled: true, note: '기준 단가 예시 · 부가세 포함', images: [] },
  { id: 'ITM-000003', name: '폴리에틸렌 파이프 DN100', category: 'CAT-012', specification: 'DN100, SDR17, 6 m', brand: '', unit: 'm', inboundPrice: null, outboundPrice: 3490, standardPrice: 3490, enabled: true, note: '기준 단가 예시 · 부가세 포함', images: [] },
  { id: 'ITM-000004', name: '알루미늄 프레임', category: 'CAT-006', specification: '40 × 40 mm', brand: '', unit: '본', inboundPrice: null, outboundPrice: null, standardPrice: null, enabled: false, note: '미사용 품목 예시', images: [] },
]
export const inventory: Inventory[] = [
  { id: 'AST-001', itemId: 'ITM-000001', receivingId: 'REQ-0907-01', customerId: 'CUS-001', receiptId: 'RCV-0908', locationId: 'LOC-B08', name: '콘크리트 블록', category: 'CAT-015', brand: '', grade: 'B', quantity: 500, unit: 'EA', appraisal: 390000, status: '보관중', saleStatus: '판매대기', specification: '390 × 190 × 190 mm', images: [], history: [] },
  { id: 'AST-002', itemId: 'ITM-000002', receivingId: 'REQ-0901-01', customerId: 'CUS-002', receiptId: 'RCV-0902', locationId: 'LOC-A03', name: '회수 참나무 구조목', category: 'CAT-009', brand: '', grade: 'S', quantity: 80, unit: 'm³', appraisal: 3480000, status: '보관중', saleStatus: '판매중', specification: '38 × 89 mm, 2.4 m', images: [], history: [] },
  { id: 'AST-003', itemId: 'ITM-000003', receivingId: 'REQ-0826-01', customerId: 'CUS-001', receiptId: 'RCV-0827', locationId: 'LOC-C07', name: '폴리에틸렌 파이프 DN100', category: 'CAT-012', brand: '', grade: 'A', quantity: 200, unit: 'm', appraisal: 698000, status: '보관중', saleStatus: '판매중', specification: 'DN100, SDR17, 6 m', images: [], history: [] },
]
export const saleRequests: SaleRequest[] = [
  { id: 'SALE-001', assetId: 'AST-001', date: '2026-09-10T10:00:00+09:00', quantity: 500, desiredAmount: 425000, status: '승인 대기', inspection: '판매용 정밀 검수 대기' },
  { id: 'SALE-002', assetId: 'AST-002', date: '2026-09-05T10:00:00+09:00', quantity: 80, desiredAmount: 3750000, status: '승인 완료', inspection: '판매용 정밀 검수 완료 · S등급' },
  { id: 'SALE-003', assetId: 'AST-003', date: '2026-09-01T10:00:00+09:00', quantity: 200, desiredAmount: 760000, status: '승인 완료', inspection: '판매용 정밀 검수 완료 · A등급' },
]
export const products: Product[] = [
  { id: 'PRD-002', assetId: 'AST-002', name: '회수 참나무 구조목', price: 43500, unit: 'm³', status: '판매 중' },
  { id: 'PRD-003', assetId: 'AST-003', name: '폴리에틸렌 파이프 DN100', price: 3490, unit: 'm', status: '판매 중' },
]
export const quotes: Quote[] = [
  { id: 'QUO-0914', customerId: 'CUS-003', date: '2026-09-14T10:00:00+09:00', dueAt: '2026-09-21T09:00:00+09:00', status: '접수 대기', lines: [{ productId: 'PRD-002', name: '회수 참나무 구조목', quantity: 10, unit: 'm³', unitPrice: null }, { productId: 'PRD-003', name: '폴리에틸렌 파이프 DN100', quantity: 30, unit: 'm', unitPrice: null }], address: '경기 수원시 · 예시 납품지', note: '일괄 배송 및 운반비 확인 요청' },
  { id: 'QUO-0911', customerId: 'CUS-002', date: '2026-09-11T10:00:00+09:00', dueAt: '2026-09-18T09:00:00+09:00', status: '견적 회신', lines: [{ productId: 'PRD-003', name: '폴리에틸렌 파이프 DN100', quantity: 20, unit: 'm', unitPrice: 3490 }], address: '서울 성동구 · 예시 납품지', note: '자재 금액 69,800원 · 운반비 별도' },
]
export const campaigns: Campaign[] = [
  { id: 'CAM-001', name: '다시 쓰는 목재 기획전', category: 'CAT-007', description: '규격과 등급별 회수 목재', enabled: true, order: 1, startsAt: '2026-09-01T00:00:00+09:00', endsAt: '2026-09-16T00:00:00+09:00' },
  { id: 'CAM-002', name: '배관 자재 모음전', category: 'CAT-010', description: '현장 규격별 배관 자재', enabled: true, order: 2, startsAt: '2026-09-20T00:00:00+09:00', endsAt: '2026-10-01T00:00:00+09:00' },
  { id: 'CAM-003', name: '철강 기획전', category: 'CAT-001', description: '철강 자재 편성 준비', enabled: false, order: 3, startsAt: '2026-09-01T00:00:00+09:00', endsAt: '2026-10-01T00:00:00+09:00' },
]
export const invoices: Invoice[] = [
  { id: 'BILL-0801', customerId: 'CUS-001', type: '보관료', date: '2026-08-29T16:45:00+09:00', period: '2026-08', status: '수납 완료', estimate: null, lines: [{ label: 'C-07 야적장 보관료 · 8월분', amount: 45000 }], locationId: 'LOC-C07' },
  { id: 'BILL-0901', customerId: 'CUS-001', type: '폐기 비용', date: '2026-09-01T10:00:00+09:00', period: '2026-09', status: '청구 완료', estimate: 60000, lines: [{ label: '폐기 처리비', amount: 45000 }, { label: '운반비', amount: 20000 }], receiptId: 'RCV-0827' },
  { id: 'BILL-0902', customerId: 'CUS-002', type: '폐기 비용', date: '2026-09-03T10:00:00+09:00', period: '2026-09', status: '미청구', estimate: 48000, lines: [], receiptId: 'RCV-0902' },
  { id: 'BILL-0903', customerId: 'CUS-002', type: '보관료', date: '2026-09-10T10:00:00+09:00', period: '2026-09', status: '청구 완료', estimate: null, lines: [{ label: 'A-03 창고 보관료 · 9월 1~10일', amount: 80000 }], locationId: 'LOC-A03' },
  { id: 'PAY-0901', customerId: 'CUS-002', type: '판매 정산', date: '2026-09-05T10:00:00+09:00', period: '2026-09', status: '정산 완료', estimate: null, lines: [{ label: '과거 출고 구조목 정산 · 현재 재고 제외', amount: 3480000 }] },
]
export const inquiries: Inquiry[] = [
  { id: 'INQ-001', customerId: 'CUS-001', date: '2026-09-10T09:00:00+09:00', type: '검수 이의', title: '폐기 대상 수량 확인 요청', text: '블록 50개의 파손 상태와 검수 사진을 확인하고 싶습니다.', status: '미답변', answer: null, receiptId: 'RCV-0908' },
  { id: 'INQ-002', customerId: 'CUS-003', date: '2026-09-14T09:15:00+09:00', type: '입고', title: '수거 일정 문의', text: '오전 9시부터 11시 사이 수거가 가능한가요?', status: '확인 중', answer: null, receivingId: 'REQ-0914-01' },
  { id: 'INQ-003', customerId: 'CUS-003', date: '2026-09-14T10:15:00+09:00', type: '구매', title: '운반비 포함 견적 요청', text: '두 상품을 함께 배송하는 경우 운반비를 알고 싶습니다.', status: '미답변', answer: null, quoteId: 'QUO-0914' },
  { id: 'INQ-004', customerId: 'CUS-002', date: '2026-09-11T10:00:00+09:00', type: '서비스', title: '보관료 산정 기준 문의', text: '자재별이 아닌 위치별로 청구되는지 궁금합니다.', status: '답변 완료', answer: '점유 로케이션과 계약 기간에 따라 청구됩니다. 개별 계약 내용을 확인해 주세요. (답변 예시)' },
]

export const campaignStatus = (campaign: Campaign) => !campaign.enabled ? '노출 중지' : referenceDate < campaign.startsAt ? '예약' : referenceDate >= campaign.endsAt ? '종료' : '진행 중'
export const invoiceAmount = (invoice: Invoice) => invoice.lines.length ? invoice.lines.reduce((sum, line) => sum + line.amount, 0) : null
export const customerForSite = (siteId: string) => sites.find((site) => site.id === siteId)!.customerId
export const siteForReceipt = (receiptId: string) => receivings.find((request) => request.id === inspections.find((receipt) => receipt.id === receiptId)!.receivingId)!.siteId