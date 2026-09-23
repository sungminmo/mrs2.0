import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ImagePlus, Pencil, Plus, Save, Upload, X } from 'lucide-react'
import { authenticatedFetch } from '../authSession'
import type { CustomerBanner } from '../banners'

type AdminBanner = CustomerBanner & { createdAt: string; updatedAt: string }

const emptyBanner: AdminBanner = { id: '', desktopImageUrl: '', mobileImageUrl: '', linkUrl: null, enabled: true, startsAt: null, endsAt: null, createdAt: '', updatedAt: '' }

function statusOf(banner: AdminBanner) {
  const now = Date.now()
  if (!banner.enabled) return '노출 중지'
  if (banner.startsAt && now < Date.parse(banner.startsAt)) return '예약'
  if (banner.endsAt && now >= Date.parse(banner.endsAt)) return '종료'
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
  const [banners, setBanners] = useState<AdminBanner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const id = params.get('id') ?? ''
  const mode = params.get('mode')
  const selected = banners.find((banner) => banner.id === id)
  const editing = mode === 'new' || mode === 'edit' && !!selected

  useEffect(() => {
    let active = true
    authenticatedFetch('/api/admin/banners').then(async (response) => {
      if (!response.ok) throw new Error('배너 목록을 불러오지 못했습니다.')
      const body = await response.json() as { data: { banners: AdminBanner[] } }
      if (active) setBanners(body.data.banners)
    }).catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : '배너 목록을 불러오지 못했습니다.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  if (loading) return <p className="adm-note" role="status">배너 목록을 불러오는 중입니다.</p>
  if (editing) return <BannerEditor banner={selected} cancelHref={selected ? `#/admin/content?tab=banners&id=${selected.id}` : '#/admin/content?tab=banners'} onSaved={(banner) => { setBanners((current) => current.some((item) => item.id === banner.id) ? current.map((item) => item.id === banner.id ? banner : item) : [...current, banner]); window.location.hash = `/admin/content?tab=banners&id=${banner.id}` }} />
  if (id) return selected ? <BannerDetail banner={selected} /> : <div className="adm-empty"><h2>배너를 찾을 수 없습니다</h2><a href="#/admin/content?tab=banners">목록으로</a></div>

  return <>
    {error && <p className="adm-form-error" role="alert">{error}</p>}
    <div className="adm-management-actions"><p className="adm-note">배너 ID를 고객 프론트에서 조회하면 어드민 변경 없이 새 노출 위치를 연결할 수 있습니다.</p><a className="adm-button adm-primary" href="#/admin/content?tab=banners&mode=new"><Plus size={16} />배너 등록</a></div>
    <div className="adm-list-heading"><h2>고객 배너 <span>{banners.length}건</span></h2></div>
    <div className="adm-table-scroll" tabIndex={0} role="region" aria-label="고객 배너 표"><table><thead><tr><th scope="col">미리보기</th><th scope="col">배너 ID</th><th scope="col">노출 기간</th><th scope="col">링크</th><th scope="col">상태</th><th scope="col">상세</th></tr></thead><tbody>{banners.map((banner) => <tr key={banner.id}><td><picture className="adm-banner-thumb"><source media="(max-width: 640px)" srcSet={banner.mobileImageUrl} /><img src={banner.desktopImageUrl} alt="" /></picture></td><td><strong>{banner.id}</strong></td><td>{dateText(banner.startsAt)}<br />~ {dateText(banner.endsAt)}</td><td className="adm-banner-link">{banner.linkUrl ?? '없음'}</td><td><span className={`adm-status adm-status-${statusOf(banner) === '노출 중' ? 'active' : statusOf(banner) === '예약' ? 'wait' : 'muted'}`}>{statusOf(banner)}</span></td><td><a className="adm-detail-link" href={`#/admin/content?tab=banners&id=${banner.id}`}>상세보기</a></td></tr>)}</tbody></table></div>
    {!banners.length && <div className="adm-empty"><ImagePlus size={24} /><h2>등록된 배너가 없습니다</h2><a href="#/admin/content?tab=banners&mode=new">첫 배너 등록</a></div>}
  </>
}

function BannerDetail({ banner }: { banner: AdminBanner }) {
  return <article className="adm-record">
    <div className="adm-management-actions"><a className="adm-button adm-back" href="#/admin/content?tab=banners"><ArrowLeft size={15} />목록으로</a><a className="adm-button adm-primary" href={`#/admin/content?tab=banners&id=${banner.id}&mode=edit`}><Pencil size={16} />배너 수정</a></div>
    <div className="adm-list-heading"><h2>{banner.id}</h2><span className="adm-status adm-status-active">{statusOf(banner)}</span></div>
    <dl className="adm-fields"><div><dt>배너 ID</dt><dd>{banner.id}</dd></div><div><dt>클릭 이동</dt><dd>{banner.linkUrl ?? '없음'}</dd></div><div><dt>시작 일시 (KST)</dt><dd>{dateText(banner.startsAt)}</dd></div><div><dt>종료 일시 (KST)</dt><dd>{dateText(banner.endsAt)}</dd></div></dl>
    <section className="adm-banner-previews"><BannerPreview title="PC 이미지" source={banner.desktopImageUrl} /><BannerPreview title="모바일 이미지" source={banner.mobileImageUrl} mobile /></section>
  </article>
}

function BannerEditor({ banner = emptyBanner, cancelHref, onSaved }: { banner?: AdminBanner; cancelHref: string; onSaved: (banner: AdminBanner) => void }) {
  const [desktopImageUrl, setDesktopImageUrl] = useState(banner.desktopImageUrl)
  const [mobileImageUrl, setMobileImageUrl] = useState(banner.mobileImageUrl)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const errorRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const id = String(data.get('id') ?? '').trim()
    setBusy(true); setError('')
    try {
      const response = await authenticatedFetch(`/api/admin/banners/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ desktopImageUrl, mobileImageUrl, linkUrl: String(data.get('linkUrl') ?? '').trim(), enabled: data.has('enabled'), startsAt: toIso(String(data.get('startsAt') ?? '')), endsAt: toIso(String(data.get('endsAt') ?? '')) }) })
      const body = await response.json() as { data?: { banner: AdminBanner }; error?: { message?: string } }
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? '배너를 저장하지 못했습니다.')
      onSaved(body.data.banner)
    } catch (failure) { setError(failure instanceof Error ? failure.message : '배너를 저장하지 못했습니다.'); setBusy(false) }
  }

  return <form className="adm-editor adm-edit-form" onSubmit={submit}>
    <a className="adm-button adm-back" href={cancelHref}><ArrowLeft size={15} />취소</a>
    <h2>배너 연결 <small>고객 프론트에서 동일한 ID를 조회해 노출합니다.</small></h2>
    <div className="adm-edit-fields"><label>배너 ID<input name="id" required minLength={2} maxLength={80} pattern="[A-Za-z0-9][A-Za-z0-9._:-]*" defaultValue={banner.id} readOnly={!!banner.id} placeholder="customer-home-hero-03" /><small>영문, 숫자, 점, 밑줄, 콜론, 하이픈</small></label><label>클릭 이동 URL<input name="linkUrl" type="text" maxLength={2048} defaultValue={banner.linkUrl ?? ''} placeholder="/mrs2.0/#/market 또는 https://example.com" /><small>내부 경로와 외부 HTTP(S) 링크 지원</small></label></div>
    <section className="adm-banner-image-fields"><BannerImageField title="PC 이미지" value={desktopImageUrl} onChange={setDesktopImageUrl} onError={setError} /><BannerImageField title="모바일 이미지" value={mobileImageUrl} onChange={setMobileImageUrl} onError={setError} mobile /></section>
    <h2>노출 설정</h2>
    <div className="adm-edit-fields"><label>시작 일시 (KST)<input name="startsAt" type="datetime-local" defaultValue={kstInput(banner.startsAt)} /></label><label>종료 일시 (KST)<input name="endsAt" type="datetime-local" defaultValue={kstInput(banner.endsAt)} /></label></div>
    <label className="adm-check"><input name="enabled" type="checkbox" defaultChecked={banner.enabled} />배너 노출</label>
    <p className="adm-note">시작·종료를 비워두면 해당 방향의 기간 제한이 없습니다. 종료 일시는 노출에 포함되지 않습니다.</p>
    <div className="adm-edit-footer">{error && <p className="adm-form-error" role="alert" ref={errorRef} tabIndex={-1}>{error}</p>}<button className="adm-button adm-primary" type="submit" disabled={busy || !desktopImageUrl || !mobileImageUrl}><Save size={16} />{busy ? '저장 중...' : '저장'}</button></div>
  </form>
}

function BannerImageField({ title, value, onChange, onError, mobile = false }: { title: string; value: string; onChange: (value: string) => void; onError: (value: string) => void; mobile?: boolean }) {
  return <section className="adm-banner-image-field"><h2>{title}</h2><label>이미지 URL<input type="text" value={value.startsWith('data:') ? '' : value} onChange={(event) => onChange(event.target.value)} placeholder="/mrs2.0/banner.jpg 또는 https://..." /></label><label className="adm-button adm-upload"><Upload size={16} />파일 선택<input className="adm-sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={async (event) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; try { onError(''); onChange(await readImage(file)) } catch (failure) { onError((failure as Error).message) } }} /></label>{value && <div className="adm-banner-preview-wrap"><BannerPreview title={`${title} 미리보기`} source={value} mobile={mobile} /><button className="adm-icon" type="button" title={`${title} 삭제`} aria-label={`${title} 삭제`} onClick={() => onChange('')}><X size={16} /></button></div>}<p className="adm-note">JPG·PNG·WebP · 최대 3MB</p></section>
}

function BannerPreview({ title, source, mobile = false }: { title: string; source: string; mobile?: boolean }) {
  return <figure className={`adm-banner-preview ${mobile ? 'is-mobile' : ''}`}><figcaption>{title}</figcaption><img src={source} alt={`${title} 등록 이미지`} /></figure>
}