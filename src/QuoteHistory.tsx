import { ArrowDownToLine, ArrowLeft, ChevronRight, FileText } from 'lucide-react'
import type { QuoteRequestRecord } from './QuoteRequestPage'
import './QuoteHistory.css'

const money = (value: number) => `₩${value.toLocaleString('ko-KR')}`
const dateText = (value: string) => new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
const totalFor = (record: QuoteRequestRecord) => record.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
const itemSummary = (record: QuoteRequestRecord) => record.items.length > 1 ? `${record.items[0].name} 외 ${record.items.length - 1}종` : record.items[0]?.name ?? '-'
const statusClass = (status: QuoteRequestRecord['status']) => status === '견적 회신' ? 'selling' : status === '검토 중' ? 'stored' : 'pending'
const escapeHtml = (value: string | number) => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!)

function downloadQuote(record: QuoteRequestRecord) {
  const rows = record.items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.category)}</td><td class="number">${escapeHtml(money(item.price))}</td><td class="number">${escapeHtml(item.quantity.toLocaleString('ko-KR'))} ${escapeHtml(item.unit)}</td><td class="number">${escapeHtml(money(item.price * item.quantity))}</td></tr>`).join('')
  const document = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(record.id)} 견적서</title><style>body{max-width:900px;margin:48px auto;padding:0 24px;color:#243129;font-family:Arial,sans-serif}header{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:20px;border-bottom:2px solid #2f684b}h1{margin:0;font-size:28px}header p{margin:0;color:#66726a}dl{display:grid;grid-template-columns:repeat(2,1fr);gap:14px 28px;margin:28px 0}dl div{display:flex;justify-content:space-between;border-bottom:1px solid #dfe5e1;padding-bottom:8px}dt{color:#69736d}dd{margin:0;font-weight:600}table{width:100%;border-collapse:collapse}th,td{padding:12px 10px;border-bottom:1px solid #dfe5e1;text-align:left;font-size:13px}th{background:#f2f6f3}.number{text-align:right}.total{display:flex;justify-content:flex-end;gap:28px;margin-top:22px;font-size:18px}.note{margin-top:30px;padding:16px;background:#f6f8f6;line-height:1.7}footer{margin-top:36px;color:#737d76;font-size:11px;line-height:1.7}</style></head><body><header><h1>견적서</h1><p>MRS · Material Recycling Service</p></header><dl><div><dt>견적번호</dt><dd>${escapeHtml(record.id)}</dd></div><div><dt>요청일시</dt><dd>${escapeHtml(dateText(record.requestedAt))}</dd></div><div><dt>업체명</dt><dd>${escapeHtml(record.company)}</dd></div><div><dt>담당자명</dt><dd>${escapeHtml(record.name)}</dd></div><div><dt>연락처</dt><dd>${escapeHtml(record.phone)}</dd></div><div><dt>이메일</dt><dd>${escapeHtml(record.email || '-')}</dd></div><div><dt>납품 주소</dt><dd>${escapeHtml(record.address || '-')}</dd></div><div><dt>희망 납기일</dt><dd>${escapeHtml(record.deliveryDate || '-')}</dd></div></dl><table><thead><tr><th>자재명</th><th>카테고리</th><th class="number">단가</th><th class="number">수량</th><th class="number">금액</th></tr></thead><tbody>${rows}</tbody></table><div class="total"><span>예상 자재 금액</span><strong>${escapeHtml(money(totalFor(record)))}</strong></div><div class="note"><strong>요청사항</strong><br>${escapeHtml(record.note || '별도 요청사항 없음')}</div><footer>본 문서는 견적 요청 당시의 자재 단가를 기준으로 작성되었습니다. 배송비와 부가세, 최종 공급 금액 및 납기는 담당자 확인 후 확정됩니다.</footer></body></html>`
  const url = URL.createObjectURL(new Blob([document], { type: 'text/html;charset=utf-8' }))
  const link = window.document.createElement('a')
  link.href = url
  link.download = `${record.id}-견적서.html`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export default function QuoteHistory({ records, selectedId, onSelect, onBack }: { records: QuoteRequestRecord[]; selectedId: string | null; onSelect: (id: string) => void; onBack: () => void }) {
  const selected = records.find((record) => record.id === selectedId)

  if (selected) return <article className="qh-detail">
    <div className="qh-breadcrumb"><button onClick={onBack}>견적 요청 내역</button><ChevronRight size={13} /><span>{selected.id}</span></div>
    <div className="qh-detail-heading"><button className="sa-icon" title="견적 요청 목록으로" aria-label="견적 요청 목록으로" onClick={onBack}><ArrowLeft size={18} /></button><div><h2>{selected.id}</h2><p>{dateText(selected.requestedAt)} 요청</p></div><button className="sa-button sa-primary" onClick={() => downloadQuote(selected)}><ArrowDownToLine size={15} />견적서 다운로드</button></div>
    <section className="qh-summary" aria-label="견적 요약"><div><span>진행 상태</span><strong><span className={`sa-badge ${statusClass(selected.status)}`}>{selected.status}</span></strong></div><div><span>요청 품목</span><strong>{selected.items.length}종</strong></div><div><span>예상 자재 금액</span><strong>{money(totalFor(selected))}</strong></div><div><span>희망 납기일</span><strong>{selected.deliveryDate || '협의 필요'}</strong></div></section>
    <div className="qh-detail-grid">
      <section><div className="sa-section-title"><h3>요청 상품</h3><span>{selected.items.length}종</span></div>{selected.items.map((item) => <div className="qh-item" key={item.name}><span className="sa-thumbnail">{item.image ? <img src={item.image} alt="" onError={(event) => { event.currentTarget.hidden = true }} /> : <FileText size={20} />}</span><div><b>{item.name}</b><small>{item.category}</small><small>{money(item.price)} / {item.unit} · {item.quantity.toLocaleString('ko-KR')} {item.unit}</small></div><strong>{money(item.price * item.quantity)}</strong></div>)}<div className="qh-total"><span>예상 자재 금액</span><strong>{money(totalFor(selected))}</strong></div></section>
      <section className="qh-requester"><div className="sa-section-title"><h3>요청 정보</h3></div><dl>{[['업체명', selected.company], ['담당자명', selected.name], ['연락처', selected.phone], ['이메일', selected.email || '-'], ['납품 주소', selected.address || '-'], ['희망 납기일', selected.deliveryDate || '-'], ['요청사항', selected.note || '-']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
    </div>
  </article>

  return <section className="qh-list" aria-label="견적 요청 내역">
    <div className="sa-section-title"><div><h2>견적 요청 내역</h2><p>마켓에서 요청한 견적의 진행 상태와 내용을 확인할 수 있습니다.</p></div><span>{records.length}건</span></div>
    {records.length === 0 ? <div className="sa-empty"><FileText size={28} /><h2>견적 요청 내역이 없습니다</h2><p>마켓에서 필요한 자재를 선택해 견적을 요청해 보세요.</p></div> : <div className="sa-table-scroll"><table className="sa-table"><thead><tr><th>견적번호</th><th>요청일시</th><th>요청 상품</th><th>품목</th><th className="sa-numeric">예상 금액</th><th>희망 납기일</th><th>상태</th></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td><button className="sa-asset-link qh-link" onClick={() => onSelect(record.id)}>{record.id}</button></td><td>{dateText(record.requestedAt)}</td><td><b>{itemSummary(record)}</b></td><td>{record.items.length}종</td><td className="sa-numeric">{money(totalFor(record))}</td><td>{record.deliveryDate || '협의 필요'}</td><td><span className={`sa-badge ${statusClass(record.status)}`}>{record.status}</span></td></tr>)}</tbody></table></div>}
  </section>
}
