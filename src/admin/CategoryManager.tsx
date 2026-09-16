import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ChevronRight, Plus, Save } from 'lucide-react'
import { categoryChain, categoryChildren, categoryEnabled, categoryMatches, categoryPath, validateCategory, type MaterialCategory } from '../categories'
import { nextCode } from './adminInventory'
import type { Inventory, MasterItem } from './adminData'

export default function CategoryManager({ categories, items, assets, params, onSave }: { categories: MaterialCategory[]; items: MasterItem[]; assets: Inventory[]; params: URLSearchParams; onSave: (category: MaterialCategory) => void }) {
  const selected = categories.find((category) => category.id === params.get('id'))
  const creating = params.get('mode') === 'new'
  const parentId = params.get('parent') || null
  const chain = categoryChain(categories, creating ? parentId ?? '' : selected?.id ?? '')
  const href = (id: string) => `#/admin/categories?tab=tree&id=${encodeURIComponent(id)}`
  const createHref = (parent: string | null) => `#/admin/categories?tab=tree&mode=new${parent ? `&parent=${encodeURIComponent(parent)}` : ''}`
  const invalidParent = creating && parentId !== null && (!categories.some((category) => category.id === parentId) || categoryChain(categories, parentId).length >= 3)
  return <>
    <p className="adm-note">3차 분류 기준 · 상위 분류 미사용 시 하위 분류 신규 선택 제한 · 새로고침·고객 포털 이동 시 초기화</p>
    <div className="adm-category-columns">{[0, 1, 2].map((depth) => {
      const parent = depth === 0 ? null : chain[depth - 1]?.id
      const children = parent === undefined ? [] : categoryChildren(categories, parent)
      return <section key={depth} aria-label={`${depth + 1}차 카테고리`}>
        <div className="adm-list-heading"><h2>{depth + 1}차 분류 <span>{children.length}</span></h2>{parent !== undefined && <a className="adm-icon" title={`${depth + 1}차 카테고리 추가`} aria-label={`${depth + 1}차 카테고리 추가`} href={createHref(parent)}><Plus size={17} /></a>}</div>
        <ul>{children.map((category) => <li key={category.id}><a href={href(category.id)} aria-current={chain[depth]?.id === category.id ? 'true' : undefined}><span>{category.name}<small>{category.id} · {categoryEnabled(categories, category.id) ? '사용' : category.enabled ? '상위 미사용' : '미사용'}</small></span><ChevronRight size={15} /></a></li>)}</ul>
        {!children.length && <p className="adm-note">{parent === undefined ? '상위 분류를 선택해 주세요.' : '등록된 분류가 없습니다.'}</p>}
      </section>
    })}</div>
    {invalidParent || params.has('id') && !selected ? <p className="adm-form-error" role="alert">카테고리를 찾을 수 없거나 하위 분류를 추가할 수 없습니다.</p> : creating || selected ? <>
      <CategoryForm key={`${selected?.id ?? ''}/${creating}/${parentId}`} categories={categories} category={creating ? undefined : selected} parentId={parentId} onSave={onSave} />
      {!creating && selected && <section className="adm-detail-section"><h2>연결 내역 · 하위 분류 포함</h2><div className="adm-related"><a href={`#/admin/items?tab=master&category=${selected.id}`}>품목 {items.filter((item) => categoryMatches(categories, item.category, selected.id)).length}건<ChevronRight size={14} /></a><a href={`#/admin/inventory?tab=stock&category=${selected.id}`}>자산 {assets.filter((asset) => categoryMatches(categories, asset.category, selected.id)).length}건<ChevronRight size={14} /></a><a href={`#/admin/market?tab=products&category=${selected.id}`}>상품 조회<ChevronRight size={14} /></a></div></section>}
    </> : <p className="adm-note">수정할 분류를 선택하거나 새 분류를 등록해 주세요.</p>}
  </>
}

function CategoryForm({ categories, category, parentId, onSave }: { categories: MaterialCategory[]; category?: MaterialCategory; parentId: string | null; onSave: (category: MaterialCategory) => void }) {
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])
  const depth = category ? categoryChain(categories, category.id).length : categoryChain(categories, parentId ?? '').length + 1
  const code = category?.id ?? nextCode('CAT-', categories, 3)
  const parents = categories.filter((candidate) => categoryChain(categories, candidate.id).length === depth - 1)
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const next: MaterialCategory = { id: code, parentId: depth === 1 ? null : String(data.get('parentId')), name: String(data.get('name') ?? '').trim(), order: Number(data.get('order')), enabled: data.get('enabled') === 'on' }
    try { validateCategory(next, categories); setError(''); onSave(next); setSaved(true) } catch (error) { setSaved(false); setError((error as Error).message) }
  }
  return <form className="adm-edit-form adm-category-form" onSubmit={submit} onInput={() => { setSaved(false); setError('') }}><h2 ref={heading} tabIndex={-1}>{depth}차 카테고리 {category ? '수정' : '등록'}</h2>
    <div className="adm-edit-fields"><label>카테고리 코드<input value={code} readOnly /></label><label>카테고리명<input name="name" defaultValue={category?.name ?? ''} required maxLength={80} /></label>
      {depth > 1 && <label>상위 카테고리<select name="parentId" defaultValue={category?.parentId ?? parentId ?? ''} required>{parents.map((parent) => <option key={parent.id} value={parent.id}>{categoryPath(categories, parent.id)}{categoryEnabled(categories, parent.id) ? '' : ' (미사용)'}</option>)}</select></label>}
      <label>노출 순서<input name="order" type="number" required min={0} max={9999} step={1} defaultValue={category?.order ?? categoryChildren(categories, parentId).length + 1} /></label></div>
    <label className="adm-check"><input type="checkbox" name="enabled" defaultChecked={category?.enabled ?? (parentId ? categoryEnabled(categories, parentId) : true)} />사용 카테고리</label>
    {category && <p className="adm-note">현재 경로: {categoryPath(categories, category.id)} · 적용 상태: {categoryEnabled(categories, category.id) ? '사용' : '미사용 (상위 분류 포함)'}</p>}
    {error && <p className="adm-form-error" role="alert">{error}</p>}
    {saved && <p className="adm-note" role="status">카테고리가 임시 저장되었습니다.</p>}
    <div className="adm-edit-footer"><button className="adm-button adm-primary" type="submit"><Save size={16} />카테고리 임시 저장</button></div>
  </form>
}