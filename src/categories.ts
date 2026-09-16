export type MaterialCategory = { id: string; parentId: string | null; name: string; enabled: boolean; order: number }

export const materialCategories: MaterialCategory[] = [
  { id: 'CAT-001', parentId: null, name: '철강 / 금속', enabled: true, order: 1 },
  { id: 'CAT-002', parentId: 'CAT-001', name: '구조용 강재', enabled: true, order: 1 },
  { id: 'CAT-003', parentId: 'CAT-002', name: '철근', enabled: true, order: 1 },
  { id: 'CAT-004', parentId: 'CAT-002', name: 'H빔', enabled: true, order: 2 },
  { id: 'CAT-005', parentId: 'CAT-001', name: '비철금속', enabled: true, order: 2 },
  { id: 'CAT-006', parentId: 'CAT-005', name: '알루미늄 프레임', enabled: true, order: 1 },
  { id: 'CAT-007', parentId: null, name: '목재 / 합판', enabled: true, order: 2 },
  { id: 'CAT-008', parentId: 'CAT-007', name: '구조목', enabled: true, order: 1 },
  { id: 'CAT-009', parentId: 'CAT-008', name: '참나무 구조목', enabled: true, order: 1 },
  { id: 'CAT-010', parentId: null, name: '배관 / 파이프', enabled: true, order: 3 },
  { id: 'CAT-011', parentId: 'CAT-010', name: '수지 배관', enabled: true, order: 1 },
  { id: 'CAT-012', parentId: 'CAT-011', name: '폴리에틸렌 파이프', enabled: true, order: 1 },
  { id: 'CAT-013', parentId: null, name: '콘크리트 / 시멘트', enabled: true, order: 4 },
  { id: 'CAT-014', parentId: 'CAT-013', name: '콘크리트 제품', enabled: true, order: 1 },
  { id: 'CAT-015', parentId: 'CAT-014', name: '블록', enabled: true, order: 1 },
  { id: 'CAT-016', parentId: 'CAT-014', name: '타일', enabled: true, order: 2 },
  { id: 'CAT-017', parentId: null, name: '기타', enabled: true, order: 5 },
  { id: 'CAT-018', parentId: 'CAT-017', name: '기타 자재', enabled: true, order: 1 },
  { id: 'CAT-019', parentId: 'CAT-018', name: '기타 자재', enabled: true, order: 1 },
]

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
  if (!category.name.trim() || category.name.trim().length > 80) throw new Error('카테고리명은 1~80자로 입력해 주세요.')
  if (!Number.isInteger(category.order) || category.order < 0 || category.order > 9999) throw new Error('노출 순서는 0~9999 사이의 정수로 입력해 주세요.')
  if (categories.some((candidate) => candidate.id !== category.id && candidate.parentId === category.parentId && candidate.name.trim().toLocaleLowerCase('ko-KR') === category.name.trim().toLocaleLowerCase('ko-KR'))) throw new Error('같은 상위 분류에 동일한 이름이 있습니다.')
  const previous = categories.find((candidate) => candidate.id === category.id)
  const next = [...categories.filter((candidate) => candidate.id !== category.id), category]
  if (category.parentId && !categories.some((candidate) => candidate.id === category.parentId)) throw new Error('상위 카테고리를 선택해 주세요.')
  if (next.some((candidate) => { const depth = categoryChain(next, candidate.id).length; return depth < 1 || depth > 3 })) throw new Error('순환 연결 또는 3차를 초과하는 분류는 만들 수 없습니다.')
  if (previous && categoryChain(categories, previous.id).length !== categoryChain(next, category.id).length) throw new Error('기존 카테고리의 차수는 변경할 수 없습니다. 같은 차수 내에서 이동해 주세요.')
  if (category.enabled && category.parentId && !categoryEnabled(next, category.parentId) && !(previous?.enabled && previous.parentId === category.parentId)) throw new Error('사용 중인 상위 분류를 선택하거나 먼저 상위 분류를 활성화해 주세요.')
}

export function validateLeafCategory(categories: MaterialCategory[], id: string, previousId?: string) {
  if (categoryChain(categories, id).length !== 3) throw new Error('카테고리는 3차 분류까지 선택해 주세요.')
  if (id !== previousId && !categoryEnabled(categories, id)) throw new Error('사용 중인 카테고리를 선택해 주세요.')
}