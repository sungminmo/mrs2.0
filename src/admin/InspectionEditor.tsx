import { useEffect, useRef, useState } from 'react'
import { Check, Download, ImagePlus, LoaderCircle, Plus, RefreshCw, Save, Search, Trash2, Upload } from 'lucide-react'
import { adminAccountRequest, showAdminToast } from '../adminAuthSession'
import { emptyInspectionRow, inspectionLabels, inspectionRowErrors, inspectionUnits, type InspectionReport, type InspectionRow } from '../inspections'
import CategorySelect from '../CategorySelect'
import type { MaterialCategory } from '../categories'
import type { Location, MasterItem } from './adminData'
import type { InspectionImport } from './inspectionFile'
import { uploadImage } from './adminImages'
import './InspectionEditor.css'

function excel(bytes?: ArrayBuffer): Promise<ArrayBuffer | InspectionImport> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./inspectionFile.worker.ts', import.meta.url), { type: 'module' })
    const finish = () => { clearTimeout(timer); worker.terminate() }
    const timer = setTimeout(() => { finish(); reject(new Error('엑셀 처리 시간이 초과되었습니다. 파일을 나눠 주세요.')) }, 15_000)
    worker.onmessage = (event) => { finish(); if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.data) }
    worker.onerror = () => { finish(); reject(new Error('엑셀 파일을 처리하지 못했습니다.')) }
    worker.postMessage({ bytes }, bytes ? [bytes] : [])
  })
}

export function ReceiveCompletion({ id }: { id: string }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const working = useRef(false)
  return <section className="adm-receiving-review"><h2>입고 완료 등록</h2><form onSubmit={async (event) => {
    event.preventDefault()
    if (working.current) return
    const data = new FormData(event.currentTarget)
    working.current = true; setBusy(true); setError('')
    try {
      const { inspection } = await adminAccountRequest<{ inspection: InspectionReport }>(`/api/admin/receivings/${encodeURIComponent(id)}/receive`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ receivedAt: new Date(String(data.get('receivedAt'))).toISOString(), reason: data.get('reason') }) })
      showAdminToast('입고 완료가 등록되었습니다.')
      window.location.hash = `/admin/receiving?tab=primary&id=${inspection.id}`
    } catch (failure) { setError(failure instanceof Error ? failure.message : '입고 등록 실패') }
    finally { working.current = false; setBusy(false) }
  }}><div className="adm-edit-fields"><label>실제 입고일시<input name="receivedAt" type="datetime-local" required disabled={busy} /></label><label>등록 사유<input name="reason" required maxLength={500} disabled={busy} /></label></div>{error && <p className="adm-form-error" role="alert">{error}</p>}<button className="adm-button adm-primary" disabled={busy}><Check size={16} />{busy ? '등록 중' : '입고 완료 등록'}</button></form></section>
}

export default function InspectionEditor({ id, categories, onChanged, readOnly = false }: { id: string; categories: MaterialCategory[]; onChanged: () => void; readOnly?: boolean }) {
  const [report, setReport] = useState<InspectionReport | null>(null), [rows, setRows] = useState<InspectionRow[]>([])
  const [selected, setSelected] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0)
  const [reason, setReason] = useState(''), [confirming, setConfirming] = useState(false), [preview, setPreview] = useState<InspectionImport | null>(null), [importMode, setImportMode] = useState<'append' | 'replace'>('append')
  const [dirty, setDirty] = useState(false)
  const working = useRef(false), file = useRef<HTMLInputElement>(null), photo = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const controller = new AbortController()
    adminAccountRequest<{ inspection: InspectionReport }>(`/api/admin/inspections/${encodeURIComponent(id)}`, { signal: controller.signal }).then(({ inspection }) => {
      if (!controller.signal.aborted) { setReport(inspection); setRows(inspection.rows); setSelected(inspection.rows[0]?.id ?? ''); setDirty(false); setError('') }
    }).catch((failure) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '조회 실패') })
    return () => controller.abort()
  }, [id, revision])
  useEffect(() => {
    if (!dirty) return
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault() }
    const navigate = (event: MouseEvent) => { const link = (event.target as HTMLElement).closest('a'); if (link?.getAttribute('href')?.startsWith('#') && !window.confirm('저장하지 않은 검수 입력을 버리고 이동하시겠습니까?')) { event.preventDefault(); event.stopPropagation() } }
    window.addEventListener('beforeunload', unload); document.addEventListener('click', navigate, true)
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigate, true) }
  }, [dirty])
  const row = rows.find((entry) => entry.id === selected), pending = report?.status === 'PENDING'
  const editable = report?.editable && !readOnly
  const update = (values: Partial<InspectionRow>) => { setRows((current) => current.map((entry) => entry.id === selected ? { ...entry, ...values } : entry)); setDirty(true); setConfirming(false) }
  const errors = rows.flatMap((entry, index) => inspectionRowErrors(entry).map((message) => `${index + 1}행: ${message}`))
  const finalErrors = !rows.length ? ['검수 행을 추가해 주세요.'] : !rows.some((entry) => Number(entry.usable) > 0) ? [...errors, '재사용 가능한 자산이 한 개 이상 필요합니다.'] : errors
  async function save(draft: boolean) {
    if (!report || working.current) return
    if (!draft && finalErrors.length) { setError(finalErrors.slice(0, 8).join('\n')); return }
    working.current = true; setBusy(true); setError('')
    try {
      const action = draft ? 'draft' : pending ? 'confirm' : 'result'
      const { inspection } = await adminAccountRequest<{ inspection: InspectionReport }>(`/api/admin/inspections/${id}/${action}`, { method: action === 'confirm' ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: report.version, rows, reason }) })
      setReport(inspection); setRows(inspection.rows); setDirty(false); setConfirming(false); setReason(''); showAdminToast(draft ? '초안이 저장되었습니다.' : '검수 결과가 저장되었습니다.'); onChanged()
    } catch (failure) { setError(failure instanceof Error ? failure.message : '저장 실패') }
    finally { working.current = false; setBusy(false) }
  }
  async function spreadsheet(template: boolean, input?: File) {
    if (working.current) return
    working.current = true; setBusy(true); setError('')
    try {
      if (input && (!/\.xlsx$/i.test(input.name) || input.size > 5 * 1024 * 1024)) throw new Error('5MB 이하의 XLSX 파일을 선택해 주세요.')
      const result = await excel(input ? await input.arrayBuffer() : undefined)
      if (template) {
        const url = URL.createObjectURL(new Blob([result as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'MRS-1차검수.xlsx'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
      } else setPreview(result as InspectionImport)
    } catch (failure) { setError(failure instanceof Error ? failure.message : '엑셀 처리 실패') }
    finally { working.current = false; setBusy(false); if (file.current) file.current.value = '' }
  }
  return <section className="inspection-editor" aria-label="1차 검수 결과서">
    {error && <p className="adm-form-error inspection-error" role="alert">{error}</p>}
    {!report ? <button className="adm-button" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={16} />{error ? '다시 조회' : '불러오는 중'}</button> : <>
      <header className="inspection-report-heading"><div><h2>{report.siteName} · 1차 검수</h2><p>{report.id} · {inspectionLabels[report.status]}</p></div><dl><div><dt>실제 입고일</dt><dd>{new Date(report.receivedAt).toLocaleString('ko-KR')}</dd></div><div><dt>고객 결과 확인</dt><dd>{report.acknowledgedAt ? new Date(report.acknowledgedAt).toLocaleString('ko-KR') : '미확인'}</dd></div><div><dt>폐기 대상 동의</dt><dd>{report.consentedAt ? new Date(report.consentedAt).toLocaleString('ko-KR') : report.disposalStatus ? '미동의' : '대상 없음'}</dd></div></dl></header>
      {!editable && !readOnly && <p className="adm-note">{report.editBlock}</p>}
      <div className="inspection-toolbar"><span>검수 자재 {rows.length}행</span>{editable && pending && <div className="adm-management-buttons"><button className="adm-button" disabled={busy || rows.length >= 1000} onClick={() => { const entry = emptyInspectionRow(); setRows([...rows, entry]); setSelected(entry.id); setDirty(true) }}><Plus size={16} />자재 추가</button><button className="adm-button" disabled={busy} onClick={() => void spreadsheet(true)}><Download size={16} />엑셀 양식</button><button className="adm-button" disabled={busy} onClick={() => file.current?.click()}><Upload size={16} />엑셀 업로드</button><input ref={file} type="file" accept=".xlsx" hidden onChange={(event) => { const input = event.target.files?.[0]; if (input) void spreadsheet(false, input) }} /></div>}</div>
      {preview && <section className="inspection-import"><h3>엑셀 미리보기 · {preview.rows.length}행</h3>{preview.errors.length ? <ul role="alert">{preview.errors.map((entry) => <li key={entry.row}>{entry.row}행: {entry.messages.join(' · ')}</li>)}</ul> : <p role="status">입력 형식 확인 완료</p>}<div className="adm-table-scroll"><table className="adm-table"><thead><tr><th>자재</th><th>등급</th><th>입고</th><th>재사용</th><th>폐기</th><th>로케이션</th></tr></thead><tbody>{preview.rows.slice(0, 20).map((entry) => <tr key={entry.id}><td>{entry.name}</td><td>{entry.grade}</td><td>{entry.received}</td><td>{entry.usable}</td><td>{entry.disposal}</td><td>{entry.locationId || '—'}</td></tr>)}</tbody></table></div><label>적용 방식<select value={importMode} onChange={(event) => setImportMode(event.target.value as 'append' | 'replace')}><option value="append">기존 행에 추가</option><option value="replace">기존 행과 사진을 모두 대체</option></select></label><div className="adm-management-buttons"><button className="adm-button adm-primary" disabled={!!preview.errors.length || (importMode === 'append' ? rows.length : 0) + preview.rows.length > 1000} onClick={() => { const next = importMode === 'replace' ? preview.rows : [...rows, ...preview.rows]; setRows(next); setSelected(next[0]?.id ?? ''); setDirty(true); setPreview(null); setConfirming(false) }}><Check size={16} />초안에 적용</button><button className="adm-button" onClick={() => setPreview(null)}>취소</button></div></section>}
      <div className="adm-table-scroll"><table className="adm-table inspection-row-table"><thead><tr>{['자재', '등급', '입고', '재사용', '폐기', '단위', '사진', '자산번호'].map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((entry, index) => <tr key={entry.id} aria-selected={selected === entry.id}><td><button className="inspection-row-link" onClick={() => setSelected(entry.id)}>{index + 1}. {entry.name || '미입력 자재'}</button></td><td>{entry.grade || '미판정'}</td><td>{entry.received || '미입력'}</td><td>{entry.usable || '미입력'}</td><td>{entry.disposal || '미입력'}</td><td>{entry.unit && inspectionUnits[entry.unit]}</td><td>{entry.photos.length}</td><td>{report.assets.find((asset) => asset.rowId === entry.id) ? <a href={`#/admin/inventory?tab=stock&id=${report.assets.find((asset) => asset.rowId === entry.id)!.id}`}>{report.assets.find((asset) => asset.rowId === entry.id)!.id}</a> : '미생성'}</td></tr>)}</tbody></table></div>
      {row && <section className="inspection-row-form"><div className="inspection-toolbar"><h3>{rows.indexOf(row) + 1}행 · {row.name || '자재 입력'}</h3>{editable && pending && <button className="adm-icon" title="이 행 삭제" aria-label="이 행 삭제" disabled={busy} onClick={() => { setRows(rows.filter((entry) => entry.id !== row.id)); setSelected(rows.find((entry) => entry.id !== row.id)?.id ?? ''); setDirty(true) }}><Trash2 size={16} /></button>}</div><fieldset disabled={!editable || busy}>
        <div className="adm-edit-fields"><label>품목코드 (선택)<input value={row.itemId} maxLength={6} disabled={!pending} onChange={(event) => update({ itemId: event.target.value })} /></label>{pending && <ReferenceSearch kind="items" onSelect={(entry) => { const item = entry as MasterItem; const unit = Object.entries(inspectionUnits).find(([, label]) => label === item.unit)?.[0] as InspectionRow['unit']; update({ itemId: item.id, name: item.name, specification: item.specification, brand: item.brand, categoryId: item.category, unit: unit ?? '' }) }} />}
        <label>자산명<input value={row.name} maxLength={160} onChange={(event) => update({ name: event.target.value })} /></label><label>규격<input value={row.specification} maxLength={500} onChange={(event) => update({ specification: event.target.value })} /></label><label>브랜드 (선택)<input value={row.brand} maxLength={160} onChange={(event) => update({ brand: event.target.value })} /></label></div>
        <CategorySelect categories={categories} required value={row.categoryId} retainedId={!pending ? report.rows.find((entry) => entry.id === row.id)?.categoryId : undefined} onChange={(categoryId) => update({ categoryId })} />
        <div className="adm-edit-fields"><label>단위<select value={row.unit} disabled={!pending} onChange={(event) => update({ unit: event.target.value as InspectionRow['unit'] })}><option value="">선택</option>{Object.entries(inspectionUnits).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>등급<select value={row.grade} onChange={(event) => update({ grade: event.target.value as InspectionRow['grade'] })}><option value="">선택</option>{['S', 'A', 'B', 'F'].map((grade) => <option key={grade}>{grade}</option>)}</select></label>{(['received', 'usable', 'disposal'] as const).map((key, index) => <label key={key}>{['입고수량', '재사용수량', '폐기수량'][index]}<input inputMode="decimal" value={row[key]} onChange={(event) => update({ [key]: event.target.value })} /></label>)}<label>로케이션코드<input value={row.locationId} maxLength={20} onChange={(event) => update({ locationId: event.target.value })} /></label><ReferenceSearch kind="locations" onSelect={(entry) => update({ locationId: entry.id })} /><label className="inspection-wide">폐기사유<textarea value={row.reason} maxLength={1000} onChange={(event) => update({ reason: event.target.value })} /></label></div>
        <div className="inspection-photos">{row.photos.map((image) => <figure key={image.id}><a href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt={image.name} loading="lazy" /></a><figcaption>{image.name}</figcaption><button className="adm-icon" title="사진 제거" aria-label={`${image.name} 제거`} onClick={() => update({ photos: row.photos.filter((entry) => entry.id !== image.id) })}><Trash2 size={14} /></button></figure>)}</div><button className="adm-button" disabled={row.photos.length >= 8} onClick={() => photo.current?.click()}><ImagePlus size={16} />검수 사진 추가 ({row.photos.length}/8)</button><input ref={photo} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={async (event) => {
          const input = event.target.files?.[0]; if (!input || working.current) return
          working.current = true; setBusy(true); setError('')
          try { const image = await uploadImage(input, 'inspections'); update({ photos: [...row.photos, image] }) } catch (failure) { setError(failure instanceof Error ? failure.message : '사진 업로드 실패') } finally { working.current = false; setBusy(false); if (photo.current) photo.current.value = '' }
        }} /></fieldset>
        {editable && inspectionRowErrors(row).length > 0 && <ul className="inspection-validation">{inspectionRowErrors(row).map((message) => <li key={message}>{message}</li>)}</ul>}
      </section>}
      {editable && <div className="inspection-save"><label>{pending ? '저장·확정 사유' : '정정 사유'}<input value={reason} maxLength={500} disabled={busy} onChange={(event) => setReason(event.target.value)} required /></label>{confirming && <p role="status">재사용 자산 {rows.filter((entry) => Number(entry.usable) > 0).length}건 · 폐기 대상 {rows.filter((entry) => Number(entry.disposal) > 0).length}행을 {pending ? '확정' : '정정'}합니다. 고객사에 결과가 공개됩니다.</p>}<div className="adm-management-buttons">{pending && <button className="adm-button" disabled={busy || !reason.trim()} onClick={() => void save(true)}><Save size={16} />초안 저장</button>}<button className="adm-button adm-primary" disabled={busy || !reason.trim()} onClick={() => { if (confirming) void save(false); else if (finalErrors.length) setError(finalErrors.slice(0, 8).join('\n')); else setConfirming(true) }}>{busy ? <LoaderCircle size={16} /> : <Check size={16} />}{busy ? '처리 중' : confirming ? '확정 저장' : pending ? '결과 확정' : '결과 정정'}</button>{confirming && <button className="adm-button" disabled={busy} onClick={() => setConfirming(false)}>취소</button>}<button className="adm-button" disabled={busy} onClick={() => { if (!dirty || window.confirm('입력한 내용을 버리고 최신 결과를 조회하시겠습니까?')) setRevision((value) => value + 1) }}><RefreshCw size={16} />최신 조회</button></div></div>}
    </>}
  </section>
}

function ReferenceSearch({ kind, onSelect }: { kind: 'items' | 'locations'; onSelect: (entry: MasterItem | Location) => void }) {
  const [q, setQuery] = useState(''), [results, setResults] = useState<(MasterItem | Location)[]>([]), [page, setPage] = useState(1), [total, setTotal] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  async function search(next: number) {
    setBusy(true); setError('')
    try { const data = await adminAccountRequest<{ items?: MasterItem[]; locations?: Location[]; pagination: { total: number } }>(kind === 'items' ? `/api/admin/data?scope=items&rows=20&page=${next}&status=${encodeURIComponent('사용')}&q=${encodeURIComponent(q)}` : `/api/admin/locations?size=20&page=${next}&enabled=true&q=${encodeURIComponent(q)}`); setResults((data[kind] ?? []).filter((entry) => entry.enabled)); setPage(next); setTotal(data.pagination.total); if (!data.pagination.total) setError('검색 결과가 없습니다.') } catch (failure) { setError(failure instanceof Error ? failure.message : '조회 실패') } finally { setBusy(false) }
  }
  return <div className="inspection-reference"><label>{kind === 'items' ? '품목 검색' : '로케이션 검색'}<input value={q} maxLength={160} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void search(1) } }} /></label><button type="button" className="adm-icon" title="검색" aria-label={`${kind === 'items' ? '품목' : '로케이션'} 검색`} disabled={busy} onClick={() => void search(1)}><Search size={16} /></button>{results.length > 0 && <select aria-label={`${kind === 'items' ? '품목' : '로케이션'} 검색 결과`} value="" onChange={(event) => { const entry = results.find((value) => value.id === event.target.value); if (entry) onSelect(entry) }}><option value="">선택</option>{results.map((entry) => <option key={entry.id} value={entry.id}>{entry.id} · {entry.name}</option>)}</select>}{total > 20 && <div><button type="button" disabled={busy || page <= 1} onClick={() => void search(page - 1)}>이전</button><span>{page} / {Math.ceil(total / 20)}</span><button type="button" disabled={busy || page * 20 >= total} onClick={() => void search(page + 1)}>다음</button></div>}{error && <span role="alert">{error}</span>}</div>
}