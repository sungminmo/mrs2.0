import { adminAccountRequest } from '../adminAuthSession'
import type { AdminImage } from './adminData'

export async function uploadImage(file: File, kind: 'items' | 'assets' | 'banners', signal?: AbortSignal): Promise<AdminImage> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) throw new Error('JPG·PNG·WebP 이미지를 파일당 5MB 이하로 선택해 주세요.')
  const body = new FormData()
  body.append('file', file)
  const result = await adminAccountRequest<{ image: AdminImage }>(`/api/admin/images/${kind}`, { method: 'POST', body, signal })
  return result.image
}
export async function saveImages(kind: 'items' | 'assets', id: string, images: AdminImage[], expected: AdminImage[], reason: string) {
  return (await adminAccountRequest<{ images: AdminImage[] }>(`/api/admin/${kind}/${id}/images`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images, expected, reason }) })).images
}