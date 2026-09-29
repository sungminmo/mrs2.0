import { authenticatedFetch } from '../authSession'
import type { MasterItem } from './adminData'

type ItemResponse = { success: true; data: { items: MasterItem[] } } | { success: false; error: { message?: string } }

export async function registerAdminItems(items: MasterItem[]) {
  const response = await authenticatedFetch('/api/admin/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })
  const body = await response.json().catch(() => null) as ItemResponse | null
  if (!response.ok || !body || body.success !== true) {
    throw new Error(body && body.success === false && body.error.message ? body.error.message : '품목 등록에 실패했습니다.')
  }
  return body.data.items
}