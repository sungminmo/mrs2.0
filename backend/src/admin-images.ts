import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { Context } from 'hono'
import type { AuthUser } from './auth.js'
import type { PrismaClient } from './generated/prisma/client.js'
import { customerTransaction } from './customer.js'
import { AppError, ErrorCode, success } from './http.js'
import { imageSource, storageImage } from './image-source.js'

const storedImage = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(255), url: z.string().max(4_200_000).refine((value) => imageSource(value) !== null, '허용되지 않은 이미지 주소입니다.') }).strict()
export const imageUpdateSchema = z.object({
  images: z.array(storedImage.extend({ url: z.string().max(2048).refine((value) => storageImage(value) !== null, 'bucket-mrs의 items 또는 assets JPG·PNG·WebP 주소를 입력해 주세요.') })).max(8),
  expected: z.array(storedImage.extend({ url: z.string().max(4_200_000) })).max(8),
  reason: z.string().trim().min(1).max(500),
}).strict()
type ImageUpdate = z.infer<typeof imageUpdateSchema>
export type ImageKind = 'items' | 'assets'
const imageSelect = { id: true, name: true, url: true } as const

export function createAdminImageRepository(client: PrismaClient) {
  return {
    replace: (kind: ImageKind, id: string, input: ImageUpdate, actor: string) => customerTransaction(client, async (transaction) => {
      const record = kind === 'items'
        ? await transaction.masterItem.findUnique({ where: { id }, include: { images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: imageSelect } } })
        : await transaction.asset.findUnique({ where: { id }, include: { images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: imageSelect } } })
      if (!record) throw new AppError(404, ErrorCode.NOT_FOUND, '품목 또는 자산을 찾을 수 없습니다.')
      const normalize = (images: ImageUpdate['expected']) => images.map(({ id: imageId, name, url }) => ({ id: imageId, name, url }))
      if (JSON.stringify(normalize(record.images)) !== JSON.stringify(normalize(input.expected))) throw new AppError(409, ErrorCode.CONFLICT, '이미지가 변경되었습니다. 새로고침 후 다시 저장해 주세요.')
      const changes = { kind, id, images: { before: record.images, after: input.images } }
      if (kind === 'items') {
        await transaction.masterItemImage.deleteMany({ where: { masterItemId: id } })
        if (input.images.length) await transaction.masterItemImage.createMany({ data: input.images.map((image, sortOrder) => ({ ...image, masterItemId: id, sortOrder })) })
        await transaction.masterItem.update({ where: { id }, data: { updatedAt: new Date() } })
      } else {
        await transaction.assetImage.deleteMany({ where: { assetId: id } })
        if (input.images.length) await transaction.assetImage.createMany({ data: input.images.map((image, sortOrder) => ({ ...image, assetId: id, sortOrder })) })
        await transaction.asset.update({ where: { id }, data: { updatedAt: new Date() } })
        await transaction.assetChange.create({ data: { id: randomUUID(), assetId: id, reason: input.reason, changes } })
      }
      await transaction.customerChange.create({ data: { actorUserId: actor, action: 'image.replace', reason: input.reason, changes } })
      return input.images
    }),
  }
}
export type AdminImageRepository = ReturnType<typeof createAdminImageRepository>

export function saveAdminImages(repository: AdminImageRepository, kind: ImageKind) {
  return async (context: Context) => {
    const id = (kind === 'items' ? z.string().regex(/^\d{6}$/) : z.string().regex(/^\d{6}-\d{4}$/)).parse(context.req.param('id'))
    const input = imageUpdateSchema.parse(await context.req.json())
    if (kind === 'items' && input.images.length > 1) throw new AppError(400, ErrorCode.VALIDATION_ERROR, '품목 대표 이미지는 1장만 등록할 수 있습니다.')
    if (new Set(input.images.map((image) => image.id)).size !== input.images.length || new Set(input.images.map((image) => image.url)).size !== input.images.length) throw new AppError(400, ErrorCode.VALIDATION_ERROR, '중복 이미지입니다.')
    return success(context, { images: await repository.replace(kind, id, input, (context.get('authUser') as AuthUser).id) })
  }
}