import ExcelJS from 'exceljs'
import { unzipSync } from 'fflate'
import { emptyInspectionRow, inspectionRowErrors, inspectionUnits, type InspectionRow } from '../inspections'

export const inspectionHeaders = ['품목코드(선택)', '자산명', '규격', '브랜드(선택)', '카테고리코드', '단위', '등급', '입고수량', '재사용수량', '폐기수량', '폐기사유', '로케이션코드']
export type InspectionImport = { rows: InspectionRow[]; errors: { row: number; messages: string[] }[] }
export async function inspectionTemplate(): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('1차검수')
  sheet.addRow(inspectionHeaders)
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF245745' } }
  sheet.columns.forEach((column, index) => { column.width = [18, 24, 28, 18, 18, 12, 10, 14, 14, 14, 28, 26][index]; column.numFmt = '@' })
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.autoFilter = 'A1:L1'
  sheet.addRow(['', '회수 케이블', '1.5sq / 100m', '', '020101', 'EA', 'A', '10', '8', '2', '피복 손상', 'LOC-실제위치코드'])
  sheet.addRow(['', '손상 케이블', '1.5sq / 100m', '', '020101', 'EA', 'F', '2', '0', '2', '피복 손상', ''])
  return await workbook.xlsx.writeBuffer() as ArrayBuffer
}
export async function parseInspectionFile(bytes: ArrayBuffer): Promise<InspectionImport> {
  if (!bytes.byteLength || bytes.byteLength > 5 * 1024 * 1024) throw new Error('엑셀 파일은 5MB 이하입니다.')
  let expanded = 0, files = 0
  try {
    unzipSync(new Uint8Array(bytes), { filter: (entry) => {
      expanded += entry.originalSize; files += 1
      if (expanded > 64 * 1024 * 1024 || entry.originalSize > 8 * 1024 * 1024 || files > 1000 || /externalLinks|vbaProject|embeddings/i.test(entry.name)) throw new Error('unsafe')
      return false
    } })
  } catch { throw new Error('손상된 파일이거나 압축 해제 크기·외부 링크·매크로 제한을 초과했습니다.') }
  const workbook = new ExcelJS.Workbook()
  try { await workbook.xlsx.load(bytes) } catch { throw new Error('손상되었거나 지원하지 않는 XLSX 파일입니다.') }
  if (workbook.worksheets.length !== 1 || workbook.worksheets[0]?.name !== '1차검수') throw new Error('1차검수 시트 한 개가 필요합니다.')
  const sheet = workbook.worksheets[0]
  if (sheet.rowCount > 1001 || sheet.columnCount > inspectionHeaders.length) throw new Error('검수는 최대 1000행이며 표준 열만 사용할 수 있습니다.')
  const text = (cell: ExcelJS.Cell, code = false) => {
    const value = cell.value
    if (value === null || value === undefined) return ''
    if (typeof value !== 'string' && typeof value !== 'number') throw new Error(`${cell.address}: 수식·링크·날짜·서식 있는 문자열은 사용할 수 없습니다.`)
    if (code && typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 999999) return String(value).padStart(6, '0')
    return String(value).trim()
  }
  if (inspectionHeaders.some((header, index) => text(sheet.getRow(1).getCell(index + 1)) !== header)) throw new Error('표준 템플릿의 열 이름과 순서를 사용해 주세요.')
  const rows: InspectionRow[] = [], errors: InspectionImport['errors'] = []
  for (let line = 2; line <= sheet.rowCount; line++) {
    const cells = sheet.getRow(line)
    let values: string[]
    try { values = inspectionHeaders.map((_, index) => text(cells.getCell(index + 1), index === 0 || index === 4)) }
    catch (error) { errors.push({ row: line, messages: [error instanceof Error ? error.message : '셀 오류'] }); continue }
    if (values.every((value) => !value)) continue
    const [itemId, name, specification, brand, categoryId, unitText, grade, received, usable, disposal, reason, locationId] = values as [string, string, string, string, string, string, string, string, string, string, string, string]
    const unit = Object.entries(inspectionUnits).find(([key, label]) => key === unitText || label === unitText)?.[0] ?? ''
    const row = { ...emptyInspectionRow(), itemId, name, specification, brand, categoryId, unit, grade, received, usable, disposal, reason, locationId } as InspectionRow
    const messages = inspectionRowErrors(row)
    if (messages.length) errors.push({ row: line, messages })
    else rows.push(row)
  }
  if (!rows.length && !errors.length) throw new Error('검수 데이터가 없습니다.')
  return { rows, errors }
}