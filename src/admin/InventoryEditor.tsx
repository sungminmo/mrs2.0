import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { ArrowLeft, LoaderCircle, Save, Search, Upload, X } from 'lucide-react'
import { customerForSite, customers, itemUnits, receivings, sites, type AdminImage, type Inspection, type Inventory, type Location, type MasterItem } from './adminData'
import { categoryEnabled, type MaterialCategory } from '../categories'
import CategorySelect from '../CategorySelect'
import { nextAssetCode, prepareInventory, validateMasterItem } from './adminInventory'
import { registerAdminItems, updateAdminItem } from './adminItems'
import { uploadImage, saveImages } from './adminImages'
import { adminAccountRequest } from '../adminAuthSession'

type Props = { kind: 'items' | 'inventory'; items: MasterItem[]; assets: Inventory[]; inspections?: Inspection[]; categories: MaterialCategory[]; locations: Location[]; id: string | null; cancelHref: string; onSaveItem: (item: MasterItem, previousId: string | null) => void; onSaveAsset: (asset: Inventory) => void }

export default function InventoryEditor(props: Props) {
  return <section className="adm-editor">
    <a className="adm-button adm-back" href={props.cancelHref}><ArrowLeft size={15} />취소하고 돌아가기</a>
    {props.kind === 'items' ? <ItemForm {...props} /> : props.id ? <ExistingAssetForm {...props} /> : <AssetForm {...props} />}
  </section>
}

const text = (data: FormData, name: string) => String(data.get(name) ?? '').trim()
const price = (data: FormData, name: string) => text(data, name) === '' ? null : Number(text(data, name))

function ExistingAssetForm({ assets, categories, locations, id, onSaveAsset }: Props) {
  const asset = assets.find((entry) => entry.id === id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const working = useRef(false)
  if (!asset) return <p role="alert">자산을 찾을 수 없습니다.</p>
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (working.current || !asset) return
    const data = new FormData(event.currentTarget)
    working.current = true; setBusy(true); setError('')
    try {
      const { asset: saved } = await adminAccountRequest<{ asset: Inventory }>(`/api/admin/assets/${asset.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedUpdatedAt: asset.updatedAt, reason: text(data, 'reason'), name: text(data, 'name'), category: text(data, 'category'), specification: text(data, 'specification'), brand: text(data, 'brand'), quantity: Number(text(data, 'quantity')), grade: text(data, 'grade'), locationId: text(data, 'locationId'), status: text(data, 'status'), saleStatus: text(data, 'saleStatus') }) })
      onSaveAsset(saved)
    } catch (failure) { setError(failure instanceof Error ? failure.message : '자산 저장에 실패했습니다.') }
    finally { working.current = false; setBusy(false) }
  }
  return <form className="adm-edit-form" onSubmit={submit}>
    <fieldset disabled={busy}>
      <h2>연결 정보</h2><div className="adm-edit-fields">
        <label>자산번호<input value={asset.id} readOnly /></label>
        <label>입고 신청번호<input value={asset.receivingId} readOnly /></label>
        <label>고객사 코드<input value={asset.customerId} readOnly /></label>
        <label>품목코드<input value={asset.itemId ?? ''} readOnly placeholder="미연결" /></label>
      </div>
      <h2>자산 정보</h2><div className="adm-edit-fields">
        <label>자산명<input name="name" defaultValue={asset.name} required maxLength={160} autoFocus /></label>
        <CategorySelect categories={categories} defaultValue={asset.category} retainedId={asset.category} />
        <label>규격 (선택)<input name="specification" defaultValue={asset.specification} maxLength={500} /></label>
        <label>브랜드 (선택)<input name="brand" defaultValue={asset.brand} maxLength={160} /></label>
        <label>현재 수량<input name="quantity" type="number" defaultValue={asset.quantity} required min={0} max={1e9} step={['EA', 'Box', '본'].includes(asset.unit) ? 1 : 0.001} /></label>
        <label>단위<input value={asset.unit} readOnly /></label>
      </div>
      <h2>보관 및 판매</h2><div className="adm-edit-fields">
        <label>로케이션<select name="locationId" defaultValue={asset.locationId}><option value="">미지정</option>{asset.locationId && !locations.some((entry) => entry.id === asset.locationId) && <option value={asset.locationId}>{asset.locationId}</option>}{locations.filter((entry) => entry.enabled || entry.id === asset.locationId).map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.zone}</option>)}</select></label>
        <label>등급<select name="grade" defaultValue={asset.grade}>{['S', 'A', 'B', 'F'].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>보관 상태<select name="status" defaultValue={asset.status}>{['입고대기', '보관중', '출고완료'].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>판매 상태<select name="saleStatus" defaultValue={asset.saleStatus}>{['판매대기', '판매중', '판매완료'].map((value) => <option key={value}>{value}</option>)}</select></label>
      </div>
      <label className="adm-edit-memo">변경 사유<textarea name="reason" rows={3} required maxLength={500} /></label>
    </fieldset>
    <SaveFooter busy={busy} error={error} />
  </form>
}

function ItemForm({ items, assets, categories, id, onSaveItem }: Props) {
  const item = items.find((candidate) => candidate.id === id)
  const linked = assets.some((asset) => asset.itemId === id)
  const [images, setImages] = useState<AdminImage[]>(item?.images ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const data = new FormData(event.currentTarget)
    const next: MasterItem = { id: text(data, 'id'), name: text(data, 'name'), category: text(data, 'category'), specification: text(data, 'specification'), brand: text(data, 'brand'), unit: (linked ? item!.unit : text(data, 'unit')) as MasterItem['unit'], inboundPrice: price(data, 'inboundPrice'), outboundPrice: price(data, 'outboundPrice'), standardPrice: price(data, 'standardPrice'), enabled: data.get('enabled') === 'on', note: text(data, 'note'), images }
    try {
      validateMasterItem(next, items, assets, categories, item?.id)
      setBusy(true)
      const savedItem = item ? await updateAdminItem(item.id, next) : (await registerAdminItems([next]))[0]
      onSaveItem(savedItem, item?.id ?? null)
    } catch (error) { setError((error as Error).message) } finally { setBusy(false) }
  }
  return <form onSubmit={submit} className="adm-edit-form">
    <h2>품목 기본 정보</h2>
    <div className="adm-edit-fields">
      <label><span className="adm-field-label">품목코드<span className="adm-required" aria-label="필수">*</span></span><input name="id" defaultValue={item?.id ?? ''} required inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder="숫자 6자리" autoFocus /></label>
      <label><span className="adm-field-label">품목명<span className="adm-required" aria-label="필수">*</span></span><input name="name" defaultValue={item?.name} required maxLength={120} /></label>
      <CategorySelect categories={categories} defaultValue={item?.category} retainedId={item?.category} />
      <label>규격<input name="specification" defaultValue={item?.specification} maxLength={160} /></label>
      <label>브랜드 (선택)<input name="brand" defaultValue={item?.brand} maxLength={80} /></label>
      <label><span className="adm-field-label">기준 단위<span className="adm-required" aria-label="필수">*</span></span><select name="unit" defaultValue={item?.unit ?? ''} disabled={linked} required><option value="" disabled>선택</option>{itemUnits.map((unit) => <option key={unit}>{unit}</option>)}</select>{linked && <small>연결 자산이 있어 단위를 변경할 수 없습니다.</small>}</label>
    </div>
    <h2>단가 정보 <small>원 / 기준 단위 · 부가세 포함</small></h2>
    <div className="adm-edit-fields adm-price-fields">{([['inboundPrice', '입고단가', true], ['outboundPrice', '출고단가', true], ['standardPrice', '표준단가', false]] as const).map(([name, label, required]) => <label key={name}><span className="adm-field-label">{label}{required && <span className="adm-required" aria-label="필수">*</span>}</span><input type="number" name={name} required={required} min={0} max={1e12} step="any" defaultValue={item?.[name] ?? ''} placeholder={required ? undefined : '미산정'} /></label>)}</div>
    <ImagePicker kind="items" recordId={item?.id} images={images} onChange={setImages} limit={1} onBusy={setBusy} label="대표 이미지" />
    <label className="adm-check"><input name="enabled" type="checkbox" defaultChecked={item?.enabled ?? true} />사용 품목</label>
    <label className="adm-edit-memo">적요 (선택)<textarea name="note" defaultValue={item?.note} rows={4} maxLength={2000} /></label>
    <SaveFooter busy={busy} error={error} label={item ? '저장' : '품목 등록'} />
  </form>
}

function AssetForm({ items, assets, inspections = [], categories, locations, id, onSaveAsset }: Props) {
  const asset = assets.find((candidate) => candidate.id === id)
  const [itemId, setItemId] = useState(asset?.itemId ?? '')
  const [receivingId, setReceivingId] = useState(asset?.receivingId ?? '')
  const [query, setQuery] = useState('')
  const [searchText, setSearchText] = useState('')
  const [searching, startSearch] = useTransition()
  const [images, setImages] = useState<AdminImage[]>(asset?.images ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const item = items.find((candidate) => candidate.id === itemId)
  const receiving = receivings.find((candidate) => candidate.id === receivingId)
  const customer = receiving ? customers.find((candidate) => candidate.id === customerForSite(receiving.siteId)) : null
  const availableItems = items.filter((candidate) => candidate.id === itemId || candidate.enabled && !!candidate.unit && categoryEnabled(categories, candidate.category) && [candidate.id, candidate.name, candidate.specification, candidate.brand].join(' ').toLocaleLowerCase('ko-KR').includes(query.trim().toLocaleLowerCase('ko-KR')))
  const receivedAt = inspections.find((inspection) => inspection.receivingId === receivingId)?.date
  const code = asset?.id ?? (receivedAt ? nextAssetCode(receivedAt, assets) : '')
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const data = new FormData(event.currentTarget)
    if (!item || !item.unit) { setError('카테고리와 기준 단위가 등록된 품목을 선택해 주세요.'); return }
    const next: Inventory = { id: code, itemId, receivingId, customerId: customer?.id ?? '', receiptId: asset?.receiptId ?? null, name: text(data, 'name'), category: text(data, 'category'), specification: text(data, 'specification'), brand: text(data, 'brand'), quantity: Number(text(data, 'quantity')), unit: item.unit, locationId: text(data, 'locationId'), grade: text(data, 'grade') as Inventory['grade'], status: text(data, 'status') as Inventory['status'], saleStatus: text(data, 'saleStatus') as Inventory['saleStatus'], appraisal: asset?.appraisal ?? null, images, history: asset?.history ?? [] }
    try { onSaveAsset(prepareInventory(next, asset, items, text(data, 'reason'), categories, locations)) } catch (error) { setError((error as Error).message) }
  }
  return <form onSubmit={submit} className="adm-edit-form">
    <h2>연결 정보</h2>
    <div className="adm-edit-fields">
      <label>재고번호<input value={code} readOnly placeholder="입고 신청 선택 시 생성" /></label>
      <label>입고 신청번호<select value={receivingId} onChange={(event) => setReceivingId(event.target.value)} disabled={!!asset} required autoFocus><option value="" disabled>입고 신청 선택</option>{receivings.filter((request) => request.status !== '취소').map((request) => <option key={request.id} value={request.id}>{request.id} · {request.summary}</option>)}</select></label>
      <label>고객사<input value={customer?.name ?? ''} readOnly placeholder="입고 신청 선택 시 자동 연결" /></label>
      <label>현장<input value={sites.find((site) => site.id === receiving?.siteId)?.name ?? ''} readOnly /></label>
      {!asset && <><label>품목 검색<input type="search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="품목코드, 품목명, 규격, 브랜드" /></label><button className="adm-button adm-primary adm-search-button" type="button" aria-busy={searching} disabled={searching} onClick={() => startSearch(() => setQuery(searchText))}>{searching ? <LoaderCircle className="adm-spinner" size={16} /> : <Search size={16} />}{searching ? '검색 중' : '검색'}</button></>}
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
    {asset ? <ImagePicker kind="assets" recordId={asset.id} images={images} onChange={setImages} limit={8} onBusy={setBusy} label="자산 이미지" /> : <p className="adm-note">자산 이미지 업로드는 DB에 등록된 자산의 상세 화면에서 가능합니다.</p>}
    {asset && <label className="adm-edit-memo">변경 사유<textarea name="reason" rows={3} required maxLength={500} /></label>}
    <p className="adm-note">현재 수량은 입고대기 시 예정 수량, 보관중 시 잔량입니다. 출고완료는 0으로 입력합니다. 판매 상태 변경은 마켓 승인·상품 노출·정산을 실행하지 않습니다.</p>
    <SaveFooter busy={busy} error={error} />
  </form>
}

function SaveFooter({ busy, error, label = '저장' }: { busy: boolean; error: string; label?: string }) {
  const errorRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])
  return <div className="adm-edit-footer">{error && <p className="adm-form-error" role="alert" ref={errorRef} tabIndex={-1}>{error}</p>}<button className="adm-button adm-primary" type="submit" disabled={busy}><Save size={16} />{busy ? '저장 중...' : label}</button></div>
}

export function ImagePicker({ kind, recordId, images, onChange, limit, onBusy, label }: { kind: 'items' | 'assets'; recordId?: string; images: AdminImage[]; onChange: (images: AdminImage[]) => void; limit: number; onBusy?: (busy: boolean) => void; label: string }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [expected, setExpected] = useState(images)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [dirty, setDirty] = useState(false)
  const generation = useRef(0)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => { generation.current += 1; controller.current?.abort() }, [])
  return <section className="adm-image-picker"><h2>{label} <small>{images.length} / {limit}</small></h2><p className="adm-note">JPG·PNG·WebP · 파일당 최대 5MB</p><label className="adm-button adm-upload"><Upload size={16} />{limit === 1 && images.length ? '이미지 교체' : '이미지 첨부'}<input className="adm-sr-only" type="file" aria-label={`${label} 첨부`} accept="image/jpeg,image/png,image/webp" multiple={limit > 1} disabled={busy} onChange={async (event) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    setError('')
    if (files.length + (limit === 1 ? 0 : images.length) > limit) { setError(`이미지는 최대 ${limit}개까지 첨부할 수 있습니다.`); return }
    const current = ++generation.current
    controller.current = new AbortController()
    setBusy(true); onBusy?.(true); setMessage('')
    try { const added: AdminImage[] = []; for (const file of files) added.push(await uploadImage(file, kind, controller.current.signal)); if (generation.current === current) { onChange(limit === 1 ? added : [...images, ...added]); setDirty(true) } } catch (error) { if (generation.current === current) setError((error as Error).message) } finally { if (generation.current === current) { setBusy(false); onBusy?.(false) } }
  }} /></label>{busy && <p role="status"><LoaderCircle className="adm-spinner" size={16} /> 이미지 처리 중...</p>}{error && <p className="adm-form-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}<div className="adm-image-grid">{images.map((image) => <figure key={image.id}><img src={image.url} alt={image.name} /><figcaption>{image.name}</figcaption><button className="adm-icon" type="button" title={`${image.name} 삭제`} aria-label={`${image.name} 삭제`} disabled={busy} onClick={() => { onChange(images.filter((candidate) => candidate.id !== image.id)); setDirty(true); setMessage('') }}><X size={16} /></button></figure>)}</div>{recordId && <><label className="customer-reason">이미지 변경 사유<input value={reason} maxLength={500} disabled={busy} onChange={(event) => setReason(event.target.value)} /></label><button type="button" className="adm-button adm-primary" disabled={busy || !dirty || !reason.trim()} onClick={async () => { setBusy(true); onBusy?.(true); setError(''); setMessage(''); try { const saved = await saveImages(kind, recordId, images, expected, reason); setExpected(saved); onChange(saved); setDirty(false); setMessage('이미지가 DB에 저장되었습니다.') } catch (error) { setError((error as Error).message) } finally { setBusy(false); onBusy?.(false) } }}><Save size={16} />이미지 DB 저장</button></>}</section>
}