import { z } from 'zod'
import type { Context, MiddlewareHandler } from 'hono'
import type { Prisma, PrismaClient } from './generated/prisma/client.js'
import { hashPassword, type AuthUser } from './auth.js'
import { customerTransaction } from './customer.js'
import { AppError, ErrorCode, success } from './http.js'

export const adminAccountFields = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30),
  adminRole: z.enum(['SYSTEM_ADMIN', 'ADMIN', 'SALES', 'LOGISTICS']),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  reason: z.string().trim().min(1).max(500),
}).strict()
export const adminAccountCreate = adminAccountFields.extend({
  loginId: z.string().trim().min(3).max(254).regex(/^[a-zA-Z0-9@._-]+$/).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
})
export const adminAccountUpdate = adminAccountFields.extend({
  version: z.number().int().nonnegative(),
  password: z.string().min(8).max(128).optional(),
})
const select = { id: true, email: true, managerName: true, managerPhone: true, adminRole: true, status: true, sessionVersion: true, createdAt: true, updatedAt: true } as const
const conflict = () => new AppError(409, ErrorCode.CONFLICT, '계정 상태가 변경되었거나 아이디가 중복됩니다. 새로고침 후 확인해 주세요.')

export const requireSystemAdmin: MiddlewareHandler = async (context, next) => {
  const user = context.get('authUser') as AuthUser
  if (user.role !== 'ADMIN' || user.adminRole !== 'SYSTEM_ADMIN') throw new AppError(403, ErrorCode.FORBIDDEN, '시스템 관리자만 관리자 계정을 관리할 수 있습니다.')
  await next()
}

export function createAdminAccountRepository(client: PrismaClient) {
  const verifyActor = async (transaction: Prisma.TransactionClient, actor: string) => {
    const user = await transaction.user.findUnique({ where: { id: actor } })
    if (!user || user.role !== 'ADMIN' || user.adminRole !== 'SYSTEM_ADMIN' || user.status !== 'ACTIVE') throw new AppError(403, ErrorCode.FORBIDDEN, '시스템 관리자 권한이 필요합니다.')
  }
  return {
    list: () => client.user.findMany({ where: { role: 'ADMIN' }, select, orderBy: { createdAt: 'desc' } }),
    create: async (input: z.infer<typeof adminAccountCreate>, actor: string) => {
      const passwordHash = await hashPassword(input.password)
      return customerTransaction(client, async (transaction) => {
        await verifyActor(transaction, actor)
        const account = await transaction.user.create({ data: { email: input.loginId, passwordHash, companyName: 'MRS', managerName: input.name, managerPhone: input.phone, role: 'ADMIN', adminRole: input.adminRole, status: input.status, approvedAt: new Date() }, select })
        await transaction.customerChange.create({ data: { actorUserId: actor, targetUserId: account.id, action: 'admin.create', reason: input.reason, changes: { after: { loginId: account.email, name: account.managerName, phone: account.managerPhone, adminRole: account.adminRole, status: account.status } } } })
        return account
      })
    },
    update: async (id: string, input: z.infer<typeof adminAccountUpdate>, actor: string) => {
      const passwordHash = input.password ? await hashPassword(input.password) : undefined
      return customerTransaction(client, async (transaction) => {
        await verifyActor(transaction, actor)
        const before = await transaction.user.findUnique({ where: { id } })
        if (!before || before.role !== 'ADMIN') throw new AppError(404, ErrorCode.NOT_FOUND, '관리자 계정을 찾을 수 없습니다.')
        if (before.sessionVersion !== input.version) throw conflict()
        if (before.adminRole === 'SYSTEM_ADMIN' && before.status === 'ACTIVE' && (input.adminRole !== 'SYSTEM_ADMIN' || input.status !== 'ACTIVE')) {
          const remaining = await transaction.user.count({ where: { role: 'ADMIN', adminRole: 'SYSTEM_ADMIN', status: 'ACTIVE' } })
          if (remaining <= 1) throw new AppError(409, ErrorCode.CONFLICT, '마지막 활성 시스템 관리자는 정지하거나 권한을 해제할 수 없습니다.')
        }
        const account = await transaction.user.update({ where: { id, sessionVersion: input.version }, data: { managerName: input.name, managerPhone: input.phone, adminRole: input.adminRole, status: input.status, passwordHash, sessionVersion: { increment: 1 } }, select })
        await transaction.customerChange.create({ data: { actorUserId: actor, targetUserId: id, action: 'admin.update', reason: input.reason, changes: { before: { name: before.managerName, phone: before.managerPhone, adminRole: before.adminRole, status: before.status }, after: { name: account.managerName, phone: account.managerPhone, adminRole: account.adminRole, status: account.status }, passwordReset: !!passwordHash } } })
        return account
      })
    },
  }
}
export type AdminAccountRepository = ReturnType<typeof createAdminAccountRepository>

export function adminAccountHandlers(repository: AdminAccountRepository) {
  const actor = (context: Context) => (context.get('authUser') as AuthUser).id
  return {
    list: async (context: Context) => success(context, { accounts: await repository.list() }),
    create: async (context: Context) => success(context, { account: await repository.create(adminAccountCreate.parse(await context.req.json()), actor(context)) }, 201),
    update: async (context: Context) => success(context, { account: await repository.update(z.string().uuid().parse(context.req.param('id')), adminAccountUpdate.parse(await context.req.json()), actor(context)) }),
  }
}