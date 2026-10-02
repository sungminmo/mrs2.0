import { randomUUID } from 'node:crypto'
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import { z } from 'zod'
import type { Context } from 'hono'
import type { PrismaClient } from './generated/prisma/client.js'
import type { AuthUser } from './auth.js'
import { customerTransaction } from './customer.js'
import { AppError, ErrorCode, success } from './http.js'

export const imageBucket = 'bucket-mrs'
export const imageOrigin = 'https://bucket-mrs.s3.ap-northeast-2.amazonaws.com'
export const imageMaximum = 5 * 1024 * 1024
const kindSchema = z.enum(['items', 'assets', 'banners', 'inspections'])
export type ImageStorage = { put: (key: string, body: Buffer) => Promise<void>; remove?: (key: string) => Promise<void> }
export function createImageStorage(): ImageStorage {
  const client = new S3Client({ region: 'ap-northeast-2', maxAttempts: 2 })
  return { put: async (key, body) => { await client.send(new PutObjectCommand({ Bucket: imageBucket, Key: key, Body: body, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' }), { abortSignal: AbortSignal.timeout(30000) }) }, remove: async (key) => { await client.send(new DeleteObjectCommand({ Bucket: imageBucket, Key: key }), { abortSignal: AbortSignal.timeout(10000) }) } }
}
export async function prepareImage(file: File): Promise<Buffer> {
  if (!file.size || file.size > imageMaximum || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.name.length > 255) throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'JPG·PNG·WebP 이미지를 5MB 이하로 업로드해 주세요.')
  try {
    const bytes = Buffer.from(await file.arrayBuffer())
    const metadata = await sharp(bytes, { limitInputPixels: 20_000_000 }).metadata()
    const expected = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' }[file.type]
    if (metadata.format !== expected || (metadata.pages ?? 1) > 1) throw new Error('Invalid image')
    const body = await sharp(bytes, { limitInputPixels: 20_000_000 }).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer()
    if (body.length > imageMaximum) throw new Error('Image too large')
    return body
  } catch { throw new AppError(400, ErrorCode.VALIDATION_ERROR, '손상되었거나 지원하지 않는 이미지입니다. 정지 JPG·PNG·WebP 이미지를 선택해 주세요.') }
}
export function publicImageUrl(value: string) {
  try {
    const url = new URL(value)
    return value.length <= 2048 && url.origin === imageOrigin && !url.username && !url.password && !url.search && !url.hash && /^\/(items|assets|banners|inspections)\/.+\.(jpg|jpeg|png|webp)$/i.test(url.pathname) ? url.href : null
  } catch { return null }
}
export function uploadAdminImage(storage: ImageStorage) {
  let active = 0
  return async (context: Context) => {
    if (active >= 2) throw new AppError(429, ErrorCode.RATE_LIMITED, '이미지 업로드가 진행 중입니다. 잠시 후 다시 시도해 주세요.')
    active += 1
    try {
    const kind = kindSchema.parse(context.req.param('kind'))
    let form: FormData
    try { form = await context.req.formData() } catch { throw new AppError(400, ErrorCode.VALIDATION_ERROR, '이미지 파일을 multipart/form-data로 전송해 주세요.') }
    const file = form.get('file')
    if (form.getAll('file').length !== 1 || !(file instanceof File) || !file.size || file.size > imageMaximum || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.name.length > 255) throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'JPG·PNG·WebP 이미지 한 장을 5MB 이하로 업로드해 주세요.')
    const body = await prepareImage(file)
    const id = randomUUID()
    const actor = (context.get('authUser') as AuthUser).id
    const key = `${kind}/${actor}/${id}.webp`
    try { await storage.put(key, body) } catch { throw new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, 'S3 이미지 업로드에 실패했습니다. 서버 IAM 권한과 버킷 설정을 확인해 주세요.') }
    return success(context, { image: { id, name: file.name || `${id}.webp`, url: `${imageOrigin}/${key}` } }, 201)
    } finally { active -= 1 }
  }
}
const image = z.object({ id: z.string().min(1).max(36), name: z.string().min(1).max(255), url: z.string().max(7_000_000) }).strict()
export const replaceImagesSchema = z.object({ images: z.array(image).max(8), expected: z.array(image).max(8), reason: z.string().trim().min(1).max(500) }).strict()
export function createAdminImageRepository(client: PrismaClient) {
  return { replace: (kind: 'items' | 'assets', id: string, input: z.infer<typeof replaceImagesSchema>, actor: string) => customerTransaction(client, async (tx) => {
    const select = { id: true, name: true, url: true } as const
    const record = kind === 'items' ? await tx.masterItem.findUnique({ where: { id }, include: { images: { select, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } } }) : await tx.asset.findUnique({ where: { id }, include: { images: { select, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } } })
    if (!record) throw new AppError(404, ErrorCode.NOT_FOUND, '품목 또는 자산을 찾을 수 없습니다.')
    const normalize = (values: typeof input.images) => values.map(({ id: imageId, name, url }) => ({ id: imageId, name, url }))
    if (JSON.stringify(normalize(record.images)) !== JSON.stringify(normalize(input.expected))) throw new AppError(409, ErrorCode.CONFLICT, '이미지가 변경되었습니다. 새로고침 후 다시 저장해 주세요.')
    for (const entry of input.images) if (!publicImageUrl(entry.url) && !record.images.some((existing) => existing.id === entry.id && existing.name === entry.name && existing.url === entry.url)) throw new AppError(400, ErrorCode.VALIDATION_ERROR, '새 이미지는 S3에 업로드한 주소만 저장할 수 있습니다.')
    const changes = { kind, id, images: { before: record.images, after: input.images } }
    if (kind === 'items') {
      await tx.masterItemImage.deleteMany({ where: { masterItemId: id } })
      if (input.images.length) await tx.masterItemImage.createMany({ data: input.images.map((entry, sortOrder) => ({ ...entry, masterItemId: id, sortOrder })) })
      await tx.masterItem.update({ where: { id }, data: { updatedAt: new Date() } })
    } else {
      await tx.assetImage.deleteMany({ where: { assetId: id } })
      if (input.images.length) await tx.assetImage.createMany({ data: input.images.map((entry, sortOrder) => ({ ...entry, assetId: id, sortOrder })) })
      await tx.asset.update({ where: { id }, data: { updatedAt: new Date() } })
      await tx.assetChange.create({ data: { id: randomUUID(), assetId: id, reason: input.reason, changes: [['자산 이미지', record.images.map((entry) => entry.name).join(', ') || '없음', input.images.map((entry) => entry.name).join(', ') || '없음']] } })
    }
    await tx.customerChange.create({ data: { actorUserId: actor, action: 'image.replace', reason: input.reason, changes } })
    return input.images
  }) }
}
export type AdminImageRepository = ReturnType<typeof createAdminImageRepository>
export function saveAdminImages(repository: AdminImageRepository, kind: 'items' | 'assets') {
  return async (context: Context) => {
    const id = (kind === 'items' ? z.string().regex(/^\d{6}$/) : z.string().regex(/^\d{6}-\d{4}$/)).parse(context.req.param('id'))
    const input = replaceImagesSchema.parse(await context.req.json())
    if (input.images.length > (kind === 'items' ? 1 : 8) || new Set(input.images.map((entry) => entry.id)).size !== input.images.length || new Set(input.images.map((entry) => entry.url)).size !== input.images.length) throw new AppError(400, ErrorCode.VALIDATION_ERROR, '이미지 개수 또는 중복을 확인해 주세요.')
    return success(context, { images: await repository.replace(kind, id, input, (context.get('authUser') as AuthUser).id) })
  }
}