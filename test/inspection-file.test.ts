import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs'
import { zipSync } from 'fflate'
import { inspectionHeaders, inspectionTemplate, parseInspectionFile } from '../src/admin/inspectionFile.ts'

test('XLSX template preserves codes, optional item and F rows', async () => {
  const parsed = await parseInspectionFile(await inspectionTemplate())
  assert.equal(parsed.rows.length, 2)
  assert.equal(parsed.rows[0]!.itemId, '')
  assert.equal(parsed.rows[0]!.categoryId, '020101')
  assert.equal(parsed.rows[1]!.grade, 'F')
  assert.deepEqual(parsed.errors, [])
})
test('XLSX import reports invalid balances and rejects formulas, headers and corrupt input', async () => {
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet('1차검수')
  sheet.addRow(inspectionHeaders)
  sheet.addRow([1, '자산', '규격', '', 10101, 'M', 'A', '1.1', '0.7', '0.3', '손상', 'LOC-01'])
  sheet.addRow(['', { formula: '1+1' }, '', '', '', '', '', '', '', '', '', ''])
  const parsed = await parseInspectionFile(await workbook.xlsx.writeBuffer() as ArrayBuffer)
  assert.equal(parsed.rows[0]!.itemId, '000001')
  assert.equal(parsed.rows[0]!.categoryId, '010101')
  assert.equal(parsed.errors.length, 2)
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