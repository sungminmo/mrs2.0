import test from 'node:test'
import assert from 'node:assert/strict'
import { categoryChain, categoryChildren, categoryEnabled, categoryMatches, categoryPath, materialCategories, validateCategory, validateLeafCategory } from '../src/categories.ts'

test('seed categories have valid unique IDs and at most three levels', () => {
  assert.equal(new Set(materialCategories.map((category) => category.id)).size, materialCategories.length)
  for (const category of materialCategories) {
    assert.ok(categoryChain(materialCategories, category.id).length <= 3)
    assert.doesNotThrow(() => validateCategory(category, materialCategories))
  }
  assert.equal(categoryChain(materialCategories, 'CAT-009').length, 3)
  assert.equal(categoryPath(materialCategories, 'CAT-009'), '목재 / 합판 > 구조목 > 참나무 구조목')
})

test('ancestor filtering and renaming preserve stable leaf connections', () => {
  const renamed = materialCategories.map((category) => category.id === 'CAT-007' ? { ...category, name: '목재 자재' } : category)
  assert.equal(categoryMatches(renamed, 'CAT-009', 'CAT-007'), true)
  assert.equal(categoryMatches(renamed, 'CAT-009', 'CAT-008'), true)
  assert.equal(categoryMatches(renamed, 'CAT-009', 'CAT-009'), true)
  assert.equal(categoryMatches(renamed, 'CAT-009', 'CAT-010'), false)
  assert.equal(categoryPath(renamed, 'CAT-009'), '목재 자재 > 구조목 > 참나무 구조목')
})

test('three levels required for records, inactive ancestors block new links only', () => {
  const inactive = materialCategories.map((category) => category.id === 'CAT-007' ? { ...category, enabled: false } : category)
  assert.equal(categoryEnabled(inactive, 'CAT-009'), false)
  assert.throws(() => validateLeafCategory(inactive, 'CAT-009'))
  assert.doesNotThrow(() => validateLeafCategory(inactive, 'CAT-009', 'CAT-009'))
  assert.throws(() => validateLeafCategory(materialCategories, 'CAT-007'))
  assert.throws(() => validateLeafCategory(materialCategories, 'CAT-008'))
  assert.throws(() => validateLeafCategory(materialCategories, 'missing'))
  assert.equal(categoryEnabled(materialCategories, 'missing'), false)
})

test('reject duplicate sibling names, cycles, invalid parents, fourth level and depth changes', () => {
  const root = materialCategories[0]
  assert.throws(() => validateCategory({ ...root, id: 'CAT-100' }, materialCategories))
  assert.throws(() => validateCategory({ ...root, parentId: 'CAT-003' }, materialCategories))
  assert.throws(() => validateCategory({ ...root, id: 'CAT-100', parentId: 'CAT-003' }, materialCategories))
  assert.throws(() => validateCategory({ ...root, id: 'CAT-100', parentId: 'missing' }, materialCategories))
  assert.throws(() => validateCategory({ ...materialCategories[2], parentId: null }, materialCategories))
  assert.throws(() => validateCategory({ ...root, name: '  ' }, materialCategories))
  assert.throws(() => validateCategory({ ...root, order: -1 }, materialCategories))
  assert.throws(() => validateCategory({ ...root, order: 0.5 }, materialCategories))
})

test('same-depth moves preserve descendants and update ancestor filtering', () => {
  const moved = { ...materialCategories.find((category) => category.id === 'CAT-008'), parentId: 'CAT-017' }
  assert.doesNotThrow(() => validateCategory(moved, materialCategories))
  const categories = materialCategories.map((category) => category.id === moved.id ? moved : category)
  assert.equal(categoryChain(categories, 'CAT-009').length, 3)
  assert.equal(categoryMatches(categories, 'CAT-009', 'CAT-007'), false)
  assert.equal(categoryMatches(categories, 'CAT-009', 'CAT-017'), true)
})

test('inactive child can be renamed but cannot be newly activated under inactive parent', () => {
  const categories = materialCategories.map((category) => category.id === 'CAT-007' ? { ...category, enabled: false } : category)
  const child = categories.find((category) => category.id === 'CAT-008')
  assert.doesNotThrow(() => validateCategory({ ...child, name: '구조용 목재' }, categories))
  const disabled = categories.map((category) => category.id === child.id ? { ...category, enabled: false } : category)
  assert.throws(() => validateCategory({ ...child, enabled: true }, disabled))
})

test('sibling ordering is numeric and stable; malformed cycles do not loop', () => {
  const categories = materialCategories.map((category) => category.id === 'CAT-004' ? { ...category, order: 0 } : category)
  assert.equal(categoryChildren(categories, 'CAT-002')[0].id, 'CAT-004')
  const cyclic = [{ id: 'A', parentId: 'B' }, { id: 'B', parentId: 'A' }]
  assert.deepEqual(categoryChain(cyclic, 'A'), [])
})