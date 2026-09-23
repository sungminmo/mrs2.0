import { z } from 'zod'
import { AppError, ErrorCode, success } from './http.js'
import type { Context } from 'hono'

export type BannerRecord = {
  id: string
  desktopImageUrl: string
  mobileImageUrl: string
  linkUrl: string | null
  enabled: boolean
  startsAt: Date | null
  endsAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type BannerInput = Omit<BannerRecord, 'id' | 'createdAt' | 'updatedAt'>

export type BannerRepository = {
  list: () => Promise<BannerRecord[]>
  findByIds: (ids: string[]) => Promise<BannerRecord[]>
  upsert: (id: string, input: BannerInput) => Promise<BannerRecord>
}

const bannerId = z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, 'Banner ID may contain letters, numbers, dots, underscores, colons, and hyphens')
const imageSource = z.string().trim().min(1).max(7_000_000).refine((value) => /^https?:\/\//i.test(value) || value.startsWith('/') || /^data:image\/(?:jpeg|png|webp);base64,/i.test(value), 'Image must be an HTTP URL, root-relative path, or JPG/PNG/WebP upload')
const destination = z.string().trim().max(2048).refine((value) => !value || /^https?:\/\//i.test(value) || value.startsWith('/') || value.startsWith('#'), 'Link must be an HTTP URL, root-relative path, or hash route')
const optionalDate = z.union([z.iso.datetime({ offset: true }), z.literal(''), z.null()]).transform((value) => value ? new Date(value) : null)

const bannerInput = z.object({
  desktopImageUrl: imageSource,
  mobileImageUrl: imageSource,
  linkUrl: destination.transform((value) => value || null),
  enabled: z.boolean(),
  startsAt: optionalDate,
  endsAt: optionalDate,
}).superRefine((value, context) => {
  if (value.startsAt && value.endsAt && value.startsAt >= value.endsAt) {
    context.addIssue({ code: 'custom', path: ['endsAt'], message: 'End time must be later than start time' })
  }
})

function payload(record: BannerRecord) {
  return {
    ...record,
    startsAt: record.startsAt?.toISOString() ?? null,
    endsAt: record.endsAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}

export function listPublicBanners(repository: BannerRepository) {
  return async (context: Context) => {
    const ids = z.string().min(1).transform((value) => [...new Set(value.split(',').map((id) => bannerId.parse(id.trim())))]).pipe(z.array(bannerId).max(20)).parse(context.req.query('ids'))
    const now = new Date()
    const records = (await repository.findByIds(ids)).filter((banner) => banner.enabled && (!banner.startsAt || banner.startsAt <= now) && (!banner.endsAt || banner.endsAt > now))
    context.header('Cache-Control', 'no-store')
    return success(context, { banners: records.map(payload) })
  }
}

export function listAdminBanners(repository: BannerRepository) {
  return async (context: Context) => {
    context.header('Cache-Control', 'no-store')
    return success(context, { banners: (await repository.list()).map(payload) })
  }
}

export function saveBanner(repository: BannerRepository) {
  return async (context: Context) => {
    const id = bannerId.parse(context.req.param('id'))
    const input = bannerInput.parse(await context.req.json())
    try {
      return success(context, { banner: payload(await repository.upsert(id, input)) })
    } catch {
      throw new AppError(409, ErrorCode.CONFLICT, 'Banner could not be saved')
    }
  }
}