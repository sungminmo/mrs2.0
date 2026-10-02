import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { Context } from 'hono'
import type { PrismaClient } from './generated/prisma/client.js'
import type { AuthUser } from './auth.js'
import { customerTransaction } from './customer.js'
import { AppError, ErrorCode, success } from './http.js'
import { inspectionListQuery, inspectionReason } from './inspection.js'

export const locationInput = z.object({ name: z.string().trim().min(1).max(80), zone: z.string().trim().min(1).max(80), enabled: z.boolean(), reason: inspectionReason }).strict()
export const locationUpdate = locationInput.extend({ version: z.number().int().min(0) })
export const locationQuery = inspectionListQuery.extend({ enabled: z.enum(['true', 'false']).optional() })
export function createLocationRepository(client: PrismaClient) {
  return {
    list: async (query: z.infer<typeof locationQuery>) => {
      const where = { ...(query.q ? { OR: [{ id: { contains: query.q } }, { name: { contains: query.q } }, { zone: { contains: query.q } }] } : {}), ...(query.enabled ? { enabled: query.enabled === 'true' } : {}) }
      const [locations, total] = await client.$transaction([client.location.findMany({ where, skip: (query.page - 1) * query.size, take: query.size, orderBy: { id: 'asc' }, include: { _count: { select: { assets: { where: { storageStatus: 'STORED', quantity: { gt: 0 } } } } } } }), client.location.count({ where })])
      return { locations: locations.map(({ _count, ...entry }) => ({ ...entry, assetCount: _count.assets })), pagination: { page: query.page, rows: query.size, total } }
    },
    save: (id: string | null, input: z.infer<typeof locationInput> & { version?: number }, user: AuthUser) => customerTransaction(client, async (tx) => {
      const actor = await tx.user.findUnique({ where: { id: user.id } })
      if (!actor || actor.role !== 'ADMIN' || actor.status !== 'ACTIVE' || actor.sessionVersion !== (user.sessionVersion ?? 0)) throw new AppError(403, ErrorCode.FORBIDDEN, '활성 관리자 권한이 필요합니다.')
      if (id) {
        const changed = await tx.location.updateMany({ where: { id, version: input.version }, data: { name: input.name, zone: input.zone, enabled: input.enabled, version: { increment: 1 } } })
        if (changed.count !== 1) throw new AppError(409, ErrorCode.CONFLICT, '위치 정보가 변경되었습니다. 새로고침해 주세요.')
      } else id = (await tx.location.create({ data: { id: `LOC-${randomBytes(8).toString('hex')}`, name: input.name, zone: input.zone, enabled: input.enabled } })).id
      await tx.customerChange.create({ data: { actorUserId: actor.id, action: 'location.save', reason: input.reason, changes: { id, name: input.name, zone: input.zone, enabled: input.enabled } } })
      return tx.location.findUniqueOrThrow({ where: { id } })
    }),
  }
}
export type LocationRepository = ReturnType<typeof createLocationRepository>
export function locationHandlers(repository: LocationRepository) {
  return {
    list: async (context: Context) => { context.header('Cache-Control', 'no-store'); return success(context, await repository.list(locationQuery.parse(context.req.query()))) },
    save: (update: boolean) => async (context: Context) => { context.header('Cache-Control', 'no-store'); return success(context, { location: await repository.save(update ? z.string().min(1).max(20).parse(context.req.param('id')) : null, (update ? locationUpdate : locationInput).parse(await context.req.json()), context.get('authUser') as AuthUser) }, update ? 200 : 201) },
  }
}