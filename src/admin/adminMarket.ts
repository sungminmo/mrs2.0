import type { Campaign, Product, Quote, SaleRequest } from './adminData.ts'
import { categoryEnabled, categoryChain, type MaterialCategory } from '../categories.ts'

export type MarketData = { sales: SaleRequest[]; products: Product[]; quotes: Quote[]; campaigns: Campaign[] }
export const marketStatusOptions = {
  sales: ['승인 대기', '승인 완료', '반려'],
  products: ['판매대기', '판매 중', '판매취소', '재고 없음'],
  quotes: ['접수 대기', '견적 회신', '출고 완료'],
} as const
export type MarketStatusTab = keyof typeof marketStatusOptions

export function changeMarketStatus(data: MarketData, tab: MarketStatusTab, ids: string[], status: string): MarketData {
  if (!(marketStatusOptions[tab] as readonly string[]).includes(status)) throw new Error('변경할 상태를 선택해 주세요.')
  if (!ids.length || ids.some((id) => !data[tab].some((record) => record.id === id))) throw new Error('변경할 내역을 다시 선택해 주세요.')
  const selected = new Set(ids)
  if (tab === 'sales') return { ...data, sales: data.sales.map((record) => selected.has(record.id) ? { ...record, status: status as SaleRequest['status'] } : record) }
  if (tab === 'quotes') return { ...data, quotes: data.quotes.map((record) => selected.has(record.id) ? { ...record, status: status as Quote['status'] } : record) }
  const productStatus = status === '판매취소' ? '판매대기' : status as Product['status']
  return { ...data, products: data.products.map((record) => selected.has(record.id) ? { ...record, status: productStatus } : record) }
}

export function validateCampaign(campaign: Campaign, categories: MaterialCategory[], previous?: Campaign) {
  if (!campaign.name.trim() || campaign.name.trim().length > 120) throw new Error('기획전 제목은 1~120자로 입력해 주세요.')
  if (!campaign.description.trim() || campaign.description.trim().length > 1000) throw new Error('기획전 설명은 1~1,000자로 입력해 주세요.')
  if (!categoryChain(categories, campaign.category).length) throw new Error('기획전 카테고리를 선택해 주세요.')
  if (!categoryEnabled(categories, campaign.category) && (previous?.category !== campaign.category || campaign.enabled)) throw new Error('사용 중인 카테고리를 선택하거나 기획전 노출을 중지해 주세요.')
  if (!Number.isInteger(campaign.order) || campaign.order < 0 || campaign.order > 9999) throw new Error('노출 순서는 0~9,999의 정수로 입력해 주세요.')
  const start = Date.parse(campaign.startsAt)
  const end = Date.parse(campaign.endsAt)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new Error('종료 일시는 시작 일시보다 늦어야 합니다.')
}