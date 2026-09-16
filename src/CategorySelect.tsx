import { useState } from 'react'
import { categoryChain, categoryChildren, categoryEnabled, type MaterialCategory } from './categories'
import './CategorySelect.css'

type Props = { categories: MaterialCategory[]; value?: string; defaultValue?: string; onChange?: (id: string) => void; required?: boolean; retainedId?: string; name?: string }

export default function CategorySelect({ categories, value, defaultValue = '', onChange, required = false, retainedId, name = 'category' }: Props) {
  const [selected, setSelected] = useState(defaultValue)
  const current = value ?? selected
  const chain = categoryChain(categories, current)
  const retained = categoryChain(categories, retainedId ?? '').map((category) => category.id)
  const update = (id: string) => { setSelected(id); onChange?.(id) }
  return <fieldset className="category-select"><legend>카테고리{required ? ' (3차 필수)' : ''}</legend>
    {required && <input type="hidden" name={name} value={chain.length === 3 ? current : ''} />}
    <div className="category-select-levels">{[0, 1, 2].map((depth) => {
      const parent = depth === 0 ? null : chain[depth - 1]?.id
      const children = parent === undefined ? [] : categoryChildren(categories, parent).filter((category) => !required || categoryEnabled(categories, category.id) || retained.includes(category.id))
      return <label key={depth}>{depth + 1}차 분류<select aria-label={`${depth + 1}차 분류`} required={required} disabled={depth > 0 && !parent} value={chain[depth]?.id ?? ''} onChange={(event) => update(event.target.value || parent || '')}>
        <option value="">{required ? '선택' : '전체'}</option>{children.map((category) => <option key={category.id} value={category.id}>{category.name}{categoryEnabled(categories, category.id) ? '' : ' (미사용)'}</option>)}
      </select></label>
    })}</div>
  </fieldset>
}