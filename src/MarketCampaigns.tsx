import { useEffect, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Layers } from 'lucide-react'
import PageBanner from './PageBanner'

type Campaign = { id: string; title: string; description: string; category: string; enabled: boolean; order: number; startsAt: string | null; endsAt: string | null }
const campaigns: Campaign[] = [
  { id: 'steel', title: '철강 자재 기획전', description: '철근부터 H빔까지. 다음 현장에 필요한 철강 자재를 품질 등급과 함께 비교하세요.', category: '철강 / 금속', enabled: true, order: 1, startsAt: null, endsAt: null },
  { id: 'wood', title: '다시 쓰는 목재 기획전', description: '회수 목재의 새로운 쓰임. 필요한 수량과 납품 조건에 맞춰 견적을 요청하세요.', category: '목재 / 합판', enabled: true, order: 2, startsAt: null, endsAt: null },
  { id: 'pipe', title: '현장을 잇는 배관 기획전', description: '배관 자재를 한곳에서 확인하고, 현장 규격에 맞는 공급 조건을 상담하세요.', category: '배관 / 파이프', enabled: true, order: 3, startsAt: null, endsAt: null },
]

export default function MarketCampaigns({ onSelect, renderImage }: { onSelect: (category: string) => void; renderImage: (category: string) => ReactNode }) {
  const [selected, setSelected] = useState('steel')
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])
  const active = campaigns.filter((campaign) => campaign.enabled && (!campaign.startsAt || now >= Date.parse(campaign.startsAt)) && (!campaign.endsAt || now < Date.parse(campaign.endsAt))).sort((first, second) => first.order - second.order)
  const campaign = active.find((item) => item.id === selected) ?? active[0]
  if (!campaign) return null
  const index = active.findIndex((item) => item.id === campaign.id)
  return <div className="market-campaigns">
    <PageBanner label="마켓 기획전" title={campaign.title} description={campaign.description} action="기획전 자재 보기" onAction={() => onSelect(campaign.category)} icon={<Layers size={17} />} image={renderImage(campaign.category)} controls={
      <div className="market-campaign-controls" role="group" aria-label="기획전 이동">
        <button className="sa-icon" title="이전 기획전" aria-label="이전 기획전" disabled={active.length < 2} onClick={() => setSelected(active[(index - 1 + active.length) % active.length].id)}><ChevronLeft size={18} /></button>
        <div className="market-campaign-dots">{active.map((item) => <button key={item.id} type="button" title={item.title} aria-label={`${item.title} 보기`} aria-pressed={item.id === campaign.id} onClick={() => setSelected(item.id)}><span /></button>)}</div>
        <button className="sa-icon" title="다음 기획전" aria-label="다음 기획전" disabled={active.length < 2} onClick={() => setSelected(active[(index + 1) % active.length].id)}><ChevronRight size={18} /></button>
        <span role="status" aria-label={`${campaign.title}, ${active.length}개 중 ${index + 1}번째`}>{index + 1} / {active.length}</span>
      </div>
    } />
  </div>
}