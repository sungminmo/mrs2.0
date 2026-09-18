import { useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, Save } from 'lucide-react'
import { nextCode } from './adminInventory'
import type { Location } from './adminData'

export default function LocationEditor({ locations, id, cancelHref, onSave }: { locations: Location[]; id: string | null; cancelHref: string; onSave: (location: Location) => void }) {
  const location = locations.find((entry) => entry.id === id)
  const code = location?.id ?? nextCode('LOC-', locations, 3)
  const [error, setError] = useState('')
  const errorRef = useRef<HTMLParagraphElement>(null)
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    const zone = String(data.get('zone') ?? '').trim()
    if (!name || !zone) { setError('로케이션과 구역을 입력해 주세요.'); return }
    if (locations.some((entry) => entry.id !== code && entry.name.toLocaleLowerCase('ko-KR') === name.toLocaleLowerCase('ko-KR'))) { setError('같은 이름의 로케이션이 이미 있습니다.'); return }
    onSave({ id: code, name, zone, status: location?.status ?? '비어 있음', rate: location?.rate ?? null })
  }
  return <section className="adm-editor"><a className="adm-button adm-back" href={cancelHref}><ArrowLeft size={15} />취소하고 돌아가기</a><p className="adm-note">임시 저장 · 새로고침하거나 고객 포털로 이동하면 초기화됩니다.</p><form className="adm-edit-form" onSubmit={submit} onInput={() => setError('')}><h2>로케이션 정보</h2><div className="adm-edit-fields"><label>위치번호<input value={code} readOnly /></label><label>로케이션<input name="name" defaultValue={location?.name} required maxLength={80} autoFocus /></label><label>구역<input name="zone" defaultValue={location?.zone} required maxLength={80} /></label></div><div className="adm-edit-footer">{error && <p className="adm-form-error" role="alert" ref={errorRef} tabIndex={-1}>{error}</p>}<button className="adm-button adm-primary" type="submit"><Save size={16} />임시 저장</button></div></form></section>
}