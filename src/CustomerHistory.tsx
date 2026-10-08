import { useId, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, CircleHelp, FileSearch } from 'lucide-react'
import './CustomerHistory.css'

type HistoryKind = 'receivings' | 'inspections' | 'quotes' | 'orders' | 'saleRequests'
const content = {
  saleRequests: { title: '판매 요청 내역', description: '판매 요청한 자산의 검수·승인과 마켓 판매 상태를 확인하는 내역입니다.', steps: ['판매 요청', '상세 검수', '판매 승인', '마켓 판매'], empty: '판매 요청 내역이 없습니다', note: '판매 가능한 자산의 상세에서 판매를 요청할 수 있습니다.' },
  receivings: { title: '입고 내역', description: '맡기신 자재의 입고 신청부터 승인 결과와 입고 일정까지 확인하세요.', steps: ['입고 신청', '신청 검토', '입고 승인', '자재 입고'], empty: '입고 신청 내역이 없습니다', note: '자재를 맡기려면 입고 신청을 진행해 주세요.' },
  inspections: { title: '검수·폐기', description: '입고된 자재의 검수 결과와 재사용 수량, 폐기가 필요한 자재를 확인하세요.', steps: ['자재 검수', '결과 확인', '폐기 대상 별도 동의'], empty: '공개된 검수 결과가 없습니다', note: '입고 후 검수가 끝나면 확정된 결과가 표시됩니다.' },
  quotes: { title: '구매 견적', description: '구매를 요청한 자재와 회신된 견적을 확인하고, 조건이 맞으면 출고를 요청하세요.', steps: ['견적 요청', '견적 회신', '승인·출고 요청'], empty: '요청한 구매 견적이 없습니다', note: '마켓에서 필요한 자재를 선택해 견적을 요청해 주세요.' },
  orders: { title: '주문·배송', description: '승인한 견적의 주문 내용과 자재가 출고되고 배송되는 진행 상황을 확인하세요.', steps: ['견적 승인', '출고 준비', '자재 출고', '배송 완료'], empty: '확정된 주문이 없습니다', note: '구매 견적의 회신을 승인하면 주문이 생성됩니다.' },
}

export function HistoryHeader({ kind, detail, onBack, disabled, actions, status }: { kind: HistoryKind; detail?: string; onBack?: () => void; disabled?: boolean; actions?: ReactNode; status?: string }) {
  const entry = content[kind]
  return <header className="history-header">
    {onBack && <div className="history-backbar"><button type="button" className="history-back" onClick={onBack} disabled={disabled}><ArrowLeft size={16} />목록으로</button><span>{entry.title}<span aria-hidden="true"> / </span>상세</span></div>}
    <div className="history-title-row"><div><h2>{detail ?? entry.title}{status && <HistoryStatus>{status}</HistoryStatus>}</h2><p>{entry.description}</p></div>{actions && <div className="history-header-actions">{actions}</div>}</div>
    {!onBack && <div className="history-process"><span>진행 순서</span><ol aria-label={`${entry.title} 진행 순서`}>{entry.steps.map((step, index) => <li key={step}>{index > 0 && <ArrowRight size={13} aria-hidden="true" />}<span><b>{index + 1}</b>{step}</span></li>)}</ol>{kind === 'inspections' && <HistoryTooltip />}</div>}
  </header>
}

export function HistoryStatus({ children }: { children: ReactNode }) {
  return <span className="history-status">{children}</span>
}

export function HistorySummary({ counts, labels, title = '상태별 건수' }: { counts: Record<string, number>; labels: Record<string, string>; title?: string }) {
  return <dl className="history-summary" aria-label={title}>{Object.entries(labels).map(([status, label]) => <div key={status}><dt>{label}</dt><dd>{(counts[status] ?? 0).toLocaleString()}건</dd></div>)}</dl>
}

export function HistoryEmpty({ kind, filtered = false }: { kind: HistoryKind; filtered?: boolean }) {
  return <div className="history-empty"><FileSearch size={28} aria-hidden="true" /><h3>{filtered ? '검색 결과가 없습니다' : content[kind].empty}</h3><p>{filtered ? '검색어나 조건을 바꾸어 다시 검색해 주세요.' : content[kind].note}</p></div>
}

function HistoryTooltip() {
  const id = useId()
  const [open, setOpen] = useState(false)
  return <span className="history-tooltip" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false) } }}>
    <button type="button" className="history-help" aria-label="폐기 동의 안내" aria-describedby={open ? id : undefined} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen(true)}><CircleHelp size={17} /></button>
    {open && <span id={id} role="tooltip" className="history-tooltip-content"><strong>검수 확인과 폐기 동의는 달라요</strong>검수 결과를 확인해도 폐기에 자동 동의되지 않습니다. 폐기할 자재와 수량은 고객사 관리자가 별도로 동의하며, 비용 청구 동의는 포함되지 않습니다.</span>}
  </span>
}