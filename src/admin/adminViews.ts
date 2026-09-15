import { campaigns, campaignStatus, customerForSite, customers, dateText, inspections, inquiries, inventory, invoiceAmount, invoices, locations, money, products, quotes, receivings, saleRequests, siteForReceipt, sites } from './adminData'

export type MenuId = 'dashboard' | 'receiving' | 'inspections' | 'inventory' | 'market' | 'billing' | 'customers' | 'settings'
export type AdminLink = { label: string; menu: MenuId; tab: string; id?: string; status?: string; customer?: string }
export type DetailSection = { title: string; headers: string[]; rows: string[][] }
export type AdminRow = { id: string; title: string; status: string; customerId?: string; date?: string; cells: string[]; fields: [string, string][]; sections?: DetailSection[]; links: AdminLink[]; note?: string }
export type AdminView = { title: string; headers: string[]; rows: AdminRow[]; note?: string }
export const menus: { id: MenuId; label: string; tabs: { id: string; label: string }[] }[] = [
  { id: 'dashboard', label: '대시보드', tabs: [] },
  { id: 'receiving', label: '견적·입고', tabs: [{ id: 'requests', label: '입고 신청' }, { id: 'schedule', label: '입고 일정' }] },
  { id: 'inspections', label: '검수·폐기', tabs: [{ id: 'receipts', label: '입고 검수' }] },
  { id: 'inventory', label: '재고·로케이션', tabs: [{ id: 'stock', label: '재고' }, { id: 'locations', label: '로케이션' }] },
  { id: 'market', label: '마켓 운영', tabs: [{ id: 'sales', label: '판매 요청' }, { id: 'products', label: '상품' }, { id: 'quotes', label: '구매 견적' }, { id: 'campaigns', label: '기획전' }] },
  { id: 'billing', label: '보관료·정산', tabs: [{ id: 'storage', label: '보관료' }, { id: 'payouts', label: '판매 정산' }, { id: 'disposal', label: '폐기 청구' }] },
  { id: 'customers', label: '고객·문의', tabs: [{ id: 'companies', label: '고객사' }, { id: 'sites', label: '현장' }, { id: 'inquiries', label: '문의' }] },
  { id: 'settings', label: '기준정보', tabs: [{ id: 'categories', label: '자재 분류' }, { id: 'grades', label: '등급·단위' }, { id: 'rates', label: '요금 기준' }, { id: 'policies', label: '안내 정책' }] },
]
export const adminHref = (link: AdminLink) => {
  const params = new URLSearchParams({ tab: link.tab })
  if (link.id) params.set('id', link.id)
  if (link.status) params.set('status', link.status)
  if (link.customer) params.set('customer', link.customer)
  return `#/admin/${link.menu}?${params}`
}
const customerName = (id: string) => customers.find((customer) => customer.id === id)!.name
const customerLink = (id: string): AdminLink => ({ label: customerName(id), menu: 'customers', tab: 'companies', id })
const receiptLink = (id: string): AdminLink => ({ label: id, menu: 'inspections', tab: 'receipts', id })
const assetLink = (id: string): AdminLink => ({ label: id, menu: 'inventory', tab: 'stock', id })
const requestLink = (id: string): AdminLink => ({ label: id, menu: 'receiving', tab: 'requests', id })
const siteLink = (id: string): AdminLink => ({ label: sites.find((site) => site.id === id)!.name, menu: 'customers', tab: 'sites', id })
const invoiceTab = (type: string) => type === '보관료' ? 'storage' : type === '판매 정산' ? 'payouts' : 'disposal'
const qty = (value: number | null, unit: string) => value === null ? '미확정' : `${value.toLocaleString('ko-KR')} ${unit}`

const receivingRows: AdminRow[] = receivings.map((request) => {
  const site = sites.find((item) => item.id === request.siteId)!
  const customer = customers.find((item) => item.id === site.customerId)!
  return { id: request.id, title: request.summary, status: request.status, customerId: customer.id, date: request.date,
    cells: [request.id, dateText(request.date), customer.name, site.name, request.volume, request.status],
    fields: [['신청번호', request.id], ['고객사', customer.name], ['현장명', site.name], ['담당자', customer.manager], ['연락처', customer.phone], ['접수일', dateText(request.date)], ['차량 기준 예상물량', request.volume], ['입고 예정일', dateText(request.scheduledAt)], ['폐기 규정 동의일', dateText(request.termsAt)], ['운반비 견적 (예시)', money(request.estimate)], ['자재 사진', '미등록'], ['요청 메모', request.note]],
    links: [customerLink(customer.id), siteLink(site.id), ...inspections.filter((receipt) => receipt.receivingId === request.id).map((receipt) => receiptLink(receipt.id))],
  }
})
const inspectionRows: AdminRow[] = inspections.map((receipt) => {
  const siteId = siteForReceipt(receipt.id)
  const customerId = customerForSite(siteId)
  return { id: receipt.id, title: `${sites.find((site) => site.id === siteId)!.name} 검수`, customerId, date: receipt.date, status: receipt.status,
    cells: [receipt.id, customerName(customerId), dateText(receipt.date), dateText(receipt.inspectedAt), receipt.status, receipt.disposalStatus],
    fields: [['입고번호', receipt.id], ['검수 상태', receipt.status], ['입고 일자', dateText(receipt.date)], ['검수 완료일', dateText(receipt.inspectedAt)], ['결과 안내일', dateText(receipt.notifiedAt)], ['고객 확인일', dateText(receipt.acknowledgedAt)], ['폐기 처리 상태', receipt.disposalStatus], ['처리 증빙', receipt.evidence ?? '미등록'], ['검수 사진', '미등록']],
    sections: [{ title: '입고 및 검수 수량', headers: ['자재', '등급', '입고물량', '입고 완료', '폐기 대상'], rows: receipt.materials.map((material) => [material.name, material.grade ?? '미판정', qty(material.received, material.unit), qty(material.usable, material.unit), qty(material.disposal, material.unit)]) }, { title: '폐기 판정 내역', headers: ['자재', '폐기 사유', '대상 수량', '실제 처리'], rows: receipt.materials.filter((material) => material.disposal !== 0).map((material) => [material.name, material.reason, qty(material.disposal, material.unit), qty(material.processed, material.unit)]) }],
    links: [requestLink(receipt.receivingId), customerLink(customerId), ...receipt.materials.flatMap((material) => material.assetId ? [assetLink(material.assetId)] : []), ...inquiries.filter((item) => item.receiptId === receipt.id).map((item): AdminLink => ({ label: item.title, menu: 'customers', tab: 'inquiries', id: item.id })), ...invoices.filter((item) => item.receiptId === receipt.id).map((item): AdminLink => ({ label: item.id, menu: 'billing', tab: invoiceTab(item.type), id: item.id }))],
    note: '검수 종료와 실제 폐기 완료는 별도 상태입니다. 3일 자동 완료는 정책 참고이며 이 시안에서 실행되지 않습니다.',
  }
})
const inventoryRows: AdminRow[] = inventory.map((asset) => {
  const siteId = siteForReceipt(asset.receiptId)
  const customerId = customerForSite(siteId)
  const location = locations.find((item) => item.id === asset.locationId)!
  return { id: asset.id, title: asset.name, status: asset.status, customerId,
    cells: [asset.id, asset.name, customerName(customerId), asset.grade, qty(asset.quantity, asset.unit), location.name, asset.saleStatus, money(asset.appraisal)],
    fields: [['재고번호', asset.id], ['고객사', customerName(customerId)], ['현장', sites.find((site) => site.id === siteId)!.name], ['자재명', asset.name], ['규격', asset.specification], ['등급', asset.grade], ['재고 수량', qty(asset.quantity, asset.unit)], ['평가금액 (총액)', money(asset.appraisal)], ['보관 상태', asset.status], ['판매 상태', asset.saleStatus], ['로케이션', location.name]],
    links: [receiptLink(asset.receiptId), customerLink(customerId), siteLink(siteId), { label: location.name, menu: 'inventory', tab: 'locations', id: location.id }, ...saleRequests.filter((item) => item.assetId === asset.id).map((item): AdminLink => ({ label: item.id, menu: 'market', tab: 'sales', id: item.id }))],
  }
})
const locationRows: AdminRow[] = locations.map((location) => {
  const stock = inventory.filter((asset) => asset.locationId === location.id)
  return { id: location.id, title: location.name, status: location.status, cells: [location.id, location.name, location.zone, `${stock.length}종`, location.status], fields: [['로케이션', location.name], ['구역', location.zone], ['점유 품목', `${stock.length}종`], ['요금 단가', location.rate === null ? '미설정' : money(location.rate)]], sections: [{ title: '점유 재고', headers: ['재고번호', '자재', '수량'], rows: stock.map((asset) => [asset.id, asset.name, qty(asset.quantity, asset.unit)]) }], links: stock.map((asset) => assetLink(asset.id)), note: '서로 다른 단위의 수량은 합산하지 않습니다. 면적·용량 기준 미설정으로 가동률을 계산하지 않습니다.' }
})
const saleRows: AdminRow[] = saleRequests.map((request) => {
  const asset = inventory.find((item) => item.id === request.assetId)!
  const customerId = customerForSite(siteForReceipt(asset.receiptId))
  return { id: request.id, title: asset.name, status: request.status, customerId, date: request.date, cells: [request.id, dateText(request.date), asset.name, customerName(customerId), qty(request.quantity, asset.unit), money(request.desiredAmount), request.status], fields: [['판매 요청번호', request.id], ['자재', asset.name], ['요청 수량', qty(request.quantity, asset.unit)], ['판매 희망금액 (총액)', money(request.desiredAmount)], ['정밀 검수', request.inspection], ['승인 상태', request.status]], links: [assetLink(asset.id), customerLink(customerId)], note: '판매용 정밀 검수는 최초 입고 검수와 별도입니다. 승인 및 고객 발송은 지원하지 않습니다.' }
})
const productRows: AdminRow[] = products.map((product) => {
  const asset = inventory.find((item) => item.id === product.assetId)!
  const customerId = customerForSite(siteForReceipt(asset.receiptId))
  return { id: product.id, title: product.name, status: product.status, customerId, cells: [product.id, product.name, product.category, asset.grade, `${money(product.price)} / ${product.unit}`, product.status], fields: [['상품번호', product.id], ['상품명', product.name], ['카테고리', product.category], ['등급', asset.grade], ['판매 단가', `${money(product.price)} / ${product.unit}`], ['연결 재고', qty(asset.quantity, asset.unit)], ['규격', asset.specification], ['노출 상태', product.status]], links: [assetLink(asset.id), customerLink(customerId), ...quotes.filter((quote) => quote.lines.some((line) => line.productId === product.id)).map((quote): AdminLink => ({ label: quote.id, menu: 'market', tab: 'quotes', id: quote.id }))] }
})
const quoteRows: AdminRow[] = quotes.map((quote) => ({ id: quote.id, title: `${customerName(quote.customerId)} 구매 견적`, status: quote.status, customerId: quote.customerId, date: quote.date, cells: [quote.id, dateText(quote.date), customerName(quote.customerId), `${quote.lines.length}종`, dateText(quote.dueAt), quote.status], fields: [['견적번호', quote.id], ['구매 고객', customerName(quote.customerId)], ['희망 납기일', dateText(quote.dueAt)], ['납품지', quote.address], ['요청사항', quote.note], ['상태', quote.status]], sections: [{ title: '요청 상품 스냅샷', headers: ['상품', '수량', '견적 단가', '자재 금액'], rows: quote.lines.map((line) => [line.name, qty(line.quantity, line.unit), money(line.unitPrice), money(line.unitPrice === null ? null : line.unitPrice * line.quantity)]) }], links: [customerLink(quote.customerId), ...quote.lines.map((line): AdminLink => ({ label: line.name, menu: 'market', tab: 'products', id: line.productId }))] }))
const campaignRows: AdminRow[] = campaigns.map((campaign) => {
  const included = products.filter((product) => product.category === campaign.category && product.status === '판매 중')
  return { id: campaign.id, title: campaign.name, status: campaignStatus(campaign), date: campaign.startsAt, cells: [campaign.name, campaign.category, String(campaign.order), `${dateText(campaign.startsAt)} ~ ${dateText(campaign.endsAt)}`, `${included.length}개`, campaignStatus(campaign)], fields: [['기획전번호', campaign.id], ['제목', campaign.name], ['설명', campaign.description], ['카테고리', campaign.category], ['노출 설정', campaign.enabled ? '사용' : '중지'], ['노출 순서', String(campaign.order)], ['시작일 (포함)', dateText(campaign.startsAt)], ['종료일 (미포함)', dateText(campaign.endsAt)]], sections: [{ title: '카테고리 상품 미리보기', headers: ['상품번호', '상품명', '판매 단가'], rows: included.map((product) => [product.id, product.name, `${money(product.price)} / ${product.unit}`]) }], links: included.map((product): AdminLink => ({ label: product.name, menu: 'market', tab: 'products', id: product.id })), note: '현재 카테고리 기반 편성입니다. 개별 상품 선택 편성이나 실제 노출 변경은 하지 않습니다.' }
})
const invoiceRows: AdminRow[] = invoices.map((invoice) => ({ id: invoice.id, title: `${customerName(invoice.customerId)} ${invoice.type}`, customerId: invoice.customerId, date: invoice.date, status: invoice.status, cells: [invoice.id, dateText(invoice.date), customerName(invoice.customerId), invoice.period, money(invoiceAmount(invoice)), invoice.status], fields: [['명세번호', invoice.id], ['고객사', customerName(invoice.customerId)], ['구분', invoice.type], ['대상 기간', invoice.period], ['최초 예상액', money(invoice.estimate)], ['청구·정산 금액', money(invoiceAmount(invoice))], ['상태', invoice.status]], sections: [{ title: '명세 항목', headers: ['항목', '금액'], rows: invoice.lines.map((line) => [line.label, money(line.amount)]) }], links: [customerLink(invoice.customerId), ...(invoice.receiptId ? [receiptLink(invoice.receiptId)] : []), ...(invoice.locationId ? [{ label: invoice.locationId, menu: 'inventory' as const, tab: 'locations', id: invoice.locationId }] : [])], note: '예시 금액은 부가세 포함입니다. 미산정 금액은 0원이 아니며 미청구 예상액은 합계에서 제외합니다.' }))
const customerRows: AdminRow[] = customers.map((customer) => ({ id: customer.id, title: customer.name, customerId: customer.id, status: customer.status, cells: [customer.id, customer.name, customer.manager, customer.phone, customer.status], fields: [['고객번호', customer.id], ['고객사', customer.name], ['담당자', customer.manager], ['연락처', customer.phone], ['이메일', customer.email], ['이용 상태', customer.status]], links: [...sites.filter((site) => site.customerId === customer.id).map((site) => siteLink(site.id)), { label: '고객 문의', menu: 'customers', tab: 'inquiries', customer: customer.id }, { label: '보관료 명세', menu: 'billing', tab: 'storage', customer: customer.id }] }))
const siteRows: AdminRow[] = sites.map((site) => ({ id: site.id, title: site.name, customerId: site.customerId, status: site.status, cells: [site.id, site.name, customerName(site.customerId), site.address, site.status], fields: [['현장번호', site.id], ['현장명', site.name], ['고객사', customerName(site.customerId)], ['주소', site.address], ['운영 상태', site.status]], links: [customerLink(site.customerId), ...receivings.filter((request) => request.siteId === site.id).map((request) => requestLink(request.id))] }))
const inquiryRows: AdminRow[] = inquiries.map((inquiry) => ({ id: inquiry.id, title: inquiry.title, customerId: inquiry.customerId, date: inquiry.date, status: inquiry.status, cells: [inquiry.id, dateText(inquiry.date), inquiry.type, customerName(inquiry.customerId), inquiry.title, inquiry.status], fields: [['문의번호', inquiry.id], ['문의 유형', inquiry.type], ['접수일', dateText(inquiry.date)], ['고객사', customerName(inquiry.customerId)], ['문의 원문', inquiry.text], ['답변', inquiry.answer ?? '미답변']], links: [customerLink(inquiry.customerId), ...(inquiry.receiptId ? [receiptLink(inquiry.receiptId)] : []), ...(inquiry.receivingId ? [requestLink(inquiry.receivingId)] : []), ...(inquiry.quoteId ? [{ label: inquiry.quoteId, menu: 'market' as const, tab: 'quotes', id: inquiry.quoteId }] : [])] }))

const referenceRows = (items: [string, string, string][]): AdminRow[] => items.map(([id, title, content]) => ({ id, title, status: '참고 기준', cells: [id, title, content], fields: [['코드', id], ['항목', title], ['내용', content]], links: [] }))
export const views: Record<string, AdminView> = {
  'receiving/requests': { title: '입고 신청', headers: ['신청번호', '접수일', '고객사', '현장', '예상물량', '상태'], rows: receivingRows },
  'receiving/schedule': { title: '입고 일정', headers: ['신청번호', '입고 예정일', '고객사', '현장', '예상물량', '상태'], rows: receivingRows.filter((row) => receivings.find((request) => request.id === row.id)!.scheduledAt).map((row) => { const scheduledAt = receivings.find((request) => request.id === row.id)!.scheduledAt!; return { ...row, date: scheduledAt, cells: row.cells.map((cell, index) => index === 1 ? dateText(scheduledAt) : cell) } }) },
  'inspections/receipts': { title: '입고 검수', headers: ['입고번호', '고객사', '입고일', '검수 완료일', '검수 상태', '폐기 상태'], rows: inspectionRows },
  'inventory/stock': { title: '재고', headers: ['재고번호', '자재', '고객사', '등급', '수량', '로케이션', '판매 상태', '평가금액'], rows: inventoryRows },
  'inventory/locations': { title: '로케이션', headers: ['위치번호', '로케이션', '구역', '점유 품목', '상태'], rows: locationRows },
  'market/sales': { title: '판매 요청', headers: ['요청번호', '요청일', '자재', '고객사', '수량', '희망금액 (총액)', '상태'], rows: saleRows },
  'market/products': { title: '상품', headers: ['상품번호', '상품명', '카테고리', '등급', '판매 단가', '상태'], rows: productRows },
  'market/quotes': { title: '구매 견적', headers: ['견적번호', '신청일', '구매 고객', '품목 수', '희망 납기', '상태'], rows: quoteRows },
  'market/campaigns': { title: '기획전', headers: ['기획전', '카테고리', '순서', '노출 기간', '상품 수', '상태'], rows: campaignRows, note: '노출 기간은 한국 시간 기준이며 종료일은 포함하지 않습니다.' },
  ...Object.fromEntries((['보관료', '판매 정산', '폐기 비용'] as const).map((type) => [`billing/${invoiceTab(type)}`, { title: type, headers: ['명세번호', '기록일', '고객사', '대상 기간', '청구·정산 금액', '상태'], rows: invoiceRows.filter((row) => invoices.find((invoice) => invoice.id === row.id)!.type === type) }])),
  'customers/companies': { title: '고객사', headers: ['고객번호', '고객사', '담당자', '연락처', '상태'], rows: customerRows },
  'customers/sites': { title: '현장', headers: ['현장번호', '현장명', '고객사', '주소', '상태'], rows: siteRows },
  'customers/inquiries': { title: '문의', headers: ['문의번호', '접수일', '유형', '고객사', '제목', '상태'], rows: inquiryRows },
  'settings/categories': { title: '자재 분류', headers: ['코드', '분류', '내용'], rows: referenceRows([['CAT-01', '철강 / 금속', '철근, H빔, 금속 프레임'], ['CAT-02', '목재 / 합판', '구조목, 합판'], ['CAT-03', '배관 / 파이프', '배관 및 부자재'], ['CAT-04', '콘크리트 / 시멘트', '블록, 타일']]) },
  'settings/grades': { title: '등급·단위', headers: ['코드', '구분', '내용'], rows: referenceRows([['GRADE', '품질 등급', 'S / A / B / F · 상세 판정 기준 미등록'], ['STOCK-UNIT', '재고 단위', '개 / m / m³ / ton / kg / 본 · 동일 단위만 합산'], ['TRUCK', '입고 예상물량', '1톤 이하 / 2.5톤 / 5톤 이상 · 차량 기준']]) },
  'settings/rates': { title: '요금 기준', headers: ['코드', '항목', '내용'], rows: referenceRows([['STORAGE', '보관료 단가', '미설정 · 로케이션 및 계약별 확정 필요'], ['DISPOSAL', '폐기 처리 단가', '미설정 · 자재 및 운반 조건별 확정 필요'], ['VAT', '예시 명세 금액', '부가세 포함 · 자동 세액 계산 없음']]) },
  'settings/policies': { title: '안내 정책', headers: ['코드', '정책', '내용'], rows: referenceRows([['AUTO-CLOSE', '검수 자동 완료 안내', '입고 완료일 기준 3일 · 자동 변경 미구현'], ['OBJECTION', '의견 및 이의 접수', '3일 이내 문의 안내 · 접수 기한 강제 제한 없음'], ['DISPOSAL-FEE', '폐기 비용', '폐기 대상에 따라 별도 처리 비용 청구 가능'], ['VISIBILITY', '기획전 노출', '시작 포함 / 종료 미포함 · 카테고리 기반']]) },
}

export const dashboardMetrics: (AdminLink & { count: number })[] = [
  { label: '입고 접수 대기', menu: 'receiving', tab: 'requests', status: '접수 대기', count: receivings.filter((item) => item.status === '접수 대기').length },
  { label: '입고 검수 대기', menu: 'inspections', tab: 'receipts', status: '검수 대기', count: inspections.filter((item) => item.status === '검수 대기').length },
  { label: '판매 승인 대기', menu: 'market', tab: 'sales', status: '승인 대기', count: saleRequests.filter((item) => item.status === '승인 대기').length },
  { label: '미답변 문의', menu: 'customers', tab: 'inquiries', status: '미답변', count: inquiries.filter((item) => item.status === '미답변').length },
  { label: '미수 보관료', menu: 'billing', tab: 'storage', status: '청구 완료', count: invoices.filter((item) => item.type === '보관료' && item.status === '청구 완료').length },
]