import { useEffect, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Layers } from 'lucide-react'
import PageBanner from './PageBanner'
import { categoryEnabled, materialCategories, type MaterialCategory } from './categories'

export type MarketCampaign = { id: string; title: string; description: string; category: string; enabled: boolean; order: number; startsAt: string | null; endsAt: string | null }
export const marketCampaigns: MarketCampaign[] = [
  { id: 'conduit', title: '배관자재(전기) 기획전', description: '트레이부터 후렉시블까지. 현장 시공 조건에 맞는 전기 배관자재를 확인하세요.', category: '010000', enabled: true, order: 1, startsAt: null, endsAt: null },
  { id: 'cable', title: '케이블 자재 기획전', description: '전선과 용도별 케이블을 규격에 따라 비교하고 필요한 수량으로 견적을 요청하세요.', category: '020000', enabled: true, order: 2, startsAt: null, endsAt: null },
  { id: 'device', title: '전기기구 기획전', description: '배선기구부터 조명과 배전함까지 현장에 필요한 전기기구를 한곳에서 확인하세요.', category: '030000', enabled: true, order: 3, startsAt: null, endsAt: null },
]

export default function MarketCampaigns({ onSelect, renderImage, campaigns = marketCampaigns, categories = materialCategories }: { onSelect: (campaign: MarketCampaign) => void; renderImage: (category: string) => ReactNode; campaigns?: MarketCampaign[]; categories?: MaterialCategory[] }) {
  const [selected, setSelected] = useState('conduit')
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])
  const active = campaigns.filter((campaign) => campaign.enabled && categoryEnabled(categories, campaign.category) && (!campaign.startsAt || now >= Date.parse(campaign.startsAt)) && (!campaign.endsAt || now < Date.parse(campaign.endsAt))).sort((first, second) => first.order - second.order)
  const campaign = active.find((item) => item.id === selected) ?? active[0]
  if (!campaign) return null
  const index = active.findIndex((item) => item.id === campaign.id)
  return <div className="market-campaigns">
    <PageBanner label="마켓 기획전" title={campaign.title} description={campaign.description} action="기획전 자재 보기" onAction={() => onSelect(campaign)} icon={<Layers size={17} />} image={renderImage(campaign.category)} controls={
      <div className="market-campaign-controls" role="group" aria-label="기획전 이동">
        <button className="sa-icon" title="이전 기획전" aria-label="이전 기획전" disabled={active.length < 2} onClick={() => setSelected(active[(index - 1 + active.length) % active.length].id)}><ChevronLeft size={18} /></button>
        <div className="market-campaign-dots">{active.map((item) => <button key={item.id} type="button" title={item.title} aria-label={`${item.title} 보기`} aria-pressed={item.id === campaign.id} onClick={() => setSelected(item.id)}><span /></button>)}</div>
        <button className="sa-icon" title="다음 기획전" aria-label="다음 기획전" disabled={active.length < 2} onClick={() => setSelected(active[(index + 1) % active.length].id)}><ChevronRight size={18} /></button>
        <span role="status" aria-label={`${campaign.title}, ${active.length}개 중 ${index + 1}번째`}>{index + 1} / {active.length}</span>
      </div>
    } />
  </div>
}