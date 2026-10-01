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
  return <div className="adm-pagination"><span>{total ? `${(page - 1) * rows + 1}-${Math.min(page * rows, total)} / ${total}건` : '0건'}</span><div><label className="adm-row-count">표시<select value={rows} disabled={loading} onChange={(event) => onChange(1, Number(event.target.value))}>{[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}건</option>)}</select></label><nav className="adm-page-numbers" aria-label="페이지 이동"><button className="adm-icon" title="이전 페이지" aria-label="이전 페이지" disabled={loading || page <= 1} onClick={() => onChange(page - 1, rows)}><ChevronLeft size={18} /></button><span>{page} / {pages}</span><button className="adm-icon" title="다음 페이지" aria-label="다음 페이지" disabled={loading || page >= pages} onClick={() => onChange(page + 1, rows)}><ChevronRight size={18} /></button></nav></div></div>
}