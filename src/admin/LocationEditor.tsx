import { useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, Save } from 'lucide-react'
import { adminAccountRequest } from '../adminAuthSession'
import type { Location } from './adminData'

export default function LocationEditor({ locations, id, cancelHref, onSave }: { locations: Location[]; id: string | null; cancelHref: string; onSave: (location: Location) => void }) {
  const location = locations.find((entry) => entry.id === id)
  const code = location?.id ?? '저장 시 자동 생성'
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const working = useRef(false)
  const errorRef = useRef<HTMLParagraphElement>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (working.current) return
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    const zone = String(data.get('zone') ?? '').trim()
    if (!name || !zone) { setError('로케이션과 구역을 입력해 주세요.'); return }
    if (locations.some((entry) => entry.id !== code && entry.name.toLocaleLowerCase('ko-KR') === name.toLocaleLowerCase('ko-KR'))) { setError('같은 이름의 로케이션이 이미 있습니다.'); return }
    working.current = true; setBusy(true); setError('')
    try {
      const { location: saved } = await adminAccountRequest<{ location: Location }>(`/api/admin/locations${id ? `/${encodeURIComponent(id)}` : ''}`, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, zone, enabled: data.get('enabled') === 'on', reason: data.get('reason'), ...(id ? { version: location?.version } : {}) }) })
      onSave({ ...saved, assetCount: location?.assetCount ?? 0, status: location?.status ?? '비어 있음', rate: null })
    } catch (failure) { setError(failure instanceof Error ? failure.message : '저장 실패') }
    finally { working.current = false; setBusy(false) }
  }
  return <section className="adm-editor"><a className="adm-button adm-back" href={cancelHref}><ArrowLeft size={15} />취소하고 돌아가기</a><form className="adm-edit-form" onSubmit={submit} onInput={() => setError('')}><h2>로케이션 정보</h2><fieldset disabled={busy}><div className="adm-edit-fields"><label>위치번호<input value={code} readOnly /></label><label>로케이션<input name="name" defaultValue={location?.name} required maxLength={80} autoFocus /></label><label>구역<input name="zone" defaultValue={location?.zone} required maxLength={80} /></label><label>사용 여부<input name="enabled" type="checkbox" defaultChecked={location ? location.enabled : true} /></label><label>저장 사유<input name="reason" required maxLength={500} /></label></div></fieldset><div className="adm-edit-footer">{error && <p className="adm-form-error" role="alert" ref={errorRef} tabIndex={-1}>{error}</p>}<button className="adm-button adm-primary" type="submit" disabled={busy}><Save size={16} />{busy ? '저장 중' : '저장'}</button></div></form></section>
}