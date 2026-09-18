import { customerForSite, inspections, itemUnits, locations, receivings, type Inventory, type Location, type MasterItem } from './adminData'
import { categoryPath, materialCategories, validateLeafCategory, type MaterialCategory } from '../categories'

export function nextCode(prefix: string, records: { id: string }[], digits: number) {
  const highest = records.reduce((highest, record) => Math.max(highest, Number(record.id.slice(prefix.length)) || 0), 0)
  return `${prefix}${String(highest + 1).padStart(digits, '0')}`
}

export function validateMasterItem(item: MasterItem, items: MasterItem[], assets: Inventory[], categories: MaterialCategory[] = materialCategories) {
  if (!item.name.trim() || !item.specification.trim()) throw new Error('품목명과 규격을 입력해 주세요.')
  if (!itemUnits.includes(item.unit)) throw new Error('유효한 단위를 선택해 주세요.')
  validateLeafCategory(categories, item.category, items.find((candidate) => candidate.id === item.id)?.category)
  if ([item.inboundPrice, item.outboundPrice, item.standardPrice].some((price) => price !== null && (!Number.isFinite(price) || price < 0 || price > 1e12))) throw new Error('단가는 0~1조 원 범위로 입력해 주세요. 미입력은 미산정으로 관리합니다.')
  const previous = items.find((candidate) => candidate.id === item.id)
  if (previous && previous.unit !== item.unit && assets.some((asset) => asset.itemId === item.id)) throw new Error('연결된 자산이 있는 품목의 기준 단위는 변경할 수 없습니다.')
  const key = (candidate: MasterItem) => [candidate.name, candidate.category, candidate.specification, candidate.brand, candidate.unit].map((value) => value.trim().toLocaleLowerCase('ko-KR')).join('\u0000')
  if (items.some((candidate) => candidate.id !== item.id && key(candidate) === key(item))) throw new Error('같은 품목명·카테고리·규격·브랜드·단위의 품목이 이미 있습니다.')
  if (item.images.length > 1) throw new Error('대표 이미지는 1개만 등록할 수 있습니다.')
}

export function prepareInventory(asset: Inventory, previous: Inventory | undefined, items: MasterItem[], reason: string, categories: MaterialCategory[] = materialCategories, locationRecords: Location[] = locations): Inventory {
  const item = items.find((candidate) => candidate.id === asset.itemId)
  const receiving = receivings.find((candidate) => candidate.id === asset.receivingId)
  if (!item || (!item.enabled && previous?.itemId !== item.id)) throw new Error('사용 중인 품목을 선택해 주세요.')
  if (!receiving || receiving.status === '취소') throw new Error('취소되지 않은 입고 신청을 선택해 주세요.')
  if (previous && (previous.itemId !== asset.itemId || previous.receivingId !== asset.receivingId)) throw new Error('등록된 자산의 품목과 입고 신청은 변경할 수 없습니다.')
  if (!asset.name.trim() || !asset.specification.trim()) throw new Error('자산명과 규격을 입력해 주세요.')
  validateLeafCategory(categories, asset.category, previous?.category)
  if (!previous) validateLeafCategory(categories, item.category)
  if (!['S', 'A', 'B', 'F'].includes(asset.grade) || !['입고대기', '보관중', '출고완료'].includes(asset.status) || !['판매대기', '판매중', '판매완료'].includes(asset.saleStatus)) throw new Error('등급·보관 상태·판매 상태를 선택해 주세요.')
  if (!Number.isFinite(asset.quantity) || asset.quantity < 0 || asset.quantity > 1e9 || Math.abs(asset.quantity * 1000 - Math.round(asset.quantity * 1000)) > 0.0001) throw new Error('수량은 0~10억 범위, 소수점 3자리까지 입력할 수 있습니다.')
  if (['EA', 'Box', '본'].includes(item.unit) && !Number.isInteger(asset.quantity)) throw new Error('EA·Box·본 단위 수량은 정수로 입력해 주세요.')
  if (asset.status === '출고완료' ? asset.quantity !== 0 : asset.quantity <= 0) throw new Error('출고완료 자산의 현재 수량은 0, 입고대기·보관중 자산의 수량은 0보다 커야 합니다.')
  if ((asset.grade === 'F' || asset.status === '입고대기') && asset.saleStatus !== '판매대기') throw new Error('F등급 또는 입고대기 자산은 판매대기로만 등록할 수 있습니다.')
  if (asset.saleStatus === '판매중' && asset.status !== '보관중') throw new Error('판매중 자산은 보관중 상태여야 합니다.')
  if (asset.locationId && !locationRecords.some((location) => location.id === asset.locationId)) throw new Error('유효한 로케이션을 선택해 주세요.')
  if (asset.status === '보관중' && !asset.locationId) throw new Error('보관중 자산의 로케이션을 선택해 주세요.')
  if (asset.images.length > 8) throw new Error('자산 이미지는 최대 8개까지 등록할 수 있습니다.')
  if (previous && !reason.trim()) throw new Error('변경 사유를 입력해 주세요.')
  const next: Inventory = { ...asset, unit: item.unit, customerId: customerForSite(receiving.siteId), receiptId: previous?.receiptId ?? inspections.find((inspection) => inspection.receivingId === receiving.id)?.id ?? null, appraisal: previous?.appraisal ?? null }
  const fields: [keyof Inventory, string][] = [['itemId', '품목코드'], ['receivingId', '입고 신청번호'], ['customerId', '고객사'], ['name', '자산명'], ['category', '카테고리'], ['specification', '규격'], ['brand', '브랜드'], ['quantity', '현재 수량'], ['unit', '단위'], ['locationId', '로케이션'], ['grade', '등급'], ['status', '보관 상태'], ['saleStatus', '판매 상태']]
  const display = (value: unknown) => value === '' || value === null || value === undefined ? '미등록' : String(value)
  const changes: [string, string, string][] = fields.filter(([field]) => !previous || previous[field] !== next[field]).map(([field, label]) => [label, previous ? field === 'category' ? `${categoryPath(categories, previous.category)} (${previous.category})` : display(previous[field]) : '미등록', field === 'category' ? `${categoryPath(categories, next.category)} (${next.category})` : display(next[field])])
  if (JSON.stringify(previous?.images ?? []) !== JSON.stringify(next.images)) changes.push(['자산 이미지', previous?.images.map((image) => image.name).join(', ') || '미등록', next.images.map((image) => image.name).join(', ') || '미등록'])
  return { ...next, history: changes.length ? [...(previous?.history ?? []), { at: new Date().toISOString(), reason: previous ? reason.trim() : '신규 등록', changes }] : previous?.history ?? [] }
}