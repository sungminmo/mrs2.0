import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowDownToLine, Box, Check, ChevronLeft, ChevronRight, MapPin, Save, ShoppingCart, Warehouse } from 'lucide-react'
import './ShopifyAssetDetail.css'
import SaleRegistration from './SaleRegistration'
import MarketRegistrationConfirm from './MarketRegistrationConfirm'

type Asset = {
  code: string; name: string; grade: string; unit: string; quantity: string;
  location: string; receivedAt: string; storageDays: string; status: string;
  appraisalValue: string; salePrice: string; brand: string; specification: string;
  shipmentUnit: string; note: string; image: string;
}
type Props = {
  asset: Asset; previous?: Asset; next?: Asset; onBack: () => void;
  onSave: (asset: Asset) => void; onNavigate: (asset: Asset) => void;
}
const numeric = (value: string) => Number(value.replaceAll(',', ''))
const money = (value: number) => `₩${value.toLocaleString('ko-KR')}`
const stateClass = (status: string) => status === '판매 중' ? 'selling' : status === '대기 중' ? 'pending' : 'stored'

export default function ShopifyAssetDetail({ asset, previous, next, onBack, onSave, onNavigate }: Props) {
  const [note, setNote] = useState(asset.note)
  const [message, setMessage] = useState('')
  const [imageFailed, setImageFailed] = useState(false)
  const [saleOpen, setSaleOpen] = useState(false)
  const [marketConfirmOpen, setMarketConfirmOpen] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const changed = note.trim() !== asset.note
  const difference = numeric(asset.salePrice) - numeric(asset.appraisalValue)

  useEffect(() => { heading.current?.focus({ preventScroll: true }); window.scrollTo(0, 0) }, [])
  useEffect(() => {
    if (!changed) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [changed])

  function leave(action: () => void) {
    if (!changed || window.confirm('저장하지 않은 변경 사항을 버리고 이동하시겠습니까?')) action()
  }
  function save() {
    onSave({ ...asset, note: note.trim() })
    setMessage('변경 사항을 저장했습니다.')
  }
  function requestMarketRegistration() {
    if (asset.status !== '보관 중') return
    setMarketConfirmOpen(true)
  }
  function exportAsset() {
    const escape = (value: string) => `"${(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`
    const rows = [['자산 코드', '자산명', '상태', '등급', '수량', '단위', '평가 가치', '판매 가격', '보관 위치', '입고일', '메모'], [asset.code, asset.name, asset.status, asset.grade, asset.quantity, asset.unit, asset.appraisalValue, asset.salePrice, asset.location, asset.receivedAt, asset.note]]
    const url = URL.createObjectURL(new Blob(['\uFEFF', rows.map((row) => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${asset.code}.csv`
    link.click()
    URL.revokeObjectURL(url)
    setMessage('자산 정보를 CSV로 내보냈습니다.')
  }

  return <div className="shopify-detail">
    {marketConfirmOpen && <MarketRegistrationConfirm subject={asset.name} onCancel={() => setMarketConfirmOpen(false)} onConfirm={() => { setMarketConfirmOpen(false); if (asset.status === '보관 중') setSaleOpen(true) }} />}
    <div className="sd-breadcrumb"><button onClick={() => leave(onBack)}>내 자산</button><ChevronRight size={12} /><span>{asset.code}</span></div>
    <div className="sd-heading"><button className="sd-icon" title="자산 목록으로" aria-label="자산 목록으로" onClick={() => leave(onBack)}><ArrowLeft size={18} /></button><div className="sd-title"><h2 tabIndex={-1} ref={heading}>{asset.name}</h2><span className={`sd-badge ${stateClass(asset.status)}`}><i />{asset.status}</span></div><div className="sd-paging"><button className="sd-icon" title="이전 자산" aria-label="이전 자산" disabled={!previous} onClick={() => previous && leave(() => onNavigate(previous))}><ChevronLeft size={17} /></button><button className="sd-icon" title="다음 자산" aria-label="다음 자산" disabled={!next} onClick={() => next && leave(() => onNavigate(next))}><ChevronRight size={17} /></button></div></div>
    <div className="sd-actions"><span>입고일 {asset.receivedAt} <i>·</i> 보관 {asset.storageDays}</span><div><button className="sd-button" onClick={exportAsset}><ArrowDownToLine size={14} />내보내기</button></div></div>
    <div className="sd-layout"><div className="sd-primary-column">
      <section className="sd-section"><div className="sd-section-heading"><h3>자산 정보</h3><span className="sd-grade">{asset.grade}등급</span></div><dl className="sd-fields"><div className="sd-wide"><dt>자산명</dt><dd>{asset.name}</dd></div><div><dt>자산 코드</dt><dd>{asset.code}</dd></div><div><dt>브랜드</dt><dd>{asset.brand}</dd></div><div className="sd-wide"><dt>규격</dt><dd>{asset.specification}</dd></div></dl></section>
      <section className="sd-section"><div className="sd-section-heading"><h3>미디어</h3><span>{asset.image && !imageFailed ? '이미지 1개' : '이미지 없음'}</span></div><figure className="sd-media"><div>{asset.image && !imageFailed ? <img src={asset.image} alt={asset.name} onError={() => setImageFailed(true)} /> : <span className="sd-no-image"><Box size={32} />{imageFailed ? '이미지를 불러올 수 없습니다' : '등록된 이미지가 없습니다'}</span>}</div><figcaption>자재 종류 참고 이미지</figcaption></figure></section>
      <section className="sd-section"><div className="sd-section-heading"><h3>평가 및 판매</h3><span>KRW</span></div><dl className="sd-fields sd-prices"><div><dt>평가 가치</dt><dd>{money(numeric(asset.appraisalValue))}</dd></div><div><dt>판매 가격</dt><dd>{money(numeric(asset.salePrice))}</dd></div></dl><div className="sd-price-summary"><span>평가 가치 대비 판매 가격</span><b>{difference >= 0 ? '+' : '-'}{money(Math.abs(difference))}</b></div></section>
      <section className="sd-section"><div className="sd-section-heading"><h3>재고 및 출고</h3><span><MapPin size={13} />{asset.location}</span></div><div className="sd-stock"><div><span>입고 수량</span><strong>{Number(asset.quantity).toLocaleString('ko-KR')}<small>{asset.unit}</small></strong></div><dl><div><dt>출고 단위</dt><dd>{asset.shipmentUnit}</dd></div><div><dt>입고일</dt><dd>{asset.receivedAt}</dd></div></dl></div></section>
    </div><aside className="sd-secondary-column" aria-label="자산 관리">
      <section className="sd-section"><div className="sd-section-heading"><h3>자산 상태</h3><span className={`sd-badge ${stateClass(asset.status)}`}><i />{asset.status}</span></div><button className="sd-button" disabled={asset.status !== '보관 중'} onClick={requestMarketRegistration}><ShoppingCart size={15} />마켓에 등록하기</button><p className="sd-status-caption">{asset.status === '판매 중' ? '마켓에 등록된 자산은 등록을 취소할 수 없습니다.' : asset.status === '대기 중' ? '검수 대기 중입니다. 마켓 등록은 검수 후 관리자 승인이 필요합니다.' : '마켓 등록 신청 후 검수 및 관리자 승인이 진행됩니다.'}</p></section>
      <section className="sd-section"><div className="sd-section-heading"><h3>보관 정보</h3><Warehouse size={16} /></div><dl className="sd-side-fields"><div><dt>보관 위치</dt><dd>{asset.location}</dd></div><div><dt>보관 기간</dt><dd>{asset.storageDays}</dd></div><div><dt>입고일</dt><dd>{asset.receivedAt}</dd></div></dl></section>
      <section className="sd-section"><div className="sd-section-heading"><h3>자산 분류</h3><Box size={16} /></div><dl className="sd-side-fields"><div><dt>브랜드</dt><dd>{asset.brand}</dd></div><div><dt>품질 등급</dt><dd><span className="sd-grade">{asset.grade}</span></dd></div><div><dt>관리 단위</dt><dd>{asset.unit}</dd></div></dl></section>
      <section className="sd-section"><div className="sd-section-heading"><h3><label htmlFor="sd-note">자산 메모</label></h3><span>입고 시 특이사항</span></div><textarea id="sd-note" value={note} maxLength={2000} rows={6} onChange={(event) => { setNote(event.target.value); setMessage('') }} /><p className="sd-disclaimer">저장한 변경은 메뉴 이동 시 유지되며 새로고침 시 초기화됩니다.</p></section>
    </aside></div>
    <div className="sd-savebar"><span role="status">{changed ? '저장하지 않은 변경 사항' : message || '모든 변경 사항이 저장되었습니다.'}</span><div><button className="sd-button" disabled={!changed} onClick={() => { setNote(asset.note); setMessage('') }}>변경 취소</button><button className="sd-button sd-save" disabled={!changed} onClick={save}>{changed ? <Save size={15} /> : <Check size={15} />}저장</button></div></div>
    {saleOpen && <SaleRegistration asset={asset} onClose={() => setSaleOpen(false)} onRegister={(price) => {
      if (asset.status !== '보관 중') return
      onSave({ ...asset, salePrice: price, status: '대기 중' })
      setMessage('판매 등록 요청이 접수되었습니다. 검수 후 관리자가 승인하면 판매 중 상태로 전환되어 마켓에 등록됩니다.')
    }} />}
  </div>
}