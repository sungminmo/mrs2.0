import { useRef, useState, type ReactNode } from 'react'
import { ArrowDownToLine, Leaf, MapPin, X } from 'lucide-react'
import type { Asset } from './App'
import AdminShell from './AdminShell'
import PageBanner from './PageBanner'
import type { DisposalRecord } from './disposals'
import './Settlements.css'

const money = (value: number) => `₩${value.toLocaleString('ko-KR')}`

type LocationMaterials = { location: string; materials: Pick<Asset, 'code' | 'name' | 'quantity' | 'unit'>[]; amount?: number }
type LedgerEntry = { id: string; date: string; type: string; name: string; amount: number; status: string; locations: LocationMaterials[]; inspectionId?: string }
const entryLabel = (type: string) => type === '판매' ? '판매 수익' : type === '폐기' ? '폐기 비용' : '보관 비용'
const storageInvoices = [{
  id: 'STORAGE-20260829', date: '2026.08.29 16:45', status: '결제완료',
  locations: [{ location: 'C-07 야적장', amount: 45000, materials: [{ code: 'EMX-PIP-240827', name: '고밀도 폴리에틸렌 파이프 DN100', quantity: '200', unit: 'm' }] }],
}]

export function Settlements({ navigation, transactions, assets, disposals, onInspection, initialKind = '전체' }: { navigation: ReactNode; transactions: string[][]; assets: Asset[]; disposals: DisposalRecord[]; onInspection: (id: string) => void; initialKind?: string }) {
  const [month, setMonth] = useState('전체 기간')
  const [kind, setKind] = useState(initialKind)
  const [message, setMessage] = useState('')
  const [detail, setDetail] = useState<{ title: string; caption: string; locations: LocationMaterials[] } | null>(null)
  const detailDialog = useRef<HTMLDialogElement>(null)
  const occupied = new Map<string, LocationMaterials>()
  assets.filter((asset) => Number(asset.quantity) > 0 && asset.location.trim()).forEach((asset) => {
    const location = asset.location.trim()
    if (!occupied.has(location)) occupied.set(location, { location, materials: [] })
    occupied.get(location)!.materials.push(asset)
  })
  const currentLocations = [...occupied.values()].sort((first, second) => first.location.localeCompare(second.location, 'ko'))
  const entries: LedgerEntry[] = [
    ...transactions.filter((row) => row[1] === '판매').map(([date, type, name, amount, status]) => ({ id: `${date}-${name}`, date, type, name, amount: Number(amount.replace(/[+\-₩,\s]/g, '')), status, locations: [] as LocationMaterials[] })),
    ...storageInvoices.map((invoice) => ({ ...invoice, type: '보관', name: `${invoice.locations.length}개 로케이션 보관료`, amount: invoice.locations.reduce((sum, location) => sum + location.amount, 0) })),
    ...disposals.flatMap((record) => record.cost.status === '청구 완료' ? [{ id: record.cost.invoice, date: record.cost.billedAt, type: '폐기', name: `${record.id} 폐기 비용 (예시)`, amount: record.cost.amount, status: '청구 완료', locations: [], inspectionId: record.id }] : []),
  ].sort((first, second) => second.date.localeCompare(first.date))
  function openDetail(value: NonNullable<typeof detail>) {
    setDetail(value)
    detailDialog.current?.showModal()
  }
  const months = [...new Set(entries.map((entry) => entry.date.slice(0, 7)))].sort().reverse()
  const period = entries.filter((entry) => month === '전체 기간' || entry.date.startsWith(month))
  const sales = period.filter((entry) => entry.type === '판매').reduce((sum, entry) => sum + entry.amount, 0)
  const storage = period.filter((entry) => entry.type === '보관').reduce((sum, entry) => sum + entry.amount, 0)
  const disposal = period.filter((entry) => entry.type === '폐기').reduce((sum, entry) => sum + entry.amount, 0)
  const shown = period.filter((entry) => kind === '전체' || entry.type === kind)
  function download() {
    const rows = [['거래일시', '구분', '청구 대상', '로케이션 수', '로케이션', '금액 (원)', '상태', '명세번호', '입고번호'], ...shown.map((entry) => [entry.date, entryLabel(entry.type), entry.name, entry.type === '보관' ? String(entry.locations.length) : '', entry.locations.map((location) => location.location).join('; '), String(entry.amount), entry.status, entry.id, entry.inspectionId ?? ''])]
    const escape = (value: string) => `"${(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`
    const url = URL.createObjectURL(new Blob(['\uFEFF', rows.map((row) => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'EcoMatX-settlements.csv'
    link.click()
    URL.revokeObjectURL(url)
    setMessage(`${shown.length}건의 정산 내역을 내보냈습니다.`)
  }
  return <AdminShell navigation={navigation}><main className="sa-main settlements-page">
    <div className="sa-heading"><div><div className="sa-breadcrumb">워크스페이스 <span>/</span> 정산</div><h1>정산 관리</h1></div><button className="sa-button" onClick={download} disabled={!shown.length}><ArrowDownToLine size={15} />내보내기</button></div>
    <div className="op-period"><label>조회 기간<select value={month} onChange={(event) => setMonth(event.target.value)}>{['전체 기간', ...months].map((value) => <option key={value}>{value}</option>)}</select></label><span>거래일 기준 · KRW</span></div>
    <section className="op-totals op-totals-disposal" aria-label="정산 요약">{[['판매 수익', sales, '등록된 판매 정산 금액'], ['보관 비용', storage, '점유 로케이션 단위 청구 금액'], ['폐기 비용', disposal, '청구 완료 금액만 반영 · 예시'], ['수익·비용 차액', sales - storage - disposal, '판매 수익에서 보관·폐기 비용 차감']].map(([label, value, caption], index) => <div key={label}><span>{label}</span><strong className={index === 0 ? 'op-income' : index < 3 ? 'op-expense' : ''}>{money(Number(value))}</strong><small>{caption}</small></div>)}</section>
    <section className="op-occupancy" aria-label="현재 로케이션 점유 현황"><MapPin size={20} /><div><h2>현재 점유 로케이션 <strong>{currentLocations.length}개</strong></h2><p>현재 재고 기준 · 청구 기간의 점유 현황과 다를 수 있습니다.</p></div><button className="sa-button" aria-label="현재 점유 로케이션 상세보기" onClick={() => openDetail({ title: '현재 점유 로케이션', caption: '현재 재고 기준입니다. 판매 중·검수 대기 자재도 보관 위치와 잔여 수량이 있으면 포함됩니다.', locations: currentLocations })}>상세보기</button></section>
    <p className="op-note">기존 거래 내역을 바탕으로 한 예시 데이터입니다. 판매 희망가격은 수익에 포함하지 않으며, 수수료·세금·미청구 비용은 반영되지 않아 실제 지급액과 다를 수 있습니다.</p>
    <PageBanner label="MRS · Material Recycling Service" title="자재의 순환부터 정산까지, MRS 하나로" description="보관 비용과 판매 수익을 함께 살펴보는 자재 운영. MRS가 입고·보관·거래·정산을 연결해 현장의 다음 계획을 돕습니다." action="MRS소개서 다운받기" href="/MRS-service-guide.txt" download="MRS-서비스소개서.txt" tone="blue" icon={<Leaf size={17} />} />
    <section className="op-ledger" aria-label="판매·보관·폐기 정산 내역"><div className="sa-section-title"><h2>정산 내역</h2><span>{shown.length}건</span></div><div className="sa-tabs" aria-label="정산 구분">{['전체', '판매', '보관', '폐기'].map((value) => <button key={value} aria-pressed={kind === value} onClick={() => setKind(value)}>{value === '전체' ? value : entryLabel(value)}</button>)}</div><div className="sa-table-scroll"><table className="sa-table"><thead><tr><th>거래일시</th><th>구분</th><th>정산·청구 대상</th><th className="sa-numeric">금액</th><th>상태</th><th>상세</th></tr></thead><tbody>{shown.map((entry) => <tr key={entry.id}><td>{entry.date}</td><td><span className={`sa-badge ${entry.type === '판매' ? 'selling' : 'pending'}`}>{entryLabel(entry.type)}</span></td><td><b>{entry.name}</b>{entry.type === '보관' && <small className="op-location-label">{entry.locations.map((location) => location.location).join(', ')}</small>}{entry.type === '폐기' && <small className="op-location-label">{entry.id}</small>}</td><td className={`sa-numeric ${entry.type === '판매' ? 'op-income' : 'op-expense'}`}>{entry.type === '판매' ? '+' : '-'}{money(entry.amount)}</td><td>{entry.status}</td><td>{entry.inspectionId ? <button className="sa-button" onClick={() => onInspection(entry.inspectionId!)}>폐기 명세 보기</button> : entry.type === '보관' ? <button className="sa-button" aria-label={`${entry.date} 보관 비용 상세보기`} onClick={() => openDetail({ title: '보관 비용 청구 상세', caption: `${entry.date} 청구 · ${entry.status}. 기존 45,000원 거래를 C-07 1개 로케이션 청구로 구성한 예시 명세입니다. 실제 청구 기간과 요율은 확인이 필요합니다.`, locations: entry.locations })}>상세보기</button> : '-'}</td></tr>)}</tbody></table></div>{shown.length === 0 && <div className="sa-empty"><h2>해당 기간의 정산 내역이 없습니다</h2><button className="sa-button" onClick={() => { setMonth('전체 기간'); setKind('전체') }}>전체 내역 보기</button></div>}</section>
    {message && <div className="sa-notice" role="status"><span>{message}</span><button className="sa-icon" aria-label="알림 닫기" onClick={() => setMessage('')}><X size={16} /></button></div>}
  </main><dialog ref={detailDialog} className="sa-dialog op-location-dialog" aria-labelledby="op-location-title"><div className="sa-dialog-heading"><h2 id="op-location-title">{detail?.title}</h2><button className="sa-icon" aria-label="로케이션 상세 닫기" onClick={() => detailDialog.current?.close()}><X size={19} /></button></div>{detail && <><p className="op-note">{detail.caption}</p><div className="op-location-summary"><span>점유 로케이션 <strong>{detail.locations.length}개</strong></span><span>등록 자재 <strong>{detail.locations.reduce((sum, location) => sum + location.materials.length, 0)}건</strong></span></div>{detail.locations.map((location) => <section className="op-location-section" key={location.location}><div className="op-location-heading"><h3><MapPin size={16} />{location.location}</h3><span>{location.amount === undefined ? `${location.materials.length}개 자재` : `로케이션 청구액 ${money(location.amount)}`}</span></div><ul>{location.materials.map((asset) => <li key={asset.code}><div><b>{asset.name}</b><small>{asset.code}</small></div><span>{Number(asset.quantity).toLocaleString('ko-KR')} {asset.unit}</span></li>)}</ul></section>)}{detail.locations.length === 0 && <div className="sa-empty"><h2>점유 중인 로케이션이 없습니다</h2></div>}{detail.locations.some((location) => location.amount !== undefined) && <div className="op-location-total"><span>청구 합계</span><strong>{money(detail.locations.reduce((sum, location) => sum + (location.amount ?? 0), 0))}</strong></div>}<div className="sa-dialog-actions"><button className="sa-button" onClick={() => detailDialog.current?.close()}>닫기</button></div></>}</dialog></AdminShell>
}

