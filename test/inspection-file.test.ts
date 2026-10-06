import { appraisalMoney, appraisalTotal } from '../src/appraisal'
import { detailedInspectionStatus, saleInspectionReady } from '../src/admin/adminMarket'
import { inventory, saleRequests } from '../src/admin/adminData'

test('detailed inspection requires registered fields and matching quantity; zero appraisal is registered', () => {
  const asset = { ...inventory[0]!, itemId: '032203', category: '030400', specification: '3회로', brand: '뉴원', grade: 'S' as const, quantity: 1, appraisal: 0, status: '보관중' as const, saleStatus: '판매대기' as const }
  const request = { ...saleRequests[0]!, quantity: 1 }
  assert.equal(saleInspectionReady(asset, request), true)
  for (const fields of [{ itemId: null }, { category: '' }, { specification: ' ' }, { brand: ' ' }, { appraisal: null }, { grade: 'F' as const }, { status: '출고완료' as const }]) assert.equal(saleInspectionReady({ ...asset, ...fields }, request), false)
  assert.equal(saleInspectionReady(asset, { ...request, quantity: 2 }), false)
  assert.equal(detailedInspectionStatus({ ...request, inspection: '판매용 정밀 검수 완료' }), '상세 검수 완료')
})

test('appraisal totals preserve decimal quantities, large values, zero and missing prices', () => {
  assert.equal(appraisalTotal('725', '2.5'), '1812.5')
  assert.equal(appraisalMoney(appraisalTotal('725', '2.5')), '1,812.5원')
  assert.equal(appraisalTotal('1000000000000', '999999999.999'), '999999999999000000000')
  assert.equal(appraisalTotal(null, '5'), null)
  assert.equal(appraisalTotal('0', '5'), '0')
})
import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs'
import { zipSync } from 'fflate'
import { inspectionHeaders, inspectionTemplate, parseInspectionFile } from '../src/admin/inspectionFile.ts'
import { emptyInspectionRow } from '../src/inspections.ts'

test('XLSX import and manual rows work without randomUUID in HTTP environments', async () => {
  const bytes = await inspectionTemplate()
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto')!
  const getRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto)
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues } })
  try {
    const parsed = await parseInspectionFile(bytes)
    assert.equal(parsed.rows.length, 2)
    assert.deepEqual(parsed.errors, [])
    const ids = [...parsed.rows.map((row) => row.id), ...Array.from({ length: 1000 }, () => emptyInspectionRow().id)]
    assert.equal(new Set(ids).size, ids.length)
    for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  } finally {
    Object.defineProperty(globalThis, 'crypto', original)
  }
})
test('XLSX template preserves codes, optional item and F rows', async () => {
  const parsed = await parseInspectionFile(await inspectionTemplate())
  assert.equal(parsed.rows.length, 2)
  assert.equal(parsed.rows[0]!.itemId, '')
  assert.equal(parsed.rows[0]!.categoryId, '020101')
  assert.equal(parsed.rows[1]!.grade, 'F')
  assert.deepEqual(parsed.errors, [])
})
test('XLSX accepts empty specification and category but validates supplied category codes', async () => {
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet('1차검수')
  sheet.addRow(inspectionHeaders)
  sheet.addRow(['', '미분류 자산', '', '', '', 'EA', 'A', '1', '1', '0', '', 'LOC-01'])
  const parsed = await parseInspectionFile(await workbook.xlsx.writeBuffer() as ArrayBuffer)
  assert.deepEqual(parsed.errors, [])
  assert.equal(parsed.rows[0]!.specification, '')
  assert.equal(parsed.rows[0]!.categoryId, '')
  sheet.getRow(2).getCell(5).value = 'invalid'
  const invalid = await parseInspectionFile(await workbook.xlsx.writeBuffer() as ArrayBuffer)
  assert.equal(invalid.rows.length, 0)
  assert.match(invalid.errors[0]!.messages.join(','), /카테고리/)
})
test('XLSX import reports invalid balances and rejects formulas, headers and corrupt input', async () => {
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet('1차검수')
  sheet.addRow(inspectionHeaders)
  sheet.addRow([1, '정상 자산', '', '', 10101, 'M', 'A', '1.1', '0.7', '0.4', '손상', 'LOC-01'])
  sheet.addRow([1, '자산', '규격', '', 10101, 'M', 'A', '1.1', '0.7', '0.3', '손상', 'LOC-01'])
  sheet.addRow(['', { formula: '1+1' }, '', '', '', '', '', '', '', '', '', ''])
  const parsed = await parseInspectionFile(await workbook.xlsx.writeBuffer() as ArrayBuffer)
  assert.equal(parsed.rows.length, 1)
  assert.equal(parsed.rows[0]!.name, '정상 자산')
  assert.equal(parsed.rows[0]!.itemId, '000001')
  assert.equal(parsed.rows[0]!.categoryId, '010101')
  assert.equal(parsed.errors.length, 2)
  assert.deepEqual(parsed.errors.map((entry) => entry.row), [3, 4])
  sheet.getRow(1).getCell(1).value = '잘못된 열'
  await assert.rejects(parseInspectionFile(await workbook.xlsx.writeBuffer() as ArrayBuffer), /열 이름/)
  await assert.rejects(parseInspectionFile(new ArrayBuffer(30)), /손상/)
})
test('XLSX rejects oversized sheets, external-link archives and expansion bombs', async () => {
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet('1차검수')
  sheet.addRow(inspectionHeaders); sheet.getRow(1002).getCell(1).value = 'too many'
  await assert.rejects(parseInspectionFile(await workbook.xlsx.writeBuffer() as ArrayBuffer), /1000행/)
  for (const archive of [zipSync({ 'xl/externalLinks/externalLink1.xml': new Uint8Array(1) }), zipSync({ 'xl/worksheets/sheet1.xml': new Uint8Array(9 * 1024 * 1024) })]) await assert.rejects(parseInspectionFile(archive.buffer as ArrayBuffer), /압축 해제 크기·외부 링크/)
})