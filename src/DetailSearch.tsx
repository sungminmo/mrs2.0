import type { FormEvent, ReactNode } from 'react'
import { ChevronDown, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react'

type Props = {
  id: string
  className?: string
  query: string
  queryLabel: string
  placeholder: string
  expanded: boolean
  filterCount: number
  onQueryChange: (value: string) => void
  onToggle: () => void
  onReset: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  children: ReactNode
}

export default function DetailSearch({ id, className = '', query, queryLabel, placeholder, expanded, filterCount, onQueryChange, onToggle, onReset, onSubmit, children }: Props) {
  return <form className={`sa-detail-search ${className}`} onSubmit={onSubmit}>
    <div className="sa-detail-search-heading"><div><h2>상세 검색</h2></div><button type="button" className="sa-filter-toggle" aria-expanded={expanded} aria-controls={id} onClick={onToggle}><SlidersHorizontal size={14} />상세 필터{filterCount > 0 && <span className="sa-filter-count">{filterCount}</span>}<ChevronDown size={14} className="sa-chevron" /></button></div>
    <div className="sa-detail-search-bar"><label className="sa-detail-keyword"><Search size={15} /><input name="q" aria-label={queryLabel} placeholder={placeholder} maxLength={160} value={query} onChange={event => onQueryChange(event.target.value)} />{query && <button type="button" className="sa-icon sa-detail-keyword-clear" aria-label="검색어 지우기" onClick={() => onQueryChange('')}><X size={13} /></button>}</label><div className="sa-detail-search-buttons"><button className="sa-button" type="button" onClick={event => { event.currentTarget.form?.reset(); onReset() }}><RotateCcw size={13} />초기화</button><button className="sa-button sa-primary"><Search size={14} />검색</button></div></div>
    <div id={id} className={`sa-filter-panel${expanded ? ' is-open' : ''}`} inert={!expanded}><div className="sa-filter-panel-inner">{children}</div></div>
  </form>
}