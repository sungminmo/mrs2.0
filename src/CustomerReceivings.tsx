import { useEffect, useState, type FormEvent } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { authenticatedFetch } from './authSession'
import { accountRequest } from './customerAccounts'
import { receivingStatusLabels, receivingVolumeLabels, type ReceivingRecord } from './receivings'
import { HistoryEmpty, HistoryHeader, HistoryStatus } from './CustomerHistory'

type Page = { data: ReceivingRecord[]; meta: { page: number; size: number; totalElements: number; totalPages: number } }
const date = (value: string | null) => value ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '미정'

export default function CustomerReceivings({ revision, parameters, setParameters, selected, select }: { revision: number; parameters: Record<string, string>; setParameters: (parameters: Record<string, string>) => void; selected: string | null; select: (id: string | null) => void; back?: () => void }) {
  const [result, setResult] = useState<{ key: string; page: Page | null; detail: ReceivingRecord | null; error: string } | null>(null)
  const key = `${new URLSearchParams(parameters)}/${selected}/${revision}`
  const loading = result?.key !== key
  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        if (selected) {
          const { receiving } = await accountRequest<{ receiving: ReceivingRecord }>(`/api/customer/receivings/${encodeURIComponent(selected)}`, { signal: controller.signal })
          if (!controller.signal.aborted) setResult({ key, page: null, detail: receiving, error: '' })
        } else {
          const response = await authenticatedFetch(`/api/customer/receivings?${new URLSearchParams(parameters)}`, { signal: controller.signal })
          const body = await response.json()
          if (!response.ok) throw new Error(body.error?.message ?? '신청 내역을 불러오지 못했습니다.')
          if (!controller.signal.aborted) setResult({ key, page: body, detail: null, error: '' })
        }
      } catch (reason) { if (!controller.signal.aborted) setResult({ key, page: null, detail: null, error: reason instanceof Error ? reason.message : '조회에 실패했습니다.' }) }
    }
    void load()
    return () => controller.abort()
  }, [key, selected, parameters])
  const search = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const next: Record<string, string> = { page: '1', size: parameters.size ?? '20' }; for (const [name, value] of form) if (String(value).trim()) next[name] = String(value).trim(); setParameters(next) }
  const page = loading ? null : result?.page
  const detail = loading ? null : result?.detail
  return <section className="customer-history" aria-label="입고 신청 내역">
    <HistoryHeader kind="receivings" detail={selected ? detail?.siteName ?? '입고 신청 상세' : undefined} onBack={selected ? () => select(null) : undefined} status={detail ? receivingStatusLabels[detail.status] ?? detail.status : undefined} />
    {loading && <p role="status">신청 내역을 불러오는 중...</p>}
    {!loading && result?.error && <p className="customer-error" role="alert">{result.error}</p>}
    {detail && <><section className="customer-section"><h3>신청 정보</h3><dl className="customer-data">{[['신청번호', detail.id], ['현장명 또는 상호', detail.siteName], ['담당자', detail.managerName], ['연락처', detail.managerPhone], ['예상 물량', receivingVolumeLabels[detail.volume] ?? detail.volume], ['신청일', date(detail.requestedAt)], ['입고 예정일', date(detail.scheduledAt)], ['요청 메모', detail.note || '없음'], ['폐기 규정 동의일', date(detail.termsAgreedAt)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section><section className="customer-section"><h3>첨부한 자재 사진</h3><div className="customer-photos">{detail.images?.length ? detail.images.map((image) => <figure key={image.id}><a href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt={image.name} /></a><figcaption>{image.name}</figcaption></figure>) : <p>첨부된 사진이 없습니다.</p>}</div></section></>}
    {detail?.decision && <section className="customer-section" aria-label="입고 신청 처리 결과"><h2>입고 신청 처리 결과</h2><dl className="customer-data"><div><dt>결과</dt><dd>{receivingStatusLabels[detail.decision.status] ?? detail.decision.status}</dd></div><div><dt>처리일시</dt><dd>{date(detail.decision.at)}</dd></div><div><dt>처리 사유</dt><dd>{detail.decision.reason}</dd></div></dl></section>}
    {!selected && <><form key={new URLSearchParams(parameters).toString()} className="customer-filters" onSubmit={search}><label className="customer-search">검색<input name="q" defaultValue={parameters.q} maxLength={160} placeholder="신청번호 · 현장명 · 담당자" /></label><label>상태<select name="status" defaultValue={parameters.status ?? ''}><option value="">전체</option>{Object.entries(receivingStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="customer-filter-actions"><button className="sa-button sa-primary"><Search size={16} />검색</button><button type="button" className="sa-button" onClick={() => setParameters({ page: '1', size: '20' })}>초기화</button></div></form>
      {page && <><div className="customer-result-heading"><span>신청 내역 <strong>{page.meta.totalElements.toLocaleString()}</strong>건</span><label>페이지당 <select aria-label="페이지당 신청 수" value={parameters.size ?? '20'} onChange={(event) => setParameters({ ...parameters, page: '1', size: event.target.value })}>{[20, 50, 100].map((size) => <option key={size}>{size}</option>)}</select></label></div><div className="sa-table-scroll"><table className="sa-table"><thead><tr>{['현장 / 신청번호', '담당자', '예상 물량', '진행 상태', '신청일', '상세'].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{page.data.map((receiving) => <tr key={receiving.id}><td><button className="history-record-link" onClick={() => select(receiving.id)}><strong>{receiving.siteName}</strong><small>{receiving.id}</small></button></td><td>{receiving.managerName}</td><td>{receivingVolumeLabels[receiving.volume] ?? receiving.volume}</td><td><HistoryStatus>{receivingStatusLabels[receiving.status] ?? receiving.status}</HistoryStatus></td><td>{date(receiving.requestedAt)}</td><td><button className="history-view" aria-label={`${receiving.siteName} 입고 상세보기`} onClick={() => select(receiving.id)}>상세보기<ChevronRight size={14} /></button></td></tr>)}</tbody></table></div>{!page.data.length && <HistoryEmpty kind="receivings" filtered={!!(parameters.q || parameters.status)} />}<div className="customer-pagination"><button className="sa-icon" aria-label="이전 신청 페이지" title="이전 페이지" disabled={page.meta.page <= 1} onClick={() => setParameters({ ...parameters, page: String(page.meta.page - 1) })}><ChevronLeft size={20} /></button><span>{page.meta.page} / {Math.max(1, page.meta.totalPages)}</span><button className="sa-icon" aria-label="다음 신청 페이지" title="다음 페이지" disabled={page.meta.page >= page.meta.totalPages} onClick={() => setParameters({ ...parameters, page: String(page.meta.page + 1) })}><ChevronRight size={20} /></button></div></>}
    </>}
  </section>
}