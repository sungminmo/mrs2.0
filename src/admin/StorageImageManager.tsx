import { useState, type FormEvent } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { adminAccountRequest } from '../adminAuthSession'
import type { AdminImage } from './adminData'

export default function StorageImageManager({ kind, id, images, onSaved }: { kind: 'items' | 'assets'; id: string; images: AdminImage[]; onSaved: (images: AdminImage[]) => void }) {
  const [draft, setDraft] = useState(images)
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const limit = kind === 'items' ? 1 : 8
  function add() {
    try {
      const source = new URL(url.trim())
      if (source.protocol !== 'https:' || source.host !== 'bucket-mrs.s3.ap-northeast-2.amazonaws.com' || source.username || source.password || source.search || source.hash || !/^\/(items|assets)\/.+\.(jpeg|jpg|png|webp)$/i.test(source.pathname) || source.href.length > 2048) throw new Error('bucket-mrs의 items 또는 assets JPG·PNG·WebP 주소를 입력해 주세요.')
      if (draft.some((image) => image.url === source.href)) throw new Error('이미 등록된 주소입니다.')
      const imageName = name.trim() || decodeURIComponent(source.pathname.split('/').at(-1) ?? '')
      if (!imageName || imageName.length > 255) throw new Error('이미지 이름은 1~255자로 입력해 주세요.')
      if (draft.length >= limit && limit !== 1) throw new Error('자산 이미지는 최대 8장입니다.')
      setDraft(limit === 1 ? [{ id: crypto.randomUUID(), name: imageName, url: source.href }] : [...draft, { id: crypto.randomUUID(), name: imageName, url: source.href }])
      setUrl(''); setName(''); setError(''); setMessage('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '주소를 확인해 주세요.') }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true); setError(''); setMessage('')
    try {
      const saved = await adminAccountRequest<{ images: AdminImage[] }>(`/api/admin/${kind}/${id}/images`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images: draft, expected: images, reason: String(data.get('reason')) }) })
      onSaved(saved.images)
      setMessage('이미지 주소가 DB에 저장되었습니다.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '이미지 저장에 실패했습니다.') }
    finally { setBusy(false) }
  }
  return <section className="adm-image-picker" aria-label="스토리지 이미지 관리"><h2>스토리지 이미지 <small>{draft.length} / {limit}</small></h2>
    <div className="adm-edit-fields"><label>이미지 주소<input type="url" value={url} maxLength={2048} disabled={busy} onChange={(event) => setUrl(event.target.value)} placeholder={`https://bucket-mrs.s3.ap-northeast-2.amazonaws.com/${kind}/...`} /></label><label>이미지 이름<input value={name} maxLength={255} disabled={busy} onChange={(event) => setName(event.target.value)} /></label></div>
    <button className="adm-button" type="button" disabled={busy || !url.trim()} onClick={add}><Plus size={16} />{limit === 1 && draft.length ? '주소 교체' : '주소 추가'}</button>
    <div className="adm-image-grid">{draft.map((image) => <figure key={image.id}><img src={image.url} alt={image.name} onError={() => setError('이미지를 불러올 수 없습니다. S3 공개 읽기 권한과 주소를 확인해 주세요.')} /><figcaption>{image.name}</figcaption><button className="adm-icon" type="button" title={`${image.name} 삭제`} aria-label={`${image.name} 삭제`} disabled={busy} onClick={() => { setDraft(draft.filter((entry) => entry.id !== image.id)); setMessage('') }}><Trash2 size={16} /></button></figure>)}</div>
    <form onSubmit={save}><label className="customer-reason">이미지 변경 사유<textarea name="reason" required maxLength={500} rows={2} disabled={busy} /></label>{error && <p className="adm-form-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}<button className="adm-button adm-primary" disabled={busy || !!url.trim()}><Save size={16} />{busy ? '저장 중...' : '이미지 DB 저장'}</button></form>
  </section>
}