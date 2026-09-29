import { useRef, useState, type ChangeEvent } from 'react'
import { Download, FileUp } from 'lucide-react'
import type { MaterialCategory } from '../categories'
import type { Inventory, MasterItem } from './adminData'
import { itemFileExample, parseItemFile } from './adminItemFile'
import { registerAdminItems } from './adminItems'

export default function ItemFileActions({ items, assets, categories, onImport }: { items: MasterItem[]; assets: Inventory[]; categories: MaterialCategory[]; onImport: (items: MasterItem[]) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  function downloadExample() {
    const url = URL.createObjectURL(new Blob([itemFileExample()], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'MRS_품목_등록_예시.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    if (!file.name.toLocaleLowerCase().endsWith('.csv')) { setError('CSV 파일만 등록할 수 있습니다.'); return }
    if (!file.size || file.size > 2 * 1024 * 1024) { setError('파일은 2MB 이하로 등록해 주세요.'); return }
    setUploading(true)
    try { onImport(await registerAdminItems(parseItemFile(await file.text(), items, assets, categories))) } catch (reason) { setError(reason instanceof Error ? reason.message : '파일을 읽지 못했습니다.') } finally { setUploading(false) }
  }

  return <div className="adm-item-file-actions">
    <button className="adm-button" type="button" onClick={downloadExample}><Download size={16} />등록 데이터 예시</button>
    <button className="adm-button" type="button" disabled={uploading} onClick={() => input.current?.click()}><FileUp size={16} />{uploading ? '등록 중…' : '품목 파일로 등록'}</button>
    <input ref={input} className="adm-sr-only" type="file" accept=".csv,text/csv" aria-label="품목 CSV 파일 선택" onChange={(event) => void upload(event)} />
    {error && <p className="adm-form-error" role="alert">{error}</p>}
  </div>
}