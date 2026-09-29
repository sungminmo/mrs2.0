import Papa from 'papaparse'
import { itemUnits, type Inventory, type MasterItem } from './adminData'
import type { MaterialCategory } from '../categories'
import { validateMasterItem } from './adminInventory'

const columns = ['품목코드', '품목명', '카테고리코드', '규격', '브랜드', '기준단위', '입고단가', '출고단가', '표준단가', '사용구분', '적요'] as const
type ItemFileRow = Record<typeof columns[number], string>

const exampleRows: ItemFileRow[] = [{
  품목코드: '100001',
  품목명: '재사용 구조용 합판',
  카테고리코드: '020200',
  규격: '12 × 1220 × 2440 mm',
  브랜드: '',
  기준단위: '장',
  입고단가: '8000',
  출고단가: '12000',
  표준단가: '10000',
  사용구분: '사용',
  적요: '단가는 원 단위·부가세 포함',
}]

function optionalPrice(value: string, label: string) {
  const normalized = value.trim().replaceAll(',', '')
  if (!normalized) return null
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) throw new Error(`${label}는 0 이상의 숫자 또는 빈 값으로 입력해 주세요.`)
  return Number(normalized)
}

export function itemFileExample() {
  return `\uFEFF${Papa.unparse(exampleRows, { columns: [...columns], newline: '\r\n' })}`
}

export function parseItemFile(source: string, items: MasterItem[], assets: Inventory[], categories: MaterialCategory[]) {
  const result = Papa.parse<ItemFileRow>(source.replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: 'greedy', transformHeader: (header) => header.trim() })
  if (result.errors.length) throw new Error(`${result.errors[0].row !== undefined ? `${result.errors[0].row + 2}행: ` : ''}${result.errors[0].message}`)
  const headers = result.meta.fields ?? []
  const missing = columns.filter((column) => !headers.includes(column))
  const unknown = headers.filter((header) => !columns.includes(header as typeof columns[number]))
  if (missing.length || unknown.length) throw new Error([missing.length ? `필수 열 누락: ${missing.join(', ')}` : '', unknown.length ? `알 수 없는 열: ${unknown.join(', ')}` : ''].filter(Boolean).join(' · '))
  if (!result.data.length) throw new Error('등록할 품목 데이터가 없습니다.')
  if (result.data.length > 1000) throw new Error('한 파일에 최대 1,000개 품목을 등록할 수 있습니다.')

  const imported: MasterItem[] = []
  for (const [index, row] of result.data.entries()) {
    try {
      const enabled = row.사용구분.trim()
      if (!['사용', '미사용'].includes(enabled)) throw new Error('사용구분은 사용 또는 미사용으로 입력해 주세요.')
      const unit = row.기준단위.trim()
      if (!itemUnits.includes(unit as MasterItem['unit'])) throw new Error(`기준단위는 ${itemUnits.join(', ')} 중 하나로 입력해 주세요.`)
      const item: MasterItem = {
        id: row.품목코드.trim(),
        name: row.품목명.trim(),
        category: row.카테고리코드.trim(),
        specification: row.규격.trim(),
        brand: row.브랜드.trim(),
        unit: unit as MasterItem['unit'],
        inboundPrice: optionalPrice(row.입고단가, '입고단가'),
        outboundPrice: optionalPrice(row.출고단가, '출고단가'),
        standardPrice: optionalPrice(row.표준단가, '표준단가'),
        enabled: enabled === '사용',
        note: row.적요.trim(),
        images: [],
      }
      validateMasterItem(item, [...items, ...imported], assets, categories)
      imported.push(item)
    } catch (error) {
      throw new Error(`${index + 2}행: ${error instanceof Error ? error.message : '품목 데이터를 확인해 주세요.'}`)
    }
  }
  return imported
}