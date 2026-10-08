import { adminListQuery, listPaging, listPagination, type AdminListQuery } from './admin-pagination.js'
import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { Context } from 'hono'
import type { Prisma, PrismaClient } from './generated/prisma/client.js'
import type { AuthRepository, AuthUser, RegistrationInput } from './auth.js'
import { AppError, ErrorCode, success } from './http.js'

export const businessNumberSchema = z.string().trim().regex(/^(\d{10}|\d{3}-\d{2}-\d{5})$/)
  .transform((value) => value.replaceAll('-', ''))
  .refine((value) => {
    const digits = [...value].map(Number)
    const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5]
    const sum = weights.reduce((total, weight, index) => total + weight * (digits[index] ?? 0), 0) + Math.floor((digits[8] ?? 0) * 5 / 10)
    return !/^0+$/.test(value) && (10 - sum % 10) % 10 === digits[9]
  }, '사업자등록번호를 확인해 주세요.')

export const customerFieldsSchema = z.object({
  name: z.string().trim().min(1).max(160),
  businessNumber: businessNumberSchema,
  representativeName: z.string().trim().min(1).max(80),
  address: z.string().trim().min(1).max(500),
  phone: z.string().trim().min(1).max(30),
}).strict()
export const decisionSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  version: z.number().int().nonnegative(),
}).strict()
export const memberDecisionSchema = decisionSchema.extend({
  action: z.enum(['approve', 'reject', 'suspend', 'reactivate', 'role', 'reassign', 'reopen']),
  customerRole: z.enum(['VIEWER', 'MANAGER']).default('VIEWER'),
  customerId: z.string().trim().min(1).max(20).optional(),
})
type CustomerFields = z.infer<typeof customerFieldsSchema>
type Decision = z.infer<typeof decisionSchema>
export type MemberDecision = z.infer<typeof memberDecisionSchema>
type Transaction = Prisma.TransactionClient

function conflict() {
  return new AppError(409, ErrorCode.CONFLICT, '상태가 변경되었거나 처리할 수 없습니다. 새로고침 후 확인해 주세요.')
}

export async function customerTransaction<T>(client: PrismaClient, work: (transaction: Transaction) => Promise<T>, options: { timeout?: number } = {}): Promise<T> {
  try {
    return await client.$transaction(work, { isolationLevel: 'Serializable', ...options })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && ['P2002', 'P2034'].includes(String(error.code))) throw conflict()
    throw error
  }
}

async function audit(transaction: Transaction, actorUserId: string, customerId: string | null, action: string, reason: string, changes: Prisma.InputJsonValue, targetUserId?: string) {
  await transaction.customerChange.create({ data: { actorUserId, customerId, targetUserId, action, reason, changes } })
}

export function createCustomerRepository(client: PrismaClient) {
  const companyWhere = (query: AdminListQuery): Prisma.CustomerWhereInput => query.id ? { id: query.id } : { ...(query.status && ['ACTIVE', 'PENDING', 'SUSPENDED'].includes(query.status) ? { status: query.status as 'ACTIVE' | 'PENDING' | 'SUSPENDED' } : {}), ...(query.q ? { OR: [{ name: { contains: query.q } }, { id: { contains: query.q } }, { businessNumber: { contains: query.q } }] } : {}) }
  const applicationWhere = (query: AdminListQuery): Prisma.CustomerApplicationWhereInput => query.id ? { id: query.id } : { ...(query.status && ['PENDING', 'APPROVED', 'REJECTED'].includes(query.status) ? { status: query.status as 'PENDING' | 'APPROVED' | 'REJECTED' } : {}), ...(query.q ? { OR: [{ name: { contains: query.q } }, { businessNumber: { contains: query.q } }, { user: { email: { contains: query.q } } }] } : {}) }
  return {
    lookup: async (businessNumber: string) => client.customer.findFirst({ where: { businessNumber, status: 'ACTIVE' }, select: { id: true, name: true } }),
    throttle: async (scope: string, identifier: string, maximum: number) => {
      const window = Math.floor(Date.now() / 600_000)
      const key = createHash('sha256').update(`${scope}:${identifier}:${window}`).digest('hex')
      const bucket = await client.customerRateLimit.upsert({
        where: { key }, create: { key, count: 1, expiresAt: new Date((window + 1) * 600_000) }, update: { count: { increment: 1 } },
      })
      await client.customerRateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } })
      if (bucket.count > maximum) throw new AppError(429, ErrorCode.RATE_LIMITED, '요청이 많습니다. 잠시 후 다시 시도해 주세요.')
    },
    list: (query = adminListQuery.parse({})) => client.customer.findMany({ where: companyWhere(query), ...listPaging(query), orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], include: { _count: { select: { users: true, assets: true } } } }),
    count: (query: AdminListQuery) => client.customer.count({ where: companyWhere(query) }),
    applications: (query = adminListQuery.parse({})) => client.customerApplication.findMany({ where: applicationWhere(query), ...listPaging(query), orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], include: { user: { select: { id: true, email: true, managerName: true, managerPhone: true } } } }),
    countApplications: (query: AdminListQuery) => client.customerApplication.count({ where: applicationWhere(query) }),
    detail: async (id: string) => {
      const customer = await client.customer.findUnique({ where: { id }, include: {
        users: { take: 25, orderBy: { id: 'asc' }, select: { id: true, email: true, managerName: true, status: true, customerRole: true } },
        _count: { select: { assets: true, users: true } },
        changes: { orderBy: { createdAt: 'desc' }, take: 100 },
      } })
      if (!customer) throw new AppError(404, ErrorCode.NOT_FOUND, '고객사를 찾을 수 없습니다.')
      return customer
    },
    create: (fields: CustomerFields, reason: string, actor: string) => customerTransaction(client, async (transaction) => {
      const customer = await transaction.customer.create({ data: { ...fields, id: `CUS-${randomBytes(8).toString('hex')}`, status: 'ACTIVE', approvedAt: new Date() } })
      await audit(transaction, actor, customer.id, 'customer.create', reason, { after: fields })
      return customer
    }),
    update: (id: string, fields: CustomerFields, decision: Decision, actor: string) => customerTransaction(client, async (transaction) => {
      const before = await transaction.customer.findUnique({ where: { id } })
      if (!before || before.version !== decision.version || before.businessNumber && before.businessNumber !== fields.businessNumber) throw conflict()
      const customer = await transaction.customer.update({ where: { id, version: decision.version }, data: { ...fields, version: { increment: 1 } } })
      await audit(transaction, actor, id, 'customer.update', decision.reason, { before: { name: before.name, businessNumber: before.businessNumber, representativeName: before.representativeName, address: before.address, phone: before.phone }, after: fields })
      return customer
    }),
    changeStatus: (id: string, status: 'ACTIVE' | 'SUSPENDED', decision: Decision, actor: string) => customerTransaction(client, async (transaction) => {
      const before = await transaction.customer.findUnique({ where: { id } })
      if (!before || before.version !== decision.version || before.status === status) throw conflict()
      if (status === 'ACTIVE') customerFieldsSchema.parse(before && { name: before.name, businessNumber: before.businessNumber, representativeName: before.representativeName, address: before.address, phone: before.phone })
      const customer = await transaction.customer.update({ where: { id, version: decision.version }, data: { status, approvedAt: status === 'ACTIVE' ? before.approvedAt ?? new Date() : before.approvedAt, version: { increment: 1 }, accessVersion: { increment: 1 } } })
      await audit(transaction, actor, id, 'customer.status', decision.reason, { before: before.status, after: status })
      return customer
    }),
    review: (id: string, input: Decision & { action: 'approve' | 'reject' | 'reopen'; customerId?: string; fields?: CustomerFields }, actor: string) => customerTransaction(client, async (transaction) => {
      const application = await transaction.customerApplication.findUnique({ where: { id }, include: { user: true } })
      if (!application || application.version !== input.version || application.user.status !== 'PENDING') throw conflict()
      if (input.action === 'reopen' ? application.status !== 'REJECTED' : application.status !== 'PENDING') throw conflict()
      const fields = input.fields ?? { name: application.name, businessNumber: application.businessNumber, representativeName: application.representativeName, address: application.address, phone: application.phone }
      let customerId: string | null = null
      if (input.action === 'approve') {
        customerFieldsSchema.parse(fields)
        const existing = await transaction.customer.findUnique({ where: { businessNumber: fields.businessNumber } })
        if (existing) {
          if (input.customerId !== existing.id || existing.status !== 'ACTIVE') throw new AppError(409, ErrorCode.CONFLICT, '동일 사업자번호의 고객사를 확인한 후 연결 고객사 코드를 입력해 주세요.')
          customerId = existing.id
        } else {
          if (input.customerId) throw conflict()
          const customer = await transaction.customer.create({ data: { ...fields, id: `CUS-${randomBytes(8).toString('hex')}`, status: 'ACTIVE', approvedAt: new Date() } })
          customerId = customer.id
        }
        await transaction.user.update({ where: { id: application.userId }, data: { customerId, companyName: fields.name, sessionVersion: { increment: 1 } } })
      }
      const result = await transaction.customerApplication.update({ where: { id, version: input.version }, data: { ...fields, customerId, status: input.action === 'approve' ? 'APPROVED' : input.action === 'reject' ? 'REJECTED' : 'PENDING', reviewReason: input.reason, reviewedAt: input.action === 'reopen' ? null : new Date(), version: { increment: 1 } } })
      await audit(transaction, actor, customerId, `application.${input.action}`, input.reason, { applicationId: id, before: { status: application.status, name: application.name, businessNumber: application.businessNumber, representativeName: application.representativeName, address: application.address, phone: application.phone }, after: { status: result.status, customerId, ...fields } }, application.userId)
      return result
    }),
  }
}

export type CustomerRepository = ReturnType<typeof createCustomerRepository>

export function createAuthRepository(client: PrismaClient): AuthRepository {
  const include = { customer: true, customerApplication: true } as const
  const where = (query: AdminListQuery): Prisma.UserWhereInput => ({ role: 'CUSTOMER', ...(query.id ? { id: query.id } : { ...(query.status && query.status !== 'APPROVED' ? { status: query.status } : {}), ...(query.customer ? { customerId: query.customer } : {}), ...(query.q ? { OR: [{ managerName: { contains: query.q } }, { companyName: { contains: query.q } }, { email: { contains: query.q } }] } : {}) }) })
  return {
    findByEmail: (email) => client.user.findUnique({ where: { email }, include }),
    findById: (id) => client.user.findUnique({ where: { id }, include }),
    listMembers: (query = adminListQuery.parse({})) => client.user.findMany({ where: where(query), ...listPaging(query), orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], include }),
    countMembers: (query) => client.user.count({ where: where(query) }),
    updateProfile: (actor, input) => customerTransaction(client, async transaction => {
      const before = await transaction.user.findUnique({ where: { id: actor.id }, include })
      if (!before || before.role !== 'CUSTOMER' || before.status !== 'ACTIVE' || !before.customer || before.customer.status !== 'ACTIVE' || before.customerId !== actor.customerId || before.customer.accessVersion !== actor.customer?.accessVersion || before.sessionVersion !== (actor.sessionVersion ?? 0)) {
        throw new AppError(403, ErrorCode.FORBIDDEN, '활성 계정과 고객사 접근 권한을 확인해 주세요.')
      }
      if (before.sessionVersion !== input.version) throw conflict()
      const duplicate = await transaction.user.findUnique({ where: { email: input.email } })
      if (duplicate && duplicate.id !== before.id) throw new AppError(409, ErrorCode.CONFLICT, '이미 사용 중인 이메일입니다.')
      const fields = { managerName: input.managerName, managerPhone: input.managerPhone, email: input.email }
      const after = await transaction.user.update({ where: { id: before.id, sessionVersion: input.version }, data: { ...fields, sessionVersion: { increment: 1 } }, include })
      await audit(transaction, before.id, before.customerId, 'member.profile', '본인 회원정보 수정', { before: { managerName: before.managerName, managerPhone: before.managerPhone, email: before.email }, after: fields }, before.id)
      return after
    }),
    createRegistration: (input: RegistrationInput) => customerTransaction(client, async (transaction) => {
      const { customerType, customerId, customer: fields, ...user } = input
      if (customerType === 'existing') {
        const customer = await transaction.customer.findFirst({ where: { id: customerId, status: 'ACTIVE' } })
        if (!customer) throw new AppError(409, ErrorCode.CONFLICT, '선택한 고객사를 사용할 수 없습니다.')
        return transaction.user.create({ data: { ...user, customerId: customer.id, companyName: customer.name }, include })
      }
      if (!fields) throw new AppError(400, ErrorCode.VALIDATION_ERROR, '신규 고객사 정보가 필요합니다.')
      return transaction.user.create({ data: { ...user, companyName: fields.name, customerApplication: { create: fields } }, include })
    }),
    approveMember: (id, _approvedAt, decision, actor) => {
      if (!decision || !actor) throw new AppError(400, ErrorCode.VALIDATION_ERROR, '승인 역할과 확인 사유가 필요합니다.')
      return changeMember(client, id, { ...decision, action: 'approve' }, actor)
    },
    changeMember: (id, decision, actor) => changeMember(client, id, decision, actor),
  }
}

function changeMember(client: PrismaClient, id: string, decision: MemberDecision, actor: string) {
  return customerTransaction(client, async (transaction) => {
    const before = await transaction.user.findUnique({ where: { id }, include: { customer: true, customerApplication: true } })
    if (!before || before.role !== 'CUSTOMER' || before.sessionVersion !== decision.version) throw conflict()
    const allowed = { approve: ['PENDING'], reject: ['PENDING'], suspend: ['ACTIVE'], reactivate: ['SUSPENDED'], role: ['ACTIVE'], reassign: ['ACTIVE', 'SUSPENDED', 'PENDING'], reopen: ['REJECTED'] }
    if (!allowed[decision.action].includes(before.status)) throw conflict()
    const data: Prisma.UserUpdateInput = { sessionVersion: { increment: 1 } }
    if (['approve', 'reactivate', 'role'].includes(decision.action)) {
      if (!before.customer || before.customer.status !== 'ACTIVE' || before.customerApplication && before.customerApplication.status !== 'APPROVED') throw conflict()
      data.status = 'ACTIVE'
      data.customerRole = decision.customerRole
      data.approvedAt = new Date()
    } else if (decision.action === 'reassign') {
      const customer = await transaction.customer.findFirst({ where: { id: decision.customerId ?? '', status: 'ACTIVE' } })
      if (!customer || before.customerApplication && before.customerApplication.status !== 'APPROVED') throw conflict()
      data.customer = { connect: { id: customer.id } }
      data.companyName = customer.name
      data.status = 'PENDING'
      data.customerRole = 'VIEWER'
      data.approvedAt = null
    } else {
      data.status = decision.action === 'reject' ? 'REJECTED' : decision.action === 'suspend' ? 'SUSPENDED' : 'PENDING'
    }
    const after = await transaction.user.update({ where: { id, sessionVersion: decision.version }, data, include: { customer: true, customerApplication: true } })
    await audit(transaction, actor, after.customerId, `member.${decision.action}`, decision.reason, { before: { customerId: before.customerId, role: before.customerRole, status: before.status }, after: { customerId: after.customerId, role: after.customerRole, status: after.status } }, id)
    return after
  })
}

export function customerHandlers(repository: CustomerRepository) {
  const actor = (context: Context) => (context.get('authUser') as AuthUser).id
  const id = (context: Context) => z.string().min(1).max(36).parse(context.req.param('id'))
  return {
    lookup: async (context: Context) => {
      const { businessNumber } = z.object({ businessNumber: businessNumberSchema }).strict().parse(await context.req.json())
      await repository.throttle('lookup-number', businessNumber, 20)
      context.header('Cache-Control', 'no-store')
      return success(context, { customer: await repository.lookup(businessNumber) })
    },
    list: async (context: Context) => { const query = adminListQuery.parse(context.req.query()); return success(context, { customers: await repository.list(query), pagination: listPagination(query, await repository.count(query)) }) },
    applications: async (context: Context) => { const query = adminListQuery.parse(context.req.query()); return success(context, { applications: await repository.applications(query), pagination: listPagination(query, await repository.countApplications(query)) }) },
    detail: async (context: Context) => success(context, { customer: await repository.detail(id(context)) }),
    create: async (context: Context) => {
      const { reason, ...fields } = customerFieldsSchema.extend({ reason: decisionSchema.shape.reason }).parse(await context.req.json())
      return success(context, { customer: await repository.create(fields, reason, actor(context)) }, 201)
    },
    update: async (context: Context) => {
      const { reason, version, ...fields } = customerFieldsSchema.extend(decisionSchema.shape).parse(await context.req.json())
      return success(context, { customer: await repository.update(id(context), fields, { reason, version }, actor(context)) })
    },
    status: (status: 'ACTIVE' | 'SUSPENDED') => async (context: Context) => success(context, { customer: await repository.changeStatus(id(context), status, decisionSchema.parse(await context.req.json()), actor(context)) }),
    review: async (context: Context) => {
      const input = decisionSchema.extend({ action: z.enum(['approve', 'reject', 'reopen']), customerId: z.string().max(20).optional(), fields: customerFieldsSchema.optional() }).parse(await context.req.json())
      return success(context, { application: await repository.review(id(context), input, actor(context)) })
    },
  }
}