import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, Save, Upload, X } from 'lucide-react'
import { customerForSite, customers, itemUnits, receivings, sites, type AdminImage, type Inventory, type Location, type MasterItem } from './adminData'
import { categoryEnabled, type MaterialCategory } from '../categories'
import CategorySelect from '../CategorySelect'
import { nextCode, prepareInventory, validateMasterItem } from './adminInventory'

type Props = { kind: 'items' | 'inventory'; items: MasterItem[]; assets: Inventory[]; categories: MaterialCategory[]; locations: Location[]; id: string | null; cancelHref: string; onSaveItem: (item: MasterItem) => void; onSaveAsset: (asset: Inventory) => void }

export default function InventoryEditor(props: Props) {
  return <section className="adm-editor">
    <a className="adm-button adm-back" href={props.cancelHref}><ArrowLeft size={15} />취소하고 돌아가기</a>
    <p className="adm-note">임시 저장 · 새로고침하거나 고객 포털로 이동하면 초기화됩니다.</p>
    {props.kind === 'items' ? <ItemForm {...props} /> : <AssetForm {...props} />}
  </section>
}

const text = (data: FormData, name: string) => String(data.get(name) ?? '').trim()
const price = (data: FormData, name: string) => text(data, name) === '' ? null : Number(text(data, name))

function ItemForm({ items, assets, categories, id, onSaveItem }: Props) {
  const item = items.find((candidate) => candidate.id === id)
  const code = item?.id ?? nextCode('ITM-', items, 6)
  const linked = assets.some((asset) => asset.itemId === id)
  const [images, setImages] = useState<AdminImage[]>(item?.images ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const next: MasterItem = { id: code, name: text(data, 'name'), category: text(data, 'category'), specification: text(data, 'specification'), brand: text(data, 'brand'), unit: (linked ? item!.unit : text(data, 'unit')) as MasterItem['unit'], inboundPrice: price(data, 'inboundPrice'), outboundPrice: price(data, 'outboundPrice'), standardPrice: price(data, 'standardPrice'), enabled: data.get('enabled') === 'on', note: text(data, 'note'), images }
    try { validateMasterItem(next, items, assets, categories); onSaveItem(next) } catch (error) { setError((error as Error).message) }
  }
  return <form onSubmit={submit} className="adm-edit-form">
    <h2>품목 기본 정보</h2>
    <div className="adm-edit-fields">
      <label>품목코드<input value={code} readOnly /></label>
      <label>품목명<input name="name" defaultValue={item?.name} required maxLength={120} autoFocus /></label>
      <CategorySelect categories={categories} defaultValue={item?.category} retainedId={item?.category} required />
      <label>규격<input name="specification" defaultValue={item?.specification} required maxLength={160} /></label>
      <label>브랜드 (선택)<input name="brand" defaultValue={item?.brand} maxLength={80} /></label>
      <label>기준 단위<select name="unit" defaultValue={item?.unit ?? ''} disabled={linked} required><option value="" disabled>선택</option>{itemUnits.map((unit) => <option key={unit}>{unit}</option>)}</select>{linked && <small>연결 자산이 있어 단위를 변경할 수 없습니다.</small>}</label>
    </div>
    <h2>단가 정보 <small>원 / 기준 단위 · 부가세 포함</small></h2>
    <div className="adm-edit-fields adm-price-fields">{([['inboundPrice', '입고단가'], ['outboundPrice', '출고단가'], ['standardPrice', '표준단가']] as const).map(([name, label]) => <label key={name}>{label}<input type="number" name={name} min={0} max={1e12} step="any" defaultValue={item?.[name] ?? ''} placeholder="미산정" /></label>)}</div>
    <ImagePicker images={images} onChange={setImages} limit={1} onBusy={setBusy} label="대표 이미지" />
    <label className="adm-check"><input name="enabled" type="checkbox" defaultChecked={item?.enabled ?? true} />사용 품목</label>
    <label className="adm-edit-memo">적요 (선택)<textarea name="note" defaultValue={item?.note} rows={4} maxLength={2000} /></label>
    <SaveFooter busy={busy} error={error} />
  </form>
}

function AssetForm({ items, assets, categories, locations, id, onSaveAsset }: Props) {
  const asset = assets.find((candidate) => candidate.id === id)
  const [itemId, setItemId] = useState(asset?.itemId ?? '')
  const [receivingId, setReceivingId] = useState(asset?.receivingId ?? '')
  const [query, setQuery] = useState('')
  const [images, setImages] = useState<AdminImage[]>(asset?.images ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const item = items.find((candidate) => candidate.id === itemId)
  const receiving = receivings.find((candidate) => candidate.id === receivingId)
  const customer = receiving ? customers.find((candidate) => candidate.id === customerForSite(receiving.siteId)) : null
  const availableItems = items.filter((candidate) => candidate.id === itemId || candidate.enabled && categoryEnabled(categories, candidate.category) && [candidate.id, candidate.name, candidate.specification, candidate.brand].join(' ').toLocaleLowerCase('ko-KR').includes(query.trim().toLocaleLowerCase('ko-KR')))
  const code = asset?.id ?? nextCode('AST-', assets, 3)
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    if (!item) { setError('품목을 선택해 주세요.'); return }
    const next: Inventory = { id: code, itemId, receivingId, customerId: customer?.id ?? '', receiptId: asset?.receiptId ?? null, name: text(data, 'name'), category: text(data, 'category'), specification: text(data, 'specification'), brand: text(data, 'brand'), quantity: Number(text(data, 'quantity')), unit: item.unit, locationId: text(data, 'locationId'), grade: text(data, 'grade') as Inventory['grade'], status: text(data, 'status') as Inventory['status'], saleStatus: text(data, 'saleStatus') as Inventory['saleStatus'], appraisal: asset?.appraisal ?? null, images, history: asset?.history ?? [] }
    try { onSaveAsset(prepareInventory(next, asset, items, text(data, 'reason'), categories, locations)) } catch (error) { setError((error as Error).message) }
  }
  return <form onSubmit={submit} className="adm-edit-form">
    <h2>연결 정보</h2>
    <div className="adm-edit-fields">
      <label>재고번호<input value={code} readOnly /></label>
      <label>입고 신청번호<select value={receivingId} onChange={(event) => setReceivingId(event.target.value)} disabled={!!asset} required autoFocus><option value="" disabled>입고 신청 선택</option>{receivings.filter((request) => request.status !== '취소').map((request) => <option key={request.id} value={request.id}>{request.id} · {request.summary}</option>)}</select></label>
      <label>고객사<input value={customer?.name ?? ''} readOnly placeholder="입고 신청 선택 시 자동 연결" /></label>
      <label>현장<input value={sites.find((site) => site.id === receiving?.siteId)?.name ?? ''} readOnly /></label>
      {!asset && <label>품목 검색<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="품목코드, 품목명, 규격, 브랜드" /></label>}
      <label>품목코드<select value={itemId} onChange={(event) => setItemId(event.target.value)} required disabled={!!asset}><option value="" disabled>품목 선택</option>{availableItems.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.id} · {candidate.name}{candidate.enabled ? '' : ' (미사용)'}</option>)}</select>{!availableItems.length && <small>일치하는 사용 품목이 없습니다.</small>}</label>
    </div>
    <h2>자산 정보</h2>
    <div className="adm-edit-fields" key={itemId}>
      <label>자산명<input name="name" defaultValue={asset?.name ?? item?.name ?? ''} required maxLength={120} /></label>
      <CategorySelect categories={categories} defaultValue={asset?.category ?? item?.category} retainedId={asset?.category} required />
      <label>규격<input name="specification" defaultValue={asset?.specification ?? item?.specification ?? ''} required maxLength={160} /></label>
      <label>브랜드 (선택)<input name="brand" defaultValue={asset?.brand ?? item?.brand ?? ''} maxLength={80} /></label>
      <label>현재 수량<input name="quantity" type="number" defaultValue={asset?.quantity ?? ''} required min={0} max={1e9} step={item && ['EA', 'Box', '본'].includes(item.unit) ? 1 : 0.001} /></label>
      <label>단위<input value={item?.unit ?? ''} readOnly /></label>
    </div>
    <h2>보관 및 판매</h2>
    <div className="adm-edit-fields">
      <label>로케이션<select name="locationId" defaultValue={asset?.locationId ?? ''}><option value="">미지정</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name} · {location.zone}</option>)}</select></label>
      <label>등급<select name="grade" defaultValue={asset?.grade ?? ''} required><option value="" disabled>등급 선택</option>{['S', 'A', 'B', 'F'].map((grade) => <option key={grade} value={grade}>{grade === 'F' ? 'F (폐기)' : grade}</option>)}</select></label>
      <label>보관 상태<select name="status" defaultValue={asset?.status ?? '입고대기'}>{['입고대기', '보관중', '출고완료'].map((status) => <option key={status}>{status}</option>)}</select></label>
      <label>판매 상태<select name="saleStatus" defaultValue={asset?.saleStatus ?? '판매대기'}>{['판매대기', '판매중', '판매완료'].map((status) => <option key={status}>{status}</option>)}</select></label>
    </div>
    <ImagePicker images={images} onChange={setImages} limit={8} onBusy={setBusy} label="자산 이미지" />
    {asset && <label className="adm-edit-memo">변경 사유<textarea name="reason" rows={3} required maxLength={500} /></label>}
    <p className="adm-note">현재 수량은 입고대기 시 예정 수량, 보관중 시 잔량입니다. 출고완료는 0으로 입력합니다. 판매 상태 변경은 마켓 승인·상품 노출·정산을 실행하지 않습니다.</p>
    <SaveFooter busy={busy} error={error} />
  </form>
}

function SaveFooter({ busy, error }: { busy: boolean; error: string }) {
  const errorRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])
  return <div className="adm-edit-footer">{error && <p className="adm-form-error" role="alert" ref={errorRef} tabIndex={-1}>{error}</p>}<button className="adm-button adm-primary" type="submit" disabled={busy}><Save size={16} />{busy ? '이미지 확인 중...' : '임시 저장'}</button></div>
}

function loadImage(file: File): Promise<AdminImage> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return Promise.reject(new Error('JPG, PNG, WebP 이미지 파일만 첨부할 수 있습니다.'))
  if (!file.size || file.size > 5 * 1024 * 1024) return Promise.reject(new Error('이미지는 파일당 5MB 이하로 첨부해 주세요.'))
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'))
    reader.onload = () => {
      const url = String(reader.result)
      const image = new Image()
      image.onload = () => resolve({ id: crypto.randomUUID(), name: file.name, url })
      image.onerror = () => reject(new Error('이미지 내용이 손상되었거나 지원하지 않는 형식입니다.'))
      image.src = url
    }
    reader.readAsDataURL(file)
  })
}

function ImagePicker({ images, onChange, limit, onBusy, label }: { images: AdminImage[]; onChange: (images: AdminImage[]) => void; limit: number; onBusy: (busy: boolean) => void; label: string }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  useEffect(() => () => { generation.current += 1 }, [])
  return <section className="adm-image-picker"><h2>{label} <small>{images.length} / {limit}</small></h2><p className="adm-note">JPG·PNG·WebP · 파일당 최대 5MB</p><label className="adm-button adm-upload"><Upload size={16} />{limit === 1 && images.length ? '이미지 교체' : '이미지 첨부'}<input className="adm-sr-only" type="file" aria-label={`${label} 첨부`} accept="image/jpeg,image/png,image/webp" multiple={limit > 1} disabled={busy} onChange={async (event) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    setError('')
    if (files.length + (limit === 1 ? 0 : images.length) > limit) { setError(`이미지는 최대 ${limit}개까지 첨부할 수 있습니다.`); return }
    const current = ++generation.current
    setBusy(true); onBusy(true)
    try { const added = await Promise.all(files.map(loadImage)); if (generation.current === current) onChange(limit === 1 ? added : [...images, ...added]) } catch (error) { if (generation.current === current) setError((error as Error).message) } finally { if (generation.current === current) { setBusy(false); onBusy(false) } }
  }} /></label>{error && <p className="adm-form-error" role="alert">{error}</p>}<div className="adm-image-grid">{images.map((image) => <figure key={image.id}><img src={image.url} alt={image.name} /><figcaption>{image.name}</figcaption><button className="adm-icon" type="button" title={`${image.name} 삭제`} aria-label={`${image.name} 삭제`} disabled={busy} onClick={() => onChange(images.filter((candidate) => candidate.id !== image.id))}><X size={16} /></button></figure>)}</div></section>
}