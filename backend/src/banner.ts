import { z } from 'zod'
import { AppError, ErrorCode, success } from './http.js'
import type { Context } from 'hono'

export type BannerItemRecord = {
  id: string
  placementId: string
  desktopImageUrl: string
  mobileImageUrl: string
  linkUrl: string | null
  enabled: boolean
  sortOrder: number
  startsAt: Date | null
  endsAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type BannerPlacementRecord = {
  id: string
  name: string
  enabled: boolean
  items: BannerItemRecord[]
  createdAt: Date
  updatedAt: Date
}

export type BannerItemInput = Omit<BannerItemRecord, 'placementId' | 'createdAt' | 'updatedAt'>
export type BannerPlacementInput = Pick<BannerPlacementRecord, 'name' | 'enabled'> & { items: BannerItemInput[] }

export type BannerRepository = {
  list: () => Promise<BannerPlacementRecord[]>
  findByIds: (ids: string[]) => Promise<BannerPlacementRecord[]>
  replace: (id: string, input: BannerPlacementInput) => Promise<BannerPlacementRecord>
}

const placementId = z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, 'Placement ID may contain letters, numbers, dots, underscores, colons, and hyphens')
const imageSource = z.string().trim().min(1).max(7_000_000).refine((value) => /^https?:\/\//i.test(value) || value.startsWith('/') || /^data:image\/(?:jpeg|png|webp);base64,/i.test(value), 'Image must be an HTTP URL, root-relative path, or JPG/PNG/WebP upload')
const destination = z.string().trim().max(2048).refine((value) => !value || /^https?:\/\//i.test(value) || value.startsWith('/') || value.startsWith('#'), 'Link must be an HTTP URL, root-relative path, or hash route')
const optionalDate = z.union([z.iso.datetime({ offset: true }), z.literal(''), z.null()]).transform((value) => value ? new Date(value) : null)

const bannerItemInput = z.object({
  id: z.uuid(),
  desktopImageUrl: imageSource,
  mobileImageUrl: imageSource,
  linkUrl: destination.transform((value) => value || null),
  enabled: z.boolean(),
  sortOrder: z.number().int().min(0).max(9999),
  startsAt: optionalDate,
  endsAt: optionalDate,
}).superRefine((value, context) => {
  if (value.startsAt && value.endsAt && value.startsAt >= value.endsAt) context.addIssue({ code: 'custom', path: ['endsAt'], message: 'End time must be later than start time' })
})

const placementInput = z.object({
  name: z.string().trim().min(1).max(120),
  enabled: z.boolean(),
  items: z.array(bannerItemInput).max(30),
})

function itemPayload(record: BannerItemRecord) {
  return { ...record, startsAt: record.startsAt?.toISOString() ?? null, endsAt: record.endsAt?.toISOString() ?? null, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() }
}

function placementPayload(record: BannerPlacementRecord, items = record.items) {
  return { ...record, items: items.map(itemPayload), createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() }
}

export function listPublicBanners(repository: BannerRepository) {
  return async (context: Context) => {
    const ids = z.string().min(1).transform((value) => [...new Set(value.split(',').map((id) => placementId.parse(id.trim())))]).pipe(z.array(placementId).max(20)).parse(context.req.query('placements'))
    const now = new Date()
    const placements = (await repository.findByIds(ids)).filter((placement) => placement.enabled).map((placement) => placementPayload(placement, placement.items.filter((item) => item.enabled && (!item.startsAt || item.startsAt <= now) && (!item.endsAt || item.endsAt > now)).sort((first, second) => first.sortOrder - second.sortOrder)))
    context.header('Cache-Control', 'no-store')
    return success(context, { placements })
  }
}

export function listAdminBanners(repository: BannerRepository) {
  return async (context: Context) => {
    context.header('Cache-Control', 'no-store')
    return success(context, { placements: (await repository.list()).map((placement) => placementPayload(placement, [...placement.items].sort((first, second) => first.sortOrder - second.sortOrder))) })
  }
}

export function saveBanner(repository: BannerRepository) {
  return async (context: Context) => {
    const id = placementId.parse(context.req.param('id'))
    const input = placementInput.parse(await context.req.json())
    try {
      return success(context, { placement: placementPayload(await repository.replace(id, input)) })
    } catch {
      throw new AppError(409, ErrorCode.CONFLICT, 'Banner placement could not be saved')
    }
  }
}