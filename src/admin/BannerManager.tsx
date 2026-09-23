import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, ImagePlus, Pencil, Plus, Save, Trash2, Upload, X } from 'lucide-react'
import { authenticatedFetch } from '../authSession'
import type { CustomerBannerItem, CustomerBannerPlacement } from '../banners'

type AdminBannerItem = CustomerBannerItem & { createdAt?: string; updatedAt?: string }
type AdminPlacement = CustomerBannerPlacement & { items: AdminBannerItem[]; createdAt: string; updatedAt: string }

function statusOf(item: AdminBannerItem) {
  const now = Date.now()
  if (!item.enabled) return '노출 중지'
  if (item.startsAt && now < Date.parse(item.startsAt)) return '예약'
  if (item.endsAt && now >= Date.parse(item.endsAt)) return '종료'
  return '노출 중'
}

function dateText(value: string | null) {
  return value ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '제한 없음'
}

function kstInput(value: string | null) {
  if (!value) return ''
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value)).replace(' ', 'T')
}

function toIso(value: string) {
  return value ? `${value}:00+09:00` : null
}

function newItem(placementId = ''): AdminBannerItem {
  return { id: crypto.randomUUID(), placementId, desktopImageUrl: '', mobileImageUrl: '', linkUrl: null, enabled: true, sortOrder: 1, startsAt: null, endsAt: null }
}

async function readImage(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('JPG, PNG, WebP 이미지만 등록할 수 있습니다.')
  if (!file.size || file.size > 3 * 1024 * 1024) throw new Error('이미지는 파일당 3MB 이하로 등록해 주세요.')
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

export default function BannerManager({ params }: { params: URLSearchParams }) {
  const [placements, setPlacements] = useState<AdminPlacement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const id = params.get('id') ?? ''
  const mode = params.get('mode')
  const selected = placements.find((placement) => placement.id === id)
  const editing = mode === 'new' || mode === 'edit' && !!selected

  useEffect(() => {
    let active = true
    authenticatedFetch('/api/admin/banners').then(async (response) => {
      if (!response.ok) throw new Error('배너 노출 위치를 불러오지 못했습니다.')
      const body = await response.json() as { data?: { placements?: AdminPlacement[] } }
      if (active) setPlacements(body.data?.placements ?? [])
    }).catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : '배너 노출 위치를 불러오지 못했습니다.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  if (loading) return <p className="adm-note" role="status">배너 노출 위치를 불러오는 중입니다.</p>
  if (editing) return <PlacementEditor placement={selected} cancelHref={selected ? `#/admin/content?tab=banners&id=${selected.id}` : '#/admin/content?tab=banners'} onSaved={(placement) => { setPlacements((current) => current.some((item) => item.id === placement.id) ? current.map((item) => item.id === placement.id ? placement : item) : [...current, placement]); window.location.hash = `/admin/content?tab=banners&id=${placement.id}` }} />
  if (id) return selected ? <PlacementDetail placement={selected} /> : <div className="adm-empty"><h2>노출 위치를 찾을 수 없습니다</h2><a href="#/admin/content?tab=banners">목록으로</a></div>

  return <>
    {error && <p className="adm-form-error" role="alert">{error}</p>}
    <div className="adm-management-actions"><p className="adm-note">노출 위치 ID를 고객 프론트에 연결한 뒤, 위치별로 여러 배너를 순서대로 편성합니다.</p><a className="adm-button adm-primary" href="#/admin/content?tab=banners&mode=new"><Plus size={16} />노출 위치 추가</a></div>
    <div className="adm-list-heading"><h2>배너 노출 위치 <span>{placements.length}개</span></h2></div>
    <div className="adm-table-scroll" tabIndex={0} role="region" aria-label="배너 노출 위치 표"><table><thead><tr><th scope="col">노출 위치 ID</th><th scope="col">위치명</th><th scope="col">편성 배너</th><th scope="col">현재 노출</th><th scope="col">상태</th><th scope="col">상세</th></tr></thead><tbody>{placements.map((placement) => { const active = placement.items.filter((item) => statusOf(item) === '노출 중').length; return <tr key={placement.id}><td><strong>{placement.id}</strong></td><td>{placement.name}</td><td>{placement.items.length}개</td><td>{placement.enabled ? `${active}개` : '0개'}</td><td><span className={`adm-status adm-status-${placement.enabled ? 'active' : 'muted'}`}>{placement.enabled ? '사용' : '중지'}</span></td><td><a className="adm-detail-link" href={`#/admin/content?tab=banners&id=${placement.id}`}>상세보기</a></td></tr> })}</tbody></table></div>
    {!placements.length && <div className="adm-empty"><ImagePlus size={24} /><h2>등록된 노출 위치가 없습니다</h2><a href="#/admin/content?tab=banners&mode=new">첫 노출 위치 추가</a></div>}
  </>
}

function PlacementDetail({ placement }: { placement: AdminPlacement }) {
  return <article className="adm-record">
    <div className="adm-management-actions"><a className="adm-button adm-back" href="#/admin/content?tab=banners"><ArrowLeft size={15} />목록으로</a><a className="adm-button adm-primary" href={`#/admin/content?tab=banners&id=${placement.id}&mode=edit`}><Pencil size={16} />편성 수정</a></div>
    <div className="adm-list-heading"><h2>{placement.name}</h2><span className={`adm-status adm-status-${placement.enabled ? 'active' : 'muted'}`}>{placement.enabled ? '사용' : '중지'}</span></div>
    <dl className="adm-fields"><div><dt>노출 위치 ID</dt><dd>{placement.id}</dd></div><div><dt>편성 배너</dt><dd>{placement.items.length}개</dd></div></dl>
    <section className="adm-banner-composition"><div className="adm-list-heading"><h2>배너 편성</h2></div>{placement.items.map((item, index) => <article className="adm-banner-row" key={item.id}><div className="adm-banner-row-head"><strong>{index + 1}번째 배너</strong><span className={`adm-status adm-status-${statusOf(item) === '노출 중' ? 'active' : statusOf(item) === '예약' ? 'wait' : 'muted'}`}>{statusOf(item)}</span></div><div className="adm-banner-previews"><BannerPreview title="PC 이미지" source={item.desktopImageUrl} /><BannerPreview title="모바일 이미지" source={item.mobileImageUrl} mobile /></div><dl className="adm-fields"><div><dt>클릭 이동</dt><dd>{item.linkUrl ?? '없음'}</dd></div><div><dt>노출 기간</dt><dd>{dateText(item.startsAt)} ~ {dateText(item.endsAt)}</dd></div></dl></article>)}</section>
  </article>
}

function PlacementEditor({ placement, cancelHref, onSaved }: { placement?: AdminPlacement; cancelHref: string; onSaved: (placement: AdminPlacement) => void }) {
  const [items, setItems] = useState<AdminBannerItem[]>(placement?.items ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const errorRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])
  const patchItem = (id: string, patch: Partial<AdminBannerItem>) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item))
  const moveItem = (index: number, offset: number) => setItems((current) => { const next = [...current]; const target = index + offset; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next })

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const id = String(data.get('id') ?? '').trim()
    if (items.some((item) => !item.desktopImageUrl || !item.mobileImageUrl)) { setError('모든 편성 배너에 PC와 모바일 이미지를 등록해 주세요.'); return }
    setBusy(true); setError('')
    try {
      const payload = { name: String(data.get('name') ?? '').trim(), enabled: data.has('enabled'), items: items.map((item, index) => ({ id: item.id, desktopImageUrl: item.desktopImageUrl, mobileImageUrl: item.mobileImageUrl, linkUrl: item.linkUrl ?? '', enabled: item.enabled, sortOrder: index + 1, startsAt: item.startsAt, endsAt: item.endsAt })) }
      const response = await authenticatedFetch(`/api/admin/banners/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const body = await response.json() as { data?: { placement: AdminPlacement }; error?: { message?: string } }
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? '배너 편성을 저장하지 못했습니다.')
      onSaved(body.data.placement)
    } catch (failure) { setError(failure instanceof Error ? failure.message : '배너 편성을 저장하지 못했습니다.'); setBusy(false) }
  }

  return <form className="adm-editor adm-edit-form" onSubmit={submit}>
    <a className="adm-button adm-back" href={cancelHref}><ArrowLeft size={15} />취소</a>
    <h2>노출 위치 <small>고객 프론트는 노출 위치 ID 하나만 연결합니다.</small></h2>
    <div className="adm-edit-fields"><label>노출 위치 ID<input name="id" required minLength={2} maxLength={80} pattern="[A-Za-z0-9][A-Za-z0-9._:-]*" defaultValue={placement?.id} readOnly={!!placement} placeholder="customer-home-hero" /><small>고객 프론트 코드에 맵핑되는 고정 키</small></label><label>위치명<input name="name" required maxLength={120} defaultValue={placement?.name} placeholder="고객 홈 메인 배너" /></label></div>
    <label className="adm-check"><input name="enabled" type="checkbox" defaultChecked={placement?.enabled ?? true} />이 노출 위치 사용</label>
    <div className="adm-banner-composition-head"><div><h2>배너 편성</h2><p className="adm-note">위에서 아래 순서로 고객 화면에 노출됩니다. 최대 30개까지 편성할 수 있습니다.</p></div><button className="adm-button" type="button" disabled={items.length >= 30} onClick={() => setItems((current) => [...current, { ...newItem(placement?.id), sortOrder: current.length + 1 }])}><Plus size={16} />배너 추가</button></div>
    <div className="adm-banner-editor-list">{items.map((item, index) => <BannerItemEditor key={item.id} item={item} index={index} count={items.length} onChange={(patch) => patchItem(item.id, patch)} onMove={(offset) => moveItem(index, offset)} onRemove={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))} onError={setError} />)}</div>
    {!items.length && <div className="adm-empty"><ImagePlus size={24} /><h2>편성된 배너가 없습니다</h2><button className="adm-button" type="button" onClick={() => setItems([{ ...newItem(placement?.id), sortOrder: 1 }])}><Plus size={16} />배너 추가</button></div>}
    <div className="adm-edit-footer">{error && <p className="adm-form-error" role="alert" ref={errorRef} tabIndex={-1}>{error}</p>}<button className="adm-button adm-primary" type="submit" disabled={busy}><Save size={16} />{busy ? '저장 중...' : '편성 저장'}</button></div>
  </form>
}

function BannerItemEditor({ item, index, count, onChange, onMove, onRemove, onError }: { item: AdminBannerItem; index: number; count: number; onChange: (patch: Partial<AdminBannerItem>) => void; onMove: (offset: number) => void; onRemove: () => void; onError: (error: string) => void }) {
  return <section className="adm-banner-item-editor"><div className="adm-banner-row-head"><h2>{index + 1}번째 배너</h2><div><button className="adm-icon" type="button" title="위로 이동" aria-label={`${index + 1}번째 배너 위로 이동`} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp size={16} /></button><button className="adm-icon" type="button" title="아래로 이동" aria-label={`${index + 1}번째 배너 아래로 이동`} disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown size={16} /></button><button className="adm-icon" type="button" title="편성에서 삭제" aria-label={`${index + 1}번째 배너 삭제`} onClick={onRemove}><Trash2 size={16} /></button></div></div>
    <div className="adm-edit-fields"><label>클릭 이동 URL<input value={item.linkUrl ?? ''} onChange={(event) => onChange({ linkUrl: event.target.value })} placeholder="/mrs2.0/#/market 또는 https://example.com" /></label><label className="adm-check"><input type="checkbox" checked={item.enabled} onChange={(event) => onChange({ enabled: event.target.checked })} />이 배너 노출</label></div>
    <section className="adm-banner-image-fields"><BannerImageField title="PC 이미지" value={item.desktopImageUrl} onChange={(desktopImageUrl) => onChange({ desktopImageUrl })} onError={onError} /><BannerImageField title="모바일 이미지" value={item.mobileImageUrl} onChange={(mobileImageUrl) => onChange({ mobileImageUrl })} onError={onError} mobile /></section>
    <div className="adm-edit-fields"><label>시작 일시 (KST)<input type="datetime-local" value={kstInput(item.startsAt)} onChange={(event) => onChange({ startsAt: toIso(event.target.value) })} /></label><label>종료 일시 (KST)<input type="datetime-local" value={kstInput(item.endsAt)} onChange={(event) => onChange({ endsAt: toIso(event.target.value) })} /></label></div>
  </section>
}

function BannerImageField({ title, value, onChange, onError, mobile = false }: { title: string; value: string; onChange: (value: string) => void; onError: (value: string) => void; mobile?: boolean }) {
  return <section className="adm-banner-image-field"><h2>{title}</h2><label>이미지 URL<input type="text" value={value.startsWith('data:') ? '' : value} onChange={(event) => onChange(event.target.value)} placeholder="/mrs2.0/banner.jpg 또는 https://..." /></label><label className="adm-button adm-upload"><Upload size={16} />파일 선택<input className="adm-sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={async (event) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; try { onError(''); onChange(await readImage(file)) } catch (failure) { onError((failure as Error).message) } }} /></label>{value && <div className="adm-banner-preview-wrap"><BannerPreview title={`${title} 미리보기`} source={value} mobile={mobile} /><button className="adm-icon" type="button" title={`${title} 삭제`} aria-label={`${title} 삭제`} onClick={() => onChange('')}><X size={16} /></button></div>}<p className="adm-note">JPG·PNG·WebP · 최대 3MB</p></section>
}

function BannerPreview({ title, source, mobile = false }: { title: string; source: string; mobile?: boolean }) {
  return <figure className={`adm-banner-preview ${mobile ? 'is-mobile' : ''}`}><figcaption>{title}</figcaption><img src={source} alt={`${title} 등록 이미지`} /></figure>
}