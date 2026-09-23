import { useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, Plus, Save, X } from 'lucide-react'
import type { MaterialCategory } from '../categories'
import { prepareInventory } from './adminInventory'
import type { Inventory, Location, MasterItem } from './adminData'

type Props = {
  location: Location
  locations: Location[]
  assets: Inventory[]
  items: MasterItem[]
  categories: MaterialCategory[]
  cancelHref: string
  onSave: (assets: Inventory[]) => void
}

export default function LocationOccupancyEditor({ location, locations, assets, items, categories, cancelHref, onSave }: Props) {
  const occupied = assets.filter((asset) => asset.locationId === location.id && asset.status === '보관중' && asset.quantity > 0)
  const [assignments, setAssignments] = useState(() => occupied.map((asset) => ({ assetId: asset.id, locationId: asset.locationId, added: false })))
  const [candidateId, setCandidateId] = useState('')
  const [error, setError] = useState('')
  const errorRef = useRef<HTMLParagraphElement>(null)
  const candidates = assets.filter((asset) => asset.status === '보관중' && asset.quantity > 0 && asset.locationId !== location.id && !assignments.some((assignment) => assignment.assetId === asset.id))

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const reason = String(data.get('reason') ?? '').trim()
    const changed = assignments.filter((assignment) => assets.find((asset) => asset.id === assignment.assetId)?.locationId !== assignment.locationId)
    if (!changed.length) { setError('변경할 점유 재고가 없습니다.'); return }
    if (!reason) { setError('재고 이동 사유를 입력해 주세요.'); return }
    try {
      const prepared = changed.map((assignment) => {
        const asset = assets.find((candidate) => candidate.id === assignment.assetId)!
        return prepareInventory({ ...asset, locationId: assignment.locationId }, asset, items, reason, categories, locations)
      })
      onSave(prepared)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '점유 재고를 저장하지 못했습니다.')
      queueMicrotask(() => errorRef.current?.focus())
    }
  }

  return <section className="adm-editor adm-location-occupancy-editor">
    <a className="adm-button adm-back" href={cancelHref}><ArrowLeft size={15} />취소하고 돌아가기</a>
    <p className="adm-note">{location.name}에 배정된 재고를 다른 로케이션으로 이동하거나, 다른 위치의 보관중 재고를 이곳에 배정합니다.</p>
    <form className="adm-edit-form" onSubmit={submit} onInput={() => setError('')}>
      <div className="adm-list-heading"><h2>점유 재고 <span>{assignments.length}건</span></h2></div>
      <div className="adm-table-scroll" tabIndex={0} role="region" aria-label={`${location.name} 점유 재고 편집 표`}><table><thead><tr><th scope="col">재고번호</th><th scope="col">자재</th><th scope="col">수량</th><th scope="col">현재 위치</th><th scope="col">배정 위치</th><th scope="col">편집</th></tr></thead><tbody>{assignments.map((assignment) => { const asset = assets.find((candidate) => candidate.id === assignment.assetId)!; const currentLocation = locations.find((candidate) => candidate.id === asset.locationId); return <tr key={asset.id}><td>{asset.id}</td><td>{asset.name}</td><td>{asset.quantity.toLocaleString('ko-KR')} {asset.unit}</td><td>{currentLocation?.name ?? '미지정'}</td><td><label className="adm-sr-only" htmlFor={`occupancy-${asset.id}`}>{asset.id} 배정 위치</label><select id={`occupancy-${asset.id}`} value={assignment.locationId} onChange={(event) => setAssignments((current) => current.map((entry) => entry.assetId === asset.id ? { ...entry, locationId: event.target.value } : entry))}>{locations.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.zone}</option>)}</select></td><td>{assignment.added ? <button className="adm-icon" type="button" title="추가 취소" aria-label={`${asset.id} 추가 취소`} onClick={() => setAssignments((current) => current.filter((entry) => entry.assetId !== asset.id))}><X size={16} /></button> : assignment.locationId !== location.id ? <button className="adm-button" type="button" onClick={() => setAssignments((current) => current.map((entry) => entry.assetId === asset.id ? { ...entry, locationId: location.id } : entry))}>이동 취소</button> : <span className="adm-note">유지</span>}</td></tr> })}</tbody></table></div>
      {!assignments.length && <div className="adm-empty"><h2>현재 점유 재고가 없습니다</h2><p>아래에서 다른 로케이션의 재고를 추가할 수 있습니다.</p></div>}
      <section className="adm-occupancy-add"><div><h2>재고 추가 배정</h2><p className="adm-note">다른 로케이션에 있는 보관중 재고만 선택할 수 있습니다.</p></div><div><label><span className="adm-sr-only">추가할 재고</span><select value={candidateId} onChange={(event) => setCandidateId(event.target.value)}><option value="">재고 선택</option>{candidates.map((asset) => <option key={asset.id} value={asset.id}>{asset.id} · {asset.name} · {asset.quantity.toLocaleString('ko-KR')} {asset.unit}</option>)}</select></label><button className="adm-button" type="button" disabled={!candidateId} onClick={() => { if (!candidateId) return; setAssignments((current) => [...current, { assetId: candidateId, locationId: location.id, added: true }]); setCandidateId('') }}><Plus size={16} />현재 위치에 추가</button></div></section>
      <label className="adm-edit-memo">재고 이동 사유<textarea name="reason" rows={3} required maxLength={500} placeholder="예: B구역 적재 공간 재배치" /></label>
      <p className="adm-note">저장한 이동 내역은 각 자산의 변경 이력에 기록됩니다. 수량과 보관 상태는 변경하지 않습니다.</p>
      <div className="adm-edit-footer">{error && <p className="adm-form-error" role="alert" ref={errorRef} tabIndex={-1}>{error}</p>}<button className="adm-button adm-primary" type="submit"><Save size={16} />점유 재고 임시 저장</button></div>
    </form>
  </section>
}