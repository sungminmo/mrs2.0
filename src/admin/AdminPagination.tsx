import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export type Pagination = { page: number; rows: number; total: number }
export function TableLoading({ columns = 6 }: { columns?: number }) {
  return <><tr><td colSpan={columns}><span className="adm-loading-status" role="status">데이터를 불러오는 중...</span></td></tr>{Array.from({ length: 6 }, (_, row) => <tr key={row} aria-hidden="true">{Array.from({ length: columns }, (_, column) => <td key={column}><span className="adm-table-skeleton" /></td>)}</tr>)}</>
}
export function LoadingTable({ columns = 6 }: { columns?: number }) {
  return <div className="adm-table-scroll" aria-busy="true"><table><tbody><TableLoading columns={columns} /></tbody></table></div>
}
export default function AdminPagination({ pagination, loading, onChange }: { pagination: Pagination; loading: boolean; onChange: (page: number, rows: number) => void }) {
  const { page, rows, total } = pagination
  const pages = Math.max(1, Math.ceil(total / rows))
  const start = Math.max(2, Math.min(page - 2, pages - 6))
  const end = Math.min(pages - 1, Math.max(page + 2, 7))
  const numbers = pages <= 9 ? Array.from({ length: pages }, (_, index) => index + 1) : [1, ...Array.from({ length: end - start + 1 }, (_, index) => start + index), pages]
  return <div className="adm-pagination"><div className="adm-pagination-summary"><span>{total ? `${(page - 1) * rows + 1}-${Math.min(page * rows, total)} / ${total}건` : '0건'}</span><label className="adm-row-count">표시<select value={rows} disabled={loading} onChange={(event) => onChange(1, Number(event.target.value))}>{[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}건</option>)}</select></label></div><div className="adm-pagination-controls"><nav className="adm-page-numbers" aria-label="페이지 이동"><button type="button" className="adm-page-step" title="이전 페이지" aria-label="이전 페이지" disabled={loading || page <= 1} onClick={() => onChange(page - 1, rows)}><ChevronLeft size={16} /><span>이전</span></button>{numbers.map((number, index) => <span className="adm-page-entry" key={number}>{index > 0 && number - numbers[index - 1]! > 1 && <span className="adm-page-ellipsis" aria-hidden="true">...</span>}<button type="button" className="adm-page-number" aria-label={`${number}페이지`} aria-current={number === page ? 'page' : undefined} disabled={loading || number === page} onClick={() => onChange(number, rows)}>{number}</button></span>)}<button type="button" className="adm-page-step" title="다음 페이지" aria-label="다음 페이지" disabled={loading || page >= pages} onClick={() => onChange(page + 1, rows)}><span>다음</span><ChevronRight size={16} /></button></nav><PageJump key={`${page}-${pages}-${rows}`} page={page} pages={pages} loading={loading} onJump={(next) => onChange(next, rows)} /></div></div>
}

function PageJump({ page, pages, loading, onJump }: { page: number; pages: number; loading: boolean; onJump: (page: number) => void }) {
  const [value, setValue] = useState(String(page))
  return <form className="adm-page-jump" aria-label="페이지 직접 이동" onSubmit={(event) => {
    event.preventDefault()
    const next = Number(value)
    if (!loading && Number.isInteger(next) && next >= 1 && next <= pages && next !== page) onJump(next)
  }}><input aria-label="이동할 페이지" type="number" min={1} max={pages} step={1} required value={value} disabled={loading} onChange={(event) => setValue(event.target.value)} /><span>/ {pages}</span><button className="adm-button" disabled={loading}>이동</button></form>
}