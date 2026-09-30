import { adminAuthenticatedFetch } from '../adminAuthSession'
import type { MaterialCategory } from '../categories'

type CategoryResponse = { success: true; data: { category: MaterialCategory } } | { success: false; error: { message?: string } }

export async function saveAdminCategory(category: MaterialCategory) {
  const response = await adminAuthenticatedFetch(`/api/admin/categories/${category.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parentId: category.parentId, name: category.name, enabled: category.enabled, order: category.order }),
  })
  const body = await response.json().catch(() => null) as CategoryResponse | null
  if (!response.ok || !body || body.success !== true) {
    throw new Error(body && body.success === false && body.error.message ? body.error.message : '카테고리 저장에 실패했습니다.')
  }
  return body.data.category
}