export type MaterialCategory = { id: string; parentId: string | null; name: string; enabled: boolean; order: number }

export const materialCategories: MaterialCategory[] = [
  { id: '010000', parentId: null, name: '배관자재(전기)', enabled: true, order: 1 },
  { id: '010100', parentId: '010000', name: '트레이', enabled: true, order: 1 },
  { id: '010200', parentId: '010000', name: '닥트', enabled: true, order: 2 },
  { id: '010300', parentId: '010000', name: '시스템찬넬', enabled: true, order: 3 },
  { id: '010400', parentId: '010000', name: '후렉시블', enabled: true, order: 4 },
  { id: '010401', parentId: '010400', name: '방수형', enabled: true, order: 1 },
  { id: '010402', parentId: '010400', name: '비방수형', enabled: true, order: 2 },
  { id: '020000', parentId: null, name: '케이블', enabled: true, order: 2 },
  { id: '020100', parentId: '020000', name: '전선', enabled: true, order: 1 },
  { id: '020101', parentId: '020100', name: '일반전선', enabled: true, order: 1 },
  { id: '020102', parentId: '020100', name: '삼사전선', enabled: true, order: 2 },
  { id: '020103', parentId: '020100', name: '기타전선', enabled: true, order: 3 },
  { id: '020200', parentId: '020000', name: '강전CABLE', enabled: true, order: 2 },
  { id: '020300', parentId: '020000', name: '제어CABLE', enabled: true, order: 3 },
  { id: '020400', parentId: '020000', name: '통신CABLE', enabled: true, order: 4 },
  { id: '020500', parentId: '020000', name: '배선부속재', enabled: true, order: 5 },
  { id: '030000', parentId: null, name: '전기기구', enabled: true, order: 3 },
  { id: '030100', parentId: '030000', name: '배선기구', enabled: true, order: 1 },
  { id: '030101', parentId: '030100', name: '매입콘센트', enabled: true, order: 1 },
  { id: '030102', parentId: '030100', name: '스위치', enabled: true, order: 2 },
  { id: '030200', parentId: '030000', name: '조명기구', enabled: true, order: 2 },
  { id: '030300', parentId: '030000', name: '차단기, M/C', enabled: true, order: 3 },
  { id: '030400', parentId: '030000', name: '배전함', enabled: true, order: 4 },
  { id: '030500', parentId: '030000', name: '기타기구', enabled: true, order: 5 },
]

export const categoryCodePattern = /^\d{6}$/

export function nextCategoryCode(categories: MaterialCategory[], parentId: string | null) {
  const parent = parentId ? categories.find((category) => category.id === parentId) : undefined
  const depth = parent ? categoryChain(categories, parent.id).length + 1 : 1
  const siblings = categoryChildren(categories, parentId)
  const segmentStart = (depth - 1) * 2
  const highest = siblings.reduce((value, category) => Math.max(value, Number(category.id.slice(segmentStart, segmentStart + 2))), 0)
  if (highest >= 99) throw new Error(`${depth}차 카테고리 코드를 더 이상 생성할 수 없습니다.`)
  const segment = String(highest + 1).padStart(2, '0')
  if (depth === 1) return `${segment}0000`
  if (depth === 2) return `${parent!.id.slice(0, 2)}${segment}00`
  if (depth === 3) return `${parent!.id.slice(0, 4)}${segment}`
  throw new Error('카테고리는 최대 3차까지 생성할 수 있습니다.')
}

export function categoryChain(categories: MaterialCategory[], id: string): MaterialCategory[] {
  const chain: MaterialCategory[] = []
  const seen = new Set<string>()
  let current = categories.find((category) => category.id === id)
  while (current) {
    if (seen.has(current.id)) return []
    seen.add(current.id)
    chain.unshift(current)
    if (!current.parentId) return chain
    current = categories.find((category) => category.id === current!.parentId)
  }
  return []
}

export const categoryPath = (categories: MaterialCategory[], id: string) => categoryChain(categories, id).map((category) => category.name).join(' > ') || '미등록 분류'
export const categoryEnabled = (categories: MaterialCategory[], id: string) => {
  const chain = categoryChain(categories, id)
  return chain.length > 0 && chain.every((category) => category.enabled)
}
export const categoryMatches = (categories: MaterialCategory[], leafId: string, selectedId: string) => !selectedId || categoryChain(categories, leafId).some((category) => category.id === selectedId)
export const categoryChildren = (categories: MaterialCategory[], parentId: string | null) => categories.filter((category) => category.parentId === parentId).sort((first, second) => first.order - second.order || first.name.localeCompare(second.name, 'ko') || first.id.localeCompare(second.id))

export function validateCategory(category: MaterialCategory, categories: MaterialCategory[]) {
  if (!categoryCodePattern.test(category.id)) throw new Error('카테고리 코드는 6자리 숫자여야 합니다.')
  if (!category.name.trim() || category.name.trim().length > 80) throw new Error('카테고리명은 1~80자로 입력해 주세요.')
  if (!Number.isInteger(category.order) || category.order < 0 || category.order > 9999) throw new Error('노출 순서는 0~9999 사이의 정수로 입력해 주세요.')
  if (categories.some((candidate) => candidate.id !== category.id && candidate.parentId === category.parentId && candidate.name.trim().toLocaleLowerCase('ko-KR') === category.name.trim().toLocaleLowerCase('ko-KR'))) throw new Error('같은 상위 분류에 동일한 이름이 있습니다.')
  const previous = categories.find((candidate) => candidate.id === category.id)
  const next = [...categories.filter((candidate) => candidate.id !== category.id), category]
  if (category.parentId && !categories.some((candidate) => candidate.id === category.parentId)) throw new Error('상위 카테고리를 선택해 주세요.')
  if (next.some((candidate) => { const depth = categoryChain(next, candidate.id).length; return depth < 1 || depth > 3 })) throw new Error('순환 연결 또는 3차를 초과하는 분류는 만들 수 없습니다.')
  if (previous && previous.parentId !== category.parentId) throw new Error('카테고리 코드가 상위 분류를 포함하므로 등록 후 상위 분류를 변경할 수 없습니다.')
  const chain = categoryChain(next, category.id)
  if (chain.length === 1 && !category.id.endsWith('0000')) throw new Error('대분류 코드는 뒤 4자리가 0000이어야 합니다.')
  if (chain.length === 2 && (category.id.slice(0, 2) !== chain[0]!.id.slice(0, 2) || !category.id.endsWith('00'))) throw new Error('중분류 코드는 상위 대분류 코드와 뒤 2자리 00을 포함해야 합니다.')
  if (chain.length === 3 && category.id.slice(0, 4) !== chain[1]!.id.slice(0, 4)) throw new Error('소분류 코드는 상위 대·중분류 코드를 포함해야 합니다.')
  if (category.enabled && category.parentId && !categoryEnabled(next, category.parentId) && !(previous?.enabled && previous.parentId === category.parentId)) throw new Error('사용 중인 상위 분류를 선택하거나 먼저 상위 분류를 활성화해 주세요.')
}

export function validateLeafCategory(categories: MaterialCategory[], id: string, previousId?: string) {
  if (!categoryChain(categories, id).length || categoryChildren(categories, id).length) throw new Error('카테고리는 최종 분류까지 선택해 주세요.')
  if (id !== previousId && !categoryEnabled(categories, id)) throw new Error('사용 중인 카테고리를 선택해 주세요.')
}