import { campaigns, campaignStatus, customerForSite, customers, dateText, inspections, inquiries, invoiceAmount, invoices, locations, memberAccounts, money, products, quotes, receivings, saleRequests, siteForReceipt, sites, type AdminImage, type Inventory, type Location, type MasterItem, type MemberAccount, type Receiving } from './adminData'
import { categoryEnabled, categoryMatches, categoryPath, materialCategories, type MaterialCategory } from '../categories'
import { detailedInspectionStatus, type MarketData } from './adminMarket'

export type MenuId = 'dashboard' | 'receiving' | 'inspections' | 'categories' | 'items' | 'inventory' | 'market' | 'billing' | 'customers' | 'members' | 'settings'
export type AdminLink = { label: string; menu: MenuId; tab: string; id?: string; status?: string; customer?: string }
export type DetailSection = { title: string; headers: string[]; rows: string[][] }
export type AdminRow = { id: string; title: string; status: string; customerId?: string; date?: string; cells: string[]; fields: [string, string][]; sections?: DetailSection[]; links: AdminLink[]; note?: string; images?: AdminImage[]; grade?: string; saleStatus?: string; inspectionStatus?: string; itemId?: string; locationId?: string; categoryId?: string }
export type AdminView = { title: string; headers: string[]; rows: AdminRow[]; note?: string }
export const menus: { id: MenuId; label: string; tabs: { id: string; label: string }[] }[] = [
  { id: 'dashboard', label: '대시보드', tabs: [] },
  { id: 'receiving', label: '견적·입고', tabs: [{ id: 'requests', label: '입고 신청' }] },
  { id: 'inspections', label: '검수·폐기', tabs: [{ id: 'primary', label: '1차 검수' }, { id: 'detailed', label: '상세 검수' }, { id: 'disposal', label: '폐기 관리' }] },
  { id: 'items', label: '품목 관리', tabs: [{ id: 'master', label: '품목 목록' }] },
  { id: 'categories', label: '카테고리 관리', tabs: [{ id: 'tree', label: '카테고리 분류' }] },
  { id: 'inventory', label: '자산 관리', tabs: [{ id: 'stock', label: '자산 목록' }, { id: 'locations', label: '로케이션' }] },
  { id: 'market', label: '마켓 운영', tabs: [{ id: 'sales', label: '판매 요청' }, { id: 'products', label: '상품' }, { id: 'quotes', label: '구매 견적' }, { id: 'campaigns', label: '기획전' }] },
  { id: 'billing', label: '보관료·정산', tabs: [{ id: 'storage', label: '보관료' }, { id: 'payouts', label: '판매 정산' }, { id: 'disposal', label: '폐기 청구' }] },
  { id: 'customers', label: '고객·문의', tabs: [{ id: 'companies', label: '고객사' }, { id: 'sites', label: '현장' }, { id: 'inquiries', label: '문의' }] },
  { id: 'members', label: '회원 관리', tabs: [{ id: 'list', label: '회원 목록' }, { id: 'applications', label: '가입 신청' }] },
  { id: 'settings', label: '기준정보', tabs: [{ id: 'grades', label: '등급·단위' }, { id: 'rates', label: '요금 기준' }, { id: 'policies', label: '안내 정책' }] },
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
const receiptLink = (id: string): AdminLink => ({ label: id, menu: 'inspections', tab: 'primary', id })
const assetLink = (id: string): AdminLink => ({ label: id, menu: 'inventory', tab: 'stock', id })
const requestLink = (id: string): AdminLink => ({ label: id, menu: 'receiving', tab: 'requests', id })
const siteLink = (id: string): AdminLink => ({ label: sites.find((site) => site.id === id)!.name, menu: 'customers', tab: 'sites', id })
const invoiceTab = (type: string) => type === '보관료' ? 'storage' : type === '판매 정산' ? 'payouts' : 'disposal'
const qty = (value: number | null, unit: string) => value === null ? '미확정' : `${value.toLocaleString('ko-KR')} ${unit}`
const campaignDateText = (value: string) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value))

export function createAdminViews(inventory: Inventory[], masterItems: MasterItem[], categories: MaterialCategory[] = materialCategories, market: MarketData = { sales: saleRequests, products, quotes, campaigns }, members: MemberAccount[] = memberAccounts, locationRecords: Location[] = locations, receivingRecords: Receiving[] = receivings): Record<string, AdminView> {
const { sales: saleRequests, products, quotes, campaigns } = market
const categoryLink = (id: string): AdminLink => ({ label: categoryPath(categories, id), menu: 'categories', tab: 'tree', id })
const receivingRows: AdminRow[] = receivingRecords.map((request) => {
  const site = sites.find((item) => item.id === request.siteId)!
  const customer = customers.find((item) => item.id === site.customerId)!
  return { id: request.id, title: request.summary, status: request.status, customerId: customer.id, date: request.date,
    cells: [request.id, dateText(request.date), request.channel, customer.name, site.name, request.volume, request.status],
    fields: [['신청번호', request.id], ['고객사', customer.name], ['현장명', site.name], ['담당자', customer.manager], ['연락처', customer.phone], ['접수일', dateText(request.date)], ['신청 경로', request.channel], ['차량 기준 예상물량', request.volume], ['입고 예정일', dateText(request.scheduledAt)], ['폐기 규정 동의일', dateText(request.termsAt)], ['운반비 견적 (예시)', money(request.estimate)], ['자재 사진', '미등록'], ['요청 메모', request.note]],
    links: [customerLink(customer.id), siteLink(site.id), ...inspections.filter((receipt) => receipt.receivingId === request.id).map((receipt) => receiptLink(receipt.id))],
  }
})
const inspectionRows: AdminRow[] = inspections.map((receipt) => {
  const siteId = siteForReceipt(receipt.id)
  const customerId = customerForSite(siteId)
  const createdAssets = inventory.filter((asset) => asset.receiptId === receipt.id)
  const disposalQuantity = receipt.materials.reduce((sum, material) => sum + (material.disposal ?? 0), 0)
  return { id: receipt.id, title: `${sites.find((site) => site.id === siteId)!.name} 검수`, customerId, date: receipt.date, status: receipt.status,
    cells: [receipt.receivingId, receipt.id, customerName(customerId), dateText(receipt.date), `${createdAssets.length}건`, disposalQuantity ? disposalQuantity.toLocaleString('ko-KR') : '없음', receipt.status],
    fields: [['입고 신청번호', receipt.receivingId], ['1차 검수번호', receipt.id], ['검수 상태', receipt.status], ['입고 일자', dateText(receipt.date)], ['검수 완료일', dateText(receipt.inspectedAt)], ['생성 자산', `${createdAssets.length}건`], ['결과 안내일', dateText(receipt.notifiedAt)], ['고객 확인일', dateText(receipt.acknowledgedAt)], ['폐기 처리 상태', receipt.disposalStatus], ['처리 증빙', receipt.evidence ?? '미등록'], ['검수 사진', '미등록']],
    sections: [{ title: '1차 검수 결과 및 자산 원시 데이터', headers: ['자재', '등급', '입고 수량', '자산 생성 수량', '폐기 대상'], rows: receipt.materials.map((material) => [material.name, material.grade ?? '미판정', qty(material.received, material.unit), qty(material.usable, material.unit), qty(material.disposal, material.unit)]) }, { title: '폐기 판정 내역', headers: ['자재', '폐기 사유', '대상 수량', '실제 처리'], rows: receipt.materials.filter((material) => material.disposal !== 0).map((material) => [material.name, material.reason, qty(material.disposal, material.unit), qty(material.processed, material.unit)]) }],
    links: [requestLink(receipt.receivingId), customerLink(customerId), ...inventory.filter((asset) => asset.receiptId === receipt.id).map((asset) => assetLink(asset.id)), ...inquiries.filter((item) => item.receiptId === receipt.id).map((item): AdminLink => ({ label: item.title, menu: 'customers', tab: 'inquiries', id: item.id })), ...invoices.filter((item) => item.receiptId === receipt.id).map((item): AdminLink => ({ label: item.id, menu: 'billing', tab: invoiceTab(item.type), id: item.id }))],
    note: '1차 검수 완료 시 재사용 가능 수량을 기준으로 자산 원시 데이터가 생성됩니다. 폐기 대상은 자산 수량에서 제외됩니다.',
  }
})
const detailedInspectionRows: AdminRow[] = saleRequests.map((request) => {
  const asset = inventory.find((item) => item.id === request.assetId)!
  const status = detailedInspectionStatus(request)
  return { id: request.id, title: `${asset.name} 상세 검수`, status, customerId: asset.customerId, date: request.date,
    cells: [request.id, asset.id, asset.receivingId, customerName(asset.customerId), qty(request.quantity, asset.unit), status],
    fields: [['판매 요청번호', request.id], ['자산번호', asset.id], ['입고 신청번호', asset.receivingId], ['고객사', customerName(asset.customerId)], ['상세 검수 상태', status], ['판매 요청 수량', qty(request.quantity, asset.unit)], ['품목코드', asset.itemId], ['카테고리', categoryPath(categories, asset.category)], ['규격', asset.specification || '미등록'], ['브랜드', asset.brand || '미등록'], ['품질 등급', asset.grade], ['평가금액', money(asset.appraisal)]],
    sections: [{ title: '자산 상세화 항목', headers: ['항목', '현재 데이터', '처리 상태'], rows: [['품목 및 카테고리', `${asset.itemId} · ${categoryPath(categories, asset.category)}`, '등록'], ['규격 및 브랜드', `${asset.specification || '미등록'} · ${asset.brand || '미등록'}`, asset.specification && asset.brand ? '등록' : '보완 필요'], ['등급 및 평가금액', `${asset.grade} · ${money(asset.appraisal)}`, asset.appraisal === null ? '보완 필요' : '등록'], ['판매 요청 수량', qty(request.quantity, asset.unit), '확인 대상']] }],
    links: [assetLink(asset.id), { label: request.id, menu: 'market', tab: 'sales', id: request.id }, requestLink(asset.receivingId), customerLink(asset.customerId)],
    note: '판매 요청이 접수된 자산만 상세 검수 대상입니다. 상세 검수에서 규격·브랜드·등급·평가 정보를 보완한 후 판매 승인으로 이어집니다.',
  }
})
const disposalRows: AdminRow[] = inspections.filter((receipt) => receipt.materials.some((material) => (material.disposal ?? 0) > 0)).map((receipt) => {
  const siteId = siteForReceipt(receipt.id)
  const customerId = customerForSite(siteId)
  const disposalMaterials = receipt.materials.filter((material) => (material.disposal ?? 0) > 0)
  return { id: receipt.id, title: `${sites.find((site) => site.id === siteId)!.name} 폐기`, customerId, date: receipt.inspectedAt ?? receipt.date, status: receipt.disposalStatus,
    cells: [receipt.receivingId, receipt.id, customerName(customerId), `${disposalMaterials.length}종`, receipt.disposalStatus],
    fields: [['입고 신청번호', receipt.receivingId], ['1차 검수번호', receipt.id], ['고객사', customerName(customerId)], ['폐기 대상 품목', `${disposalMaterials.length}종`], ['폐기 처리 상태', receipt.disposalStatus], ['처리 증빙', receipt.evidence ?? '미등록']],
    sections: [{ title: '폐기 대상 및 처리 내역', headers: ['자재', '폐기 사유', '판정 수량', '처리 수량'], rows: disposalMaterials.map((material) => [material.name, material.reason, qty(material.disposal, material.unit), qty(material.processed, material.unit)]) }],
    links: [receiptLink(receipt.id), requestLink(receipt.receivingId), customerLink(customerId), ...invoices.filter((item) => item.receiptId === receipt.id).map((item): AdminLink => ({ label: item.id, menu: 'billing', tab: invoiceTab(item.type), id: item.id }))],
    note: '1차 검수에서 걸러진 폐기 대상만 표시합니다. 폐기 처리와 비용 청구는 각각 별도 상태로 관리합니다.',
  }
})
const inventoryRows: AdminRow[] = inventory.map((asset) => {
  const siteId = receivingRecords.find((request) => request.id === asset.receivingId)!.siteId
  const customerId = asset.customerId
  const location = locationRecords.find((item) => item.id === asset.locationId)
  return { id: asset.id, title: asset.name, status: asset.status, customerId, images: asset.images, grade: asset.grade, saleStatus: asset.saleStatus, itemId: asset.itemId, locationId: asset.locationId, categoryId: asset.category,
    cells: [asset.id, asset.itemId, asset.name, categoryPath(categories, asset.category), customerName(customerId), asset.grade, qty(asset.quantity, asset.unit), location?.name ?? '미지정', asset.status, asset.saleStatus],
    fields: [['재고번호', asset.id], ['입고 신청번호', asset.receivingId], ['품목코드', asset.itemId], ['고객사', customerName(customerId)], ['현장', sites.find((site) => site.id === siteId)!.name], ['자산명', asset.name], ['카테고리', categoryPath(categories, asset.category)], ['카테고리 사용', categoryEnabled(categories, asset.category) ? '사용' : '미사용'], ['규격', asset.specification], ['브랜드', asset.brand || '미등록'], ['등급', asset.grade], ['현재 수량', qty(asset.quantity, asset.unit)], ['평가금액 (총액)', money(asset.appraisal)], ['보관 상태', asset.status], ['판매 상태', asset.saleStatus], ['판매 승인', saleRequests.find((request) => request.assetId === asset.id)?.status ?? '요청 없음'], ['로케이션', location?.name ?? '미지정']],
    sections: [{ title: '변경 이력', headers: ['변경 시각 (KST)', '사유', '항목', '변경 전', '변경 후'], rows: [...asset.history].reverse().flatMap((entry) => entry.changes.map(([field, before, after]) => [new Date(entry.at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }), entry.reason, field, before, after])) }],
    links: [categoryLink(asset.category), { label: asset.itemId, menu: 'items', tab: 'master', id: asset.itemId }, ...(asset.receiptId ? [receiptLink(asset.receiptId)] : []), requestLink(asset.receivingId), customerLink(customerId), siteLink(siteId), ...(location ? [{ label: location.name, menu: 'inventory' as const, tab: 'locations', id: location.id }] : []), ...saleRequests.filter((item) => item.assetId === asset.id).map((item): AdminLink => ({ label: item.id, menu: 'market', tab: 'sales', id: item.id }))],
    note: '수량은 현재 잔량입니다. 입고대기는 예정 수량, 출고완료는 0으로 관리합니다. 변경 이력은 관리자 임시 수정 기록이며 부분 출고·분할 및 실제 검수·판매·정산은 실행하지 않습니다.',
  }
})
const itemRows: AdminRow[] = masterItems.map((item) => ({
  id: item.id, title: item.name, status: item.enabled ? '사용' : '미사용', images: item.images, categoryId: item.category,
  cells: [item.id, item.name, categoryPath(categories, item.category), item.specification, item.brand || '미등록', item.unit, money(item.inboundPrice), money(item.outboundPrice), money(item.standardPrice), item.enabled ? '사용' : '미사용'],
  fields: [['품목코드', item.id], ['품목명', item.name], ['카테고리', categoryPath(categories, item.category)], ['카테고리 사용', categoryEnabled(categories, item.category) ? '사용' : '미사용'], ['규격', item.specification], ['브랜드', item.brand || '미등록'], ['단위', item.unit], ['입고단가', money(item.inboundPrice)], ['출고단가', money(item.outboundPrice)], ['표준단가', money(item.standardPrice)], ['사용 구분', item.enabled ? '사용' : '미사용'], ['적요', item.note || '미등록']],
  links: [categoryLink(item.category), ...inventory.filter((asset) => asset.itemId === item.id).map((asset) => assetLink(asset.id))],
  note: '단가는 기준 단위당 원화·부가세 포함 금액입니다. 품목 변경은 기존 자산 정보와 평가·판매·정산 금액에 소급 적용되지 않습니다.',
}))
const locationRows: AdminRow[] = locationRecords.map((location) => {
  const stock = inventory.filter((asset) => asset.locationId === location.id && asset.status === '보관중' && asset.quantity > 0)
  const status = stock.length ? '사용 중' : '비어 있음'
  return { id: location.id, title: location.name, status, cells: [location.id, location.name, location.zone, `${stock.length}건`, status], fields: [['로케이션', location.name], ['구역', location.zone], ['점유 재고', `${stock.length}건`], ['요금 단가', location.rate === null ? '미설정' : money(location.rate)]], sections: [{ title: '점유 재고', headers: ['재고번호', '자재', '수량'], rows: stock.map((asset) => [asset.id, asset.name, qty(asset.quantity, asset.unit)]) }], links: stock.map((asset) => assetLink(asset.id)), note: '서로 다른 단위의 수량은 합산하지 않습니다. 면적·용량 기준 미설정으로 가동률을 계산하지 않습니다.' }
})
const saleRows: AdminRow[] = saleRequests.map((request) => {
  const asset = inventory.find((item) => item.id === request.assetId)!
  const customerId = asset.customerId
  const inspectionStatus = detailedInspectionStatus(request)
  return { id: request.id, title: asset.name, status: request.status, inspectionStatus, customerId, date: request.date, cells: [request.id, dateText(request.date), asset.name, customerName(customerId), qty(request.quantity, asset.unit), money(request.desiredAmount), inspectionStatus, request.status], fields: [['판매 요청번호', request.id], ['자재', asset.name], ['요청 수량', qty(request.quantity, asset.unit)], ['판매 희망금액 (총액)', money(request.desiredAmount)], ['상세 검수 상태', inspectionStatus], ['승인 상태', request.status]], links: [{ label: request.id, menu: 'inspections', tab: 'detailed', id: request.id }, assetLink(asset.id), customerLink(customerId)], note: '상세 검수 완료 후 판매 승인 여부를 결정합니다. 승인 상태는 임시 변경되며 상품 자동 등록·판매 시작·고객 발송은 실행하지 않습니다.' }
})
const productRows: AdminRow[] = products.map((product) => {
  const asset = inventory.find((item) => item.id === product.assetId)!
  const customerId = asset.customerId
  return { id: product.id, title: product.name, status: product.status, customerId, categoryId: asset.category, cells: [product.id, product.name, categoryPath(categories, asset.category), asset.grade, `${money(product.price)} / ${product.unit}`, product.status], fields: [['상품번호', product.id], ['상품명', product.name], ['카테고리', categoryPath(categories, asset.category)], ['카테고리 사용', categoryEnabled(categories, asset.category) ? '사용' : '미사용'], ['등급', asset.grade], ['판매 단가', `${money(product.price)} / ${product.unit}`], ['연결 재고', qty(asset.quantity, asset.unit)], ['규격', asset.specification], ['노출 상태', product.status]], links: [categoryLink(asset.category), assetLink(asset.id), customerLink(customerId), ...quotes.filter((quote) => quote.lines.some((line) => line.productId === product.id)).map((quote): AdminLink => ({ label: quote.id, menu: 'market', tab: 'quotes', id: quote.id }))] }
})
const quoteRows: AdminRow[] = quotes.map((quote) => ({ id: quote.id, title: `${customerName(quote.customerId)} 구매 견적`, status: quote.status, customerId: quote.customerId, date: quote.date, cells: [quote.id, dateText(quote.date), customerName(quote.customerId), `${quote.lines.length}종`, dateText(quote.dueAt), quote.status], fields: [['견적번호', quote.id], ['구매 고객', customerName(quote.customerId)], ['희망 납기일', dateText(quote.dueAt)], ['납품지', quote.address], ['요청사항', quote.note], ['상태', quote.status]], sections: [{ title: '요청 상품 스냅샷', headers: ['상품', '수량', '견적 단가', '자재 금액'], rows: quote.lines.map((line) => [line.name, qty(line.quantity, line.unit), money(line.unitPrice), money(line.unitPrice === null ? null : line.unitPrice * line.quantity)]) }], links: [customerLink(quote.customerId), ...quote.lines.map((line): AdminLink => ({ label: line.name, menu: 'market', tab: 'products', id: line.productId }))] }))
const campaignRows: AdminRow[] = campaigns.map((campaign) => {
  const included = products.filter((product) => { const category = inventory.find((asset) => asset.id === product.assetId)!.category; return categoryMatches(categories, category, campaign.category) && categoryEnabled(categories, category) && product.status === '판매 중' })
  return { id: campaign.id, title: campaign.name, status: campaignStatus(campaign), date: campaign.startsAt, categoryId: campaign.category, cells: [campaign.name, categoryPath(categories, campaign.category), String(campaign.order), `${campaignDateText(campaign.startsAt)} ~ ${campaignDateText(campaign.endsAt)}`, `${included.length}개`, campaignStatus(campaign)], fields: [['기획전번호', campaign.id], ['제목', campaign.name], ['설명', campaign.description], ['카테고리', categoryPath(categories, campaign.category)], ['노출 설정', campaign.enabled ? '사용' : '중지'], ['노출 순서', String(campaign.order)], ['시작 일시 (KST, 포함)', campaignDateText(campaign.startsAt)], ['종료 일시 (KST, 미포함)', campaignDateText(campaign.endsAt)]], sections: [{ title: '카테고리 상품 미리보기', headers: ['상품번호', '상품명', '판매 단가'], rows: included.map((product) => [product.id, product.name, `${money(product.price)} / ${product.unit}`]) }], links: [categoryLink(campaign.category), ...included.map((product): AdminLink => ({ label: product.name, menu: 'market', tab: 'products', id: product.id }))], note: '선택 분류의 모든 하위 분류 중 판매 중인 상품을 포함합니다. 미사용 분류의 상품은 편성에서 제외되며 실제 고객 마켓 노출 변경은 하지 않습니다.' }
})
const invoiceRows: AdminRow[] = invoices.map((invoice) => ({ id: invoice.id, title: `${customerName(invoice.customerId)} ${invoice.type}`, customerId: invoice.customerId, date: invoice.date, status: invoice.status, cells: [invoice.id, dateText(invoice.date), customerName(invoice.customerId), invoice.period, money(invoiceAmount(invoice)), invoice.status], fields: [['명세번호', invoice.id], ['고객사', customerName(invoice.customerId)], ['구분', invoice.type], ['대상 기간', invoice.period], ['최초 예상액', money(invoice.estimate)], ['청구·정산 금액', money(invoiceAmount(invoice))], ['상태', invoice.status]], sections: [{ title: '명세 항목', headers: ['항목', '금액'], rows: invoice.lines.map((line) => [line.label, money(line.amount)]) }], links: [customerLink(invoice.customerId), ...(invoice.receiptId ? [receiptLink(invoice.receiptId)] : []), ...(invoice.locationId ? [{ label: invoice.locationId, menu: 'inventory' as const, tab: 'locations', id: invoice.locationId }] : [])], note: '예시 금액은 부가세 포함입니다. 미산정 금액은 0원이 아니며 미청구 예상액은 합계에서 제외합니다.' }))
const customerRows: AdminRow[] = customers.map((customer) => ({ id: customer.id, title: customer.name, customerId: customer.id, status: customer.status, cells: [customer.id, customer.name, customer.manager, customer.phone, customer.status], fields: [['고객번호', customer.id], ['고객사', customer.name], ['담당자', customer.manager], ['연락처', customer.phone], ['이메일', customer.email], ['이용 상태', customer.status]], links: [...sites.filter((site) => site.customerId === customer.id).map((site) => siteLink(site.id)), { label: '고객 문의', menu: 'customers', tab: 'inquiries', customer: customer.id }, { label: '보관료 명세', menu: 'billing', tab: 'storage', customer: customer.id }] }))
const memberRows: AdminRow[] = members.map((member) => ({ id: member.id, title: member.companyName, status: member.status, date: member.joinedAt, cells: [member.id, member.type, member.email, member.companyName, member.managerName, member.managerPhone, dateText(member.lastLoginAt), dateText(member.joinedAt), member.status], fields: [['회원코드', member.id], ['유형', member.type], ['아이디 (이메일)', member.email], ['회사명', member.companyName], ['사업자번호', member.businessNumber], ['대표자명', member.representativeName], ['담당자', member.managerName], ['담당자 연락처', member.managerPhone], ['회사 전화번호', member.companyPhone], ['팩스 번호', member.faxNumber || '미등록'], ['최근 로그인', dateText(member.lastLoginAt)], ['가입일', dateText(member.joinedAt)], ['가입 상태', member.status]], links: [], note: member.status === '가입 승인 대기' ? '가입 신청 정보를 확인한 후 승인 처리하면 즉시 서비스 이용이 가능합니다.' : undefined }))
const siteRows: AdminRow[] = sites.map((site) => ({ id: site.id, title: site.name, customerId: site.customerId, status: site.status, cells: [site.id, site.name, customerName(site.customerId), site.address, site.status], fields: [['현장번호', site.id], ['현장명', site.name], ['고객사', customerName(site.customerId)], ['주소', site.address], ['운영 상태', site.status]], links: [customerLink(site.customerId), ...receivingRecords.filter((request) => request.siteId === site.id).map((request) => requestLink(request.id))] }))
const inquiryRows: AdminRow[] = inquiries.map((inquiry) => ({ id: inquiry.id, title: inquiry.title, customerId: inquiry.customerId, date: inquiry.date, status: inquiry.status, cells: [inquiry.id, dateText(inquiry.date), inquiry.type, customerName(inquiry.customerId), inquiry.title, inquiry.status], fields: [['문의번호', inquiry.id], ['문의 유형', inquiry.type], ['접수일', dateText(inquiry.date)], ['고객사', customerName(inquiry.customerId)], ['문의 원문', inquiry.text], ['답변', inquiry.answer ?? '미답변']], links: [customerLink(inquiry.customerId), ...(inquiry.receiptId ? [receiptLink(inquiry.receiptId)] : []), ...(inquiry.receivingId ? [requestLink(inquiry.receivingId)] : []), ...(inquiry.quoteId ? [{ label: inquiry.quoteId, menu: 'market' as const, tab: 'quotes', id: inquiry.quoteId }] : [])] }))

const referenceRows = (items: [string, string, string][]): AdminRow[] => items.map(([id, title, content]) => ({ id, title, status: '참고 기준', cells: [id, title, content], fields: [['코드', id], ['항목', title], ['내용', content]], links: [] }))
return {
  'items/master': { title: '품목 목록', headers: ['품목코드', '품목명', '카테고리', '규격', '브랜드', '단위', '입고단가', '출고단가', '표준단가', '사용 구분'], rows: itemRows, note: '원 / 기준 단위 · 부가세 포함 · 미사용 품목 및 분류는 신규 자산 연결 제외' },
  'receiving/requests': { title: '입고 신청', headers: ['신청번호', '접수일', '신청 경로', '고객사', '현장', '예상물량', '상태'], rows: receivingRows },
  'inspections/primary': { title: '1차 검수', headers: ['입고 신청번호', '검수번호', '고객사', '입고일', '생성 자산', '폐기 수량', '검수 상태'], rows: inspectionRows, note: '입고 신청번호를 기준으로 수량과 재사용 여부를 판정하고 자산 원시 데이터를 생성합니다.' },
  'inspections/detailed': { title: '상세 검수', headers: ['판매 요청번호', '자산번호', '입고 신청번호', '고객사', '검수 수량', '검수 상태'], rows: detailedInspectionRows, note: '판매 요청이 접수된 자산을 대상으로 판매에 필요한 상세 데이터를 확정합니다.' },
  'inspections/disposal': { title: '폐기 관리', headers: ['입고 신청번호', '검수번호', '고객사', '폐기 품목', '처리 상태'], rows: disposalRows, note: '1차 검수에서 폐기 판정된 물품의 처리 상태와 증빙을 관리합니다.' },
  'inventory/stock': { title: '자산 목록', headers: ['재고번호', '품목코드', '자산명', '카테고리', '고객사', '등급', '현재 수량', '로케이션', '보관 상태', '판매 상태'], rows: inventoryRows },
  'inventory/locations': { title: '로케이션', headers: ['위치번호', '로케이션', '구역', '점유 품목', '상태'], rows: locationRows },
  'market/sales': { title: '판매 요청', headers: ['요청번호', '요청일', '자재', '고객사', '수량', '희망금액 (총액)', '상세 검수', '승인 상태'], rows: saleRows },
  'market/products': { title: '상품', headers: ['상품번호', '상품명', '카테고리', '등급', '판매 단가', '상태'], rows: productRows },
  'market/quotes': { title: '구매 견적', headers: ['견적번호', '신청일', '구매 고객', '품목 수', '희망 납기', '상태'], rows: quoteRows },
  'market/campaigns': { title: '기획전', headers: ['기획전', '카테고리', '순서', '노출 기간', '상품 수', '상태'], rows: campaignRows, note: '노출 기간은 한국 시간 기준이며 종료일은 포함하지 않습니다.' },
  ...Object.fromEntries((['보관료', '판매 정산', '폐기 비용'] as const).map((type) => [`billing/${invoiceTab(type)}`, { title: type, headers: ['명세번호', '기록일', '고객사', '대상 기간', '청구·정산 금액', '상태'], rows: invoiceRows.filter((row) => invoices.find((invoice) => invoice.id === row.id)!.type === type) }])),
  'customers/companies': { title: '고객사', headers: ['고객번호', '고객사', '담당자', '연락처', '상태'], rows: customerRows },
  'customers/sites': { title: '현장', headers: ['현장번호', '현장명', '고객사', '주소', '상태'], rows: siteRows },
  'customers/inquiries': { title: '문의', headers: ['문의번호', '접수일', '유형', '고객사', '제목', '상태'], rows: inquiryRows },
  'members/list': { title: '회원 목록', headers: ['회원코드', '유형', '아이디 (이메일)', '회사명', '담당자', '담당자 연락처', '최근 로그인', '가입일', '상태'], rows: memberRows },
  'members/applications': { title: '가입 신청', headers: ['회원코드', '유형', '아이디 (이메일)', '회사명', '담당자', '담당자 연락처', '최근 로그인', '가입일', '상태'], rows: memberRows.filter((member) => member.status === '가입 승인 대기'), note: '가입 신청 정보를 확인한 후 상세 화면에서 승인 처리할 수 있습니다.' },
  'settings/grades': { title: '등급·단위', headers: ['코드', '구분', '내용'], rows: referenceRows([['GRADE', '품질 등급', 'S / A / B / F (폐기) · 상세 판정 기준 미등록'], ['STOCK-UNIT', '재고 단위', 'EA / Box / kg / ton / m / m³ / 본 · 개는 EA로 표준화 · 자동 환산 없음'], ['TRUCK', '입고 예상물량', '1톤 이하 / 2.5톤 / 5톤 이상 · 차량 기준']]) },
  'settings/rates': { title: '요금 기준', headers: ['코드', '항목', '내용'], rows: referenceRows([['STORAGE', '보관료 단가', '미설정 · 로케이션 및 계약별 확정 필요'], ['DISPOSAL', '폐기 처리 단가', '미설정 · 자재 및 운반 조건별 확정 필요'], ['VAT', '예시 명세 금액', '부가세 포함 · 자동 세액 계산 없음']]) },
  'settings/policies': { title: '안내 정책', headers: ['코드', '정책', '내용'], rows: referenceRows([['AUTO-CLOSE', '검수 자동 완료 안내', '입고 완료일 기준 3일 · 자동 변경 미구현'], ['OBJECTION', '의견 및 이의 접수', '3일 이내 문의 안내 · 접수 기한 강제 제한 없음'], ['DISPOSAL-FEE', '폐기 비용', '폐기 대상에 따라 별도 처리 비용 청구 가능'], ['VISIBILITY', '기획전 노출', '시작 포함 / 종료 미포함 · 카테고리 기반']]) },
}

}

export const dashboardMetrics: (AdminLink & { count: number })[] = [
  { label: '입고 신청', menu: 'receiving', tab: 'requests', status: '입고 신청', count: receivings.filter((item) => item.status === '입고 신청').length },
  { label: '1차 검수 대기', menu: 'inspections', tab: 'primary', status: '검수 대기', count: inspections.filter((item) => item.status === '검수 대기').length },
  { label: '판매 승인 대기', menu: 'market', tab: 'sales', status: '승인 대기', count: saleRequests.filter((item) => item.status === '승인 대기').length },
  { label: '미답변 문의', menu: 'customers', tab: 'inquiries', status: '미답변', count: inquiries.filter((item) => item.status === '미답변').length },
  { label: '미수 보관료', menu: 'billing', tab: 'storage', status: '청구 완료', count: invoices.filter((item) => item.type === '보관료' && item.status === '청구 완료').length },
]