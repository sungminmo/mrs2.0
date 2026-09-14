import { useCallback, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Archive, ArrowDownToLine, Check, CircleHelp, Pencil, ReceiptText, ShoppingCart, UserRound, X } from 'lucide-react'
import './App.css'
import AdminAssets, { type AssetValueSnapshot } from './AdminAssets'
import { prepareAssets } from './assetPhotos'
import AdminShell from './AdminShell'
import { NotificationNavigation } from './notificationNavigation'
import Notifications, { type NotificationItem } from './Notifications'
import ShopifyMarket from './ShopifyMarket'
import { Faq } from './Faq'
import { Settlements } from './Settlements'
import LoginPage from './LoginPage'
import InspectionDisposals from './InspectionDisposals'
import { demoDisposals, updateDisposal, type DisposalAction } from './disposals'

type Tab = 'assets' | 'market' | 'settlements' | 'faq' | 'profile' | 'notifications'

const products = [
  ['고밀도 폴리에틸렌 파이프 DN100', '34,900', '56,000', 'm', 'ECO -38%', '배관 / 파이프', 'A'],
  ['재사용 바닥 타일 600 x 600', '13,500', '22,000', '개', 'ECO -39%', '콘크리트 / 시멘트', ''],
  ['재활용 철근 D16', '2,950', '4,800', 'kg', '특가', '철강 / 금속', ''],
  ['업사이클링 콘크리트 블록', '7,200', '12,000', '개', 'ECO -40%', '콘크리트 / 시멘트', 'B'],
  ['회수 참나무 구조목 2 x 4', '43,500', '65,000', 'm³', '재고정리', '목재 / 합판', 'S'],
  ['재활용 H빔 A36', '128,000', '220,000', '본', 'ECO -42%', '철강 / 금속', 'A'],
]
const assets = [
  { code: 'EMX-STE-240901', name: '재활용 H빔 A36', grade: 'A', unit: 'ton', quantity: '12', location: 'B-12 창고', receivedAt: '2026.09.01', storageDays: '10일', status: '보관 중', appraisalValue: '1,536,000', salePrice: '1,680,000', brand: '현대제철', specification: 'H-300 x 300 x 10 x 15, 6 m', shipmentUnit: '1 ton 단위', note: '표면 녹 제거 및 절단면 정리 완료. 휨이나 균열은 확인되지 않았으며, 하역 장비를 이용해 출고해 주세요.', image: '' },
  { code: 'EMX-WOD-240902', name: '회수 참나무 구조목 2 x 4', grade: 'S', unit: 'm³', quantity: '80', location: 'A-03 창고', receivedAt: '2026.09.02', storageDays: '9일', status: '판매 중', appraisalValue: '3,480,000', salePrice: '3,750,000', brand: '국산 참나무', specification: '38 x 89 mm, 2.4 m', shipmentUnit: '1 m³ 단위', note: '건조 상태 양호합니다. 일부 자재에는 기존 못 자국이 있어, 사용 전 표면 확인이 필요합니다.', image: '' },
  { code: 'EMX-PIP-240827', name: '고밀도 폴리에틸렌 파이프 DN100', grade: 'A', unit: 'm', quantity: '200', location: 'C-07 야적장', receivedAt: '2026.08.27', storageDays: '15일', status: '보관 중', appraisalValue: '698,000', salePrice: '760,000', brand: 'K-PIPE', specification: 'DN100, SDR17, 6 m', shipmentUnit: '6 m 본 단위', note: '실외 야적장 보관 자재입니다. 출고 전 외관 세척과 수량 검수를 진행해 주세요.', image: '' },
  { code: 'EMX-CON-240908', name: '업사이클링 콘크리트 블록', grade: 'B', unit: '개', quantity: '500', location: 'B-08 창고', receivedAt: '2026.09.08', storageDays: '3일', status: '대기 중', appraisalValue: '390,000', salePrice: '425,000', brand: '에코블록', specification: '390 x 190 x 190 mm', shipmentUnit: '50개 팔레트 단위', note: '모서리 일부 손상 가능성이 있습니다. 조적용 사용을 권장하며, 외장 마감용 사용은 검수 후 결정해 주세요.', image: '' },
  { code: 'EMX-REB-240906', name: '철근 HD300 D16', grade: 'S', unit: 'ton', quantity: '20', location: 'A-12 창고', receivedAt: '2026.09.06', storageDays: '5일', status: '판매 중', appraisalValue: '2,368,000', salePrice: '2,550,000', brand: '대한제강', specification: 'D16, SD300, 8 m', shipmentUnit: '1 ton 단위', note: '입고 시 성적서 대조를 완료했습니다. 다발 단위 출고를 권장하며, 소량 출고는 별도 협의가 필요합니다.', image: '' },
]
export type Asset = typeof assets[number]

export default function App() {
  const [access, setAccess] = useState<'login' | 'member' | 'guest'>('login')
  const [tab, setTab] = useState<Tab>('assets')
  const [inventory, setInventory] = useState(() => prepareAssets(assets))
  const assetValueSnapshot = useRef<AssetValueSnapshot | null>(null)
  const observeAssetValues = useCallback((snapshot: AssetValueSnapshot) => {
    const previous = assetValueSnapshot.current
    assetValueSnapshot.current = snapshot
    return previous
  }, [])
  const [marketBasket, setMarketBasket] = useState<Record<string, number>>({})
  const [contact, setContact] = useState({ name: '', email: '', phone: '' })
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([])
  const [disposals, setDisposals] = useState(demoDisposals)
  const [inspectionActive, setInspectionActive] = useState(false)
  const [inspectionId, setInspectionId] = useState<string | null>(null)
  const [settlementKind, setSettlementKind] = useState('전체')
  const openInspection = (id: string) => { setInspectionId(id); setInspectionActive(true); setTab('assets') }
  const changeDisposal = (id: string, action: DisposalAction) => setDisposals((current) => current.map((record) => record.id === id ? updateDisposal(record, action) : record))
  if (access === 'login') return <LoginPage onLogin={() => { setAccess('member'); setTab('assets') }} onBrowse={() => { setAccess('guest'); setTab('market') }} />
  if (access === 'guest') return <ShopifyMarket products={products} navigation={<><Nav active icon={<ShoppingCart />} label="마켓" onClick={() => setTab('market')} /><Nav active={false} icon={<UserRound />} label="로그인" onClick={() => setAccess('login')} /></>} basket={{}} onBasketChange={setMarketBasket} isGuest onLogin={() => setAccess('login')} />
  const navigation = <>
    <Nav active={tab === 'assets'} icon={<Archive />} label="내 자산" onClick={() => setTab('assets')} />
    <Nav active={tab === 'market'} icon={<ShoppingCart />} label="마켓" onClick={() => setTab('market')} />
    <Nav active={tab === 'settlements'} icon={<ReceiptText />} label="정산 관리" onClick={() => { setSettlementKind('전체'); setTab('settlements') }} />
    <Nav active={tab === 'faq'} icon={<CircleHelp />} label="F&Q" onClick={() => setTab('faq')} />
    <Nav active={tab === 'profile'} icon={<UserRound />} label="마이페이지" onClick={() => setTab('profile')} />
  </>
  const notificationRecords: Omit<NotificationItem, 'read'>[] = [
    ...disposals.flatMap((record): Omit<NotificationItem, 'read'>[] => [
      { id: `result:${record.id}`, title: '1차 검수 결과 도착 · 폐기 대상 포함', description: `${record.id} 입고 건의 폐기 대상 수량과 사유를 확인해 주세요. 결과 확인과 폐기 동의는 별도입니다. (예시)`, code: record.id, category: '검수 결과', date: record.notifiedAt, dateLabel: '안내일', inspectionId: record.id },
      ...(record.status === '처리 완료' ? [{ id: `disposed:${record.id}`, title: '폐기 처리 완료', description: `${record.id} 처리 수량과 증빙을 확인하세요. (예시)`, code: record.id, category: '폐기 완료' as const, date: record.completedAt!, dateLabel: '처리일', inspectionId: record.id }] : []),
      ...(record.cost.status === '청구 완료' ? [{ id: `disposal-bill:${record.id}`, title: '폐기 비용 청구', description: `${record.cost.invoice} · ${record.cost.amount.toLocaleString('ko-KR')}원 청구 명세가 등록되었습니다. (예시)`, code: record.id, category: '폐기 비용' as const, date: record.cost.billedAt, dateLabel: '청구일', inspectionId: record.id }] : []),
    ]),
    ...inventory.filter((asset) => asset.status === '대기 중').map((asset) => ({
    id: `inspection:${asset.code}`, title: `${asset.name} 검수 대기`,
    description: '검수 및 관리자 승인을 기다리고 있습니다. 내 자산에서 등록 정보와 진행 상태를 확인하세요.',
    code: asset.code, category: '검수 대기' as const, date: asset.receivedAt, dateLabel: '입고일',
    })),
    ...inventory.map((asset) => ({
      id: `receipt:${asset.code}`, title: `${asset.name} 신규 입고`,
      description: `${asset.location}에 ${Number(asset.quantity).toLocaleString('ko-KR')} ${asset.unit} 입고가 등록되었습니다. 자산 정보와 보관 현황을 확인하세요.`,
      code: asset.code, category: '신규 입고' as const, date: asset.receivedAt, dateLabel: '입고일',
    })),
    ...transactions.filter((row) => row[1] === '판매' && row[4] === '정산완료').flatMap((row) => ([
      { id: `sale:${row[0]}:${row[2]}`, title: `${row[2]} 판매 완료`,
        description: `판매 거래가 완료되었습니다. 거래 내역에 등록된 판매 금액은 ${row[3].replace(/^\+\s*/, '')}입니다.`,
        code: row[2], category: '판매 완료' as const, date: row[0], dateLabel: '거래 기록일' },
      { id: `settlement:${row[0]}:${row[2]}`, title: `${row[2]} 정산 완료`,
        description: `판매 거래가 정산완료 상태로 등록되었습니다. 정산 금액 ${row[3].replace(/^\+\s*/, '')}과 명세를 정산 관리에서 확인하세요.`,
        code: row[2], category: '정산 완료' as const, date: row[0], dateLabel: '거래 기록일' },
    ])),
  ]
  const notifications = notificationRecords.sort((first, second) => second.date.localeCompare(first.date)).map((item) => ({ ...item, read: readNotificationIds.includes(item.id) }))
  const unread = notifications.filter((item) => !item.read).length
  const markRead = (ids: string[]) => setReadNotificationIds((current) => [...new Set([...current, ...ids])])
  const page = tab === 'assets' ? <AdminAssets assets={inventory} onAssetsChange={setInventory} navigation={navigation} onValuesObserved={observeAssetValues} inspectionActive={inspectionActive} onInspectionView={(active) => { setInspectionActive(active); setInspectionId(null) }} inspectionCount={disposals.filter((record) => record.status === '고객 확인 대기').length} inspectionContent={<InspectionDisposals records={disposals} selectedId={inspectionId} onSelect={setInspectionId} onUpdate={changeDisposal} />} />
    : tab === 'market' ? <ShopifyMarket products={products} navigation={navigation} basket={marketBasket} onBasketChange={setMarketBasket} />
    : tab === 'settlements' ? <Settlements key={settlementKind} navigation={navigation} transactions={transactions} assets={inventory} disposals={disposals} onInspection={openInspection} initialKind={settlementKind} />
    : tab === 'faq' ? <Faq navigation={navigation} />
    : tab === 'notifications' ? <Notifications navigation={navigation} items={notifications} onRead={markRead} onAssets={() => { setInspectionActive(false); setTab('assets') }} onSales={() => setTab('profile')} onSettlements={() => setTab('settlements')} onInspection={openInspection} />
    : <Profile navigation={navigation} contact={contact} onContactChange={setContact} />
  return <NotificationNavigation value={{ unread, active: tab === 'notifications', onOpen: () => setTab('notifications') }}>{page}</NotificationNavigation>
}

function Nav({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <button className={`nav-button ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined} onClick={onClick}>{icon}{label}</button>
}

const transactions = [
  ['2026.09.08 14:30', '구매', '재활용 철근 외 2건', '- ₩1,450,000', '결제완료'],
  ['2026.09.05 09:15', '판매', '회수 참나무 구조목', '+ ₩3,480,000', '정산완료'],
  ['2026.08.29 16:45', '보관', '고밀도 폴리에틸렌 파이프', '- ₩45,000', '결제완료'],
]
type Contact = { name: string; email: string; phone: string }

function Profile({ navigation, contact, onContactChange }: { navigation: ReactNode; contact: Contact; onContactChange: (contact: Contact) => void }) {
  const [filter, setFilter] = useState('전체')
  const [message, setMessage] = useState('')
  const editDialog = useRef<HTMLDialogElement>(null)
  const shown = transactions.filter((row) => filter === '전체' || row[1] === filter)
  function saveContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    onContactChange({ name: String(data.get('name')).trim(), email: String(data.get('email')).trim(), phone: String(data.get('phone')).trim() })
    editDialog.current?.close()
    setMessage('담당자 정보를 저장했습니다. 새로고침 시 초기화됩니다.')
  }
  function exportTransactions() {
    const rows = [['거래일시', '유형', '내용', '금액', '상태'], ...shown]
    const csv = rows.map((row) => row.map((value) => `"${(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'EcoMatX-transactions.csv'
    link.click()
    URL.revokeObjectURL(url)
    setMessage(`${shown.length}건의 거래 내역을 내보냈습니다.`)
  }
  return <AdminShell navigation={navigation}>
    <main className="sa-main sp-profile">
      <div className="sa-heading"><div><div className="sa-breadcrumb">워크스페이스 <span>/</span> 계정</div><h1>마이페이지</h1></div><button className="sa-button" onClick={exportTransactions} disabled={!shown.length}><ArrowDownToLine size={15} />거래 내역 내보내기</button></div>
      <section className="sp-company" aria-label="회사 정보"><span className="sa-avatar">HC</span><div><h2>현대건설(주)</h2><p>사업자 등록번호 123-45-67890</p></div><span className="sa-badge selling">ECO 파트너</span></section>
      <section className="sp-metrics" aria-label="거래 요약">{[['이번 달 거래', '142건', '지난달보다 18건 증가'], ['누적 거래액', '4.2억원', '올해 누적 기준'], ['진행 중 문의', '1건', '확인 필요']].map(([label, value, caption]) => <div key={label}><span>{label}</span><strong>{value}</strong><small>{caption}</small></div>)}</section>
      <div className="sp-details">
        <section><div className="sa-section-title"><h2>담당자 정보</h2><button className="sa-button" onClick={() => editDialog.current?.showModal()}><Pencil size={14} />수정</button></div><dl>{[['담당자', contact.name], ['이메일', contact.email], ['연락처', contact.phone]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '미등록'}</dd></div>)}</dl></section>
        <section><div className="sa-section-title"><h2>파트너 혜택</h2><span>계정 누적 기준</span></div><dl><div><dt>보유 에코 포인트</dt><dd className="sp-positive">3,200 P</dd></div><div><dt>누적 CO₂ 절감</dt><dd>8.4 ton</dd></div><div><dt>계정 상태</dt><dd><span className="sa-badge selling">활성</span></dd></div></dl></section>
      </div>
      <section className="sp-transactions" aria-label="최근 거래 내역"><div className="sa-section-title"><h2>최근 거래 내역</h2><span>{shown.length}건</span></div><div className="sa-tabs" aria-label="거래 유형">{['전체', '구매', '판매', '보관'].map((item) => <button key={item} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}</div><div className="sa-table-scroll"><table className="sa-table"><thead><tr><th>거래일시</th><th>유형</th><th>내용</th><th className="sa-numeric">금액</th><th>상태</th></tr></thead><tbody>{shown.map(([date, type, title, value, status]) => <tr key={date}><td>{date}</td><td>{type}</td><td><b>{title}</b></td><td className={`sa-numeric ${type === '판매' ? 'sp-positive' : ''}`}>{value}</td><td><span className={`sa-badge ${type === '판매' ? 'selling' : 'stored'}`}>{status}</span></td></tr>)}</tbody></table></div></section>
      {message && <div className="sa-notice" role="status"><Check size={17} /><span>{message}</span><button className="sa-icon" aria-label="알림 닫기" onClick={() => setMessage('')}><X size={16} /></button></div>}
    </main>
    <dialog ref={editDialog} className="sa-dialog" aria-label="담당자 정보 수정"><form onSubmit={saveContact}><div className="sa-dialog-heading"><h2>담당자 정보 수정</h2><button type="button" className="sa-icon" aria-label="수정 닫기" onClick={() => editDialog.current?.close()}><X size={18} /></button></div><div className="sa-form-fields"><label className="sa-full-field">담당자<input name="name" defaultValue={contact.name} required maxLength={80} autoComplete="name" /></label><label className="sa-full-field">이메일<input name="email" type="email" defaultValue={contact.email} required autoComplete="email" /></label><label className="sa-full-field">연락처<input name="phone" type="tel" defaultValue={contact.phone} maxLength={30} autoComplete="tel" /></label></div><div className="sa-dialog-actions"><button type="button" className="sa-button" onClick={() => { editDialog.current?.querySelector('form')?.reset(); editDialog.current?.close() }}>취소</button><button className="sa-button sa-primary" type="submit">저장</button></div></form></dialog>
  </AdminShell>
}
