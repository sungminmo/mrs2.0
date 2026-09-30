import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { SignJWT, jwtVerify } from 'jose'
import { z } from 'zod'
import { AppError, ErrorCode, success } from './http.js'
import type { Context, MiddlewareHandler } from 'hono'
import { customerFieldsSchema, memberDecisionSchema, type MemberDecision } from './customer.js'

const scrypt = promisify(scryptCallback)
const hashLength = 64

export type AuthUser = {
  id: string
  customerId?: string | null
  customerRole?: 'VIEWER' | 'MANAGER'
  sessionVersion?: number
  customer?: { id: string; name: string; businessNumber: string | null; representativeName: string; address: string; phone: string; status: 'PENDING' | 'ACTIVE' | 'SUSPENDED'; accessVersion: number } | null
  customerApplication?: { id: string; status: string } | null
  email: string
  passwordHash: string
  companyName: string
  managerName: string
  role: 'CUSTOMER' | 'ADMIN'
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED'
  companyPhone?: string | null
  managerPhone?: string
  address?: string | null
  approvedAt?: Date | null
  createdAt?: Date
}

export type RegistrationInput = {
  email: string
  passwordHash: string
  companyName?: string
  customerType: 'existing' | 'new'
  customerId?: string
  customer?: z.infer<typeof customerFieldsSchema>
  companyPhone?: string
  managerName: string
  managerPhone: string
  address?: string
}

export type AuthRepository = {
  findByEmail: (email: string) => Promise<AuthUser | null>
  findById: (id: string) => Promise<AuthUser | null>
  createRegistration: (input: RegistrationInput) => Promise<AuthUser>
  listMembers: () => Promise<AuthUser[]>
  approveMember: (id: string, approvedAt: Date, decision?: MemberDecision, actor?: string) => Promise<AuthUser | null>
  changeMember?: (id: string, decision: MemberDecision, actor: string) => Promise<AuthUser | null>
}

export const loginSchema = z.object({
  email: z.string().trim().pipe(z.email()).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
})

const registrationFields = {
  email: z.string().trim().pipe(z.email()).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
  managerName: z.string().trim().min(1).max(80),
  managerPhone: z.string().trim().min(1).max(30),
}
export const registrationSchema = z.discriminatedUnion('customerType', [
  z.object({ ...registrationFields, customerType: z.literal('existing'), customerId: z.string().trim().min(1).max(20) }).strict(),
  z.object({ ...registrationFields, customerType: z.literal('new'), customer: customerFieldsSchema }).strict(),
])

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const derived = await scrypt(password, salt, hashLength) as Buffer
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`
}

async function verifyPassword(password: string, encoded: string) {
  const [algorithm, saltValue, hashValue] = encoded.split('$')
  if (algorithm !== 'scrypt' || !saltValue || !hashValue) return false
  const salt = Buffer.from(saltValue, 'base64url')
  const stored = Buffer.from(hashValue, 'base64url')
  const derived = await scrypt(password, salt, stored.length) as Buffer
  return stored.length === derived.length && timingSafeEqual(stored, derived)
}

function tokenKey(secret: string) {
  return new TextEncoder().encode(secret)
}

async function issueToken(user: AuthUser, secret: string, expiresIn: string) {
  return new SignJWT({ email: user.email, sessionVersion: user.sessionVersion ?? 0, customerVersion: user.customer?.accessVersion ?? null })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(tokenKey(secret))
}

export function authRoutes(repository: AuthRepository, secret: string, expiresIn: string) {
  return async (context: Context) => {
    const credentials = loginSchema.parse(await context.req.json())
    const user = await repository.findByEmail(credentials.email)
    if (!user || !(await verifyPassword(credentials.password, user.passwordHash))) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Email or password is incorrect')
    }
    if (user.status === 'PENDING') throw new AppError(403, ErrorCode.ACCOUNT_PENDING, 'Account approval is pending')
    if (user.status !== 'ACTIVE') throw new AppError(403, ErrorCode.FORBIDDEN, 'Account is not available')
    if (user.role === 'CUSTOMER' && (!user.customerId || user.customer?.id !== user.customerId || user.customer.status !== 'ACTIVE')) throw new AppError(403, ErrorCode.FORBIDDEN, '고객사 승인 또는 소속 확인이 필요합니다.')
    const accessToken = await issueToken(user, secret, expiresIn)
    return success(context, { accessToken, tokenType: 'Bearer', user: memberProfile(user) })
  }
}

export function register(repository: AuthRepository) {
  return async (context: Context) => {
    const input = registrationSchema.parse(await context.req.json())
    if (await repository.findByEmail(input.email)) {
      throw new AppError(409, ErrorCode.CONFLICT, 'Email is already registered')
    }
    const { password, ...profile } = input
    const user = await repository.createRegistration({
      ...profile,
      passwordHash: await hashPassword(password),
    })
    return success(context, { id: user.id, email: user.email, status: user.status, createdAt: user.createdAt }, 201)
  }
}

export function requireAuth(repository: AuthRepository, secret: string): MiddlewareHandler {
  return async (context, next) => {
    const authorization = context.req.header('Authorization')
    if (!authorization?.startsWith('Bearer ')) throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Bearer token is required')
    let payload
    try {
      ;({ payload } = await jwtVerify(authorization.slice(7), tokenKey(secret), { algorithms: ['HS256'] }))
      if (!payload.sub || typeof payload.email !== 'string') throw new Error('Invalid token payload')
    } catch {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid or expired access token')
    }
    const user = await repository.findById(payload.sub)
    if (!user || user.status !== 'ACTIVE') throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Account is not available')
    if (payload.sessionVersion !== (user.sessionVersion ?? 0)) throw new AppError(401, ErrorCode.UNAUTHORIZED, '다시 로그인해 주세요.')
    if (user.role === 'CUSTOMER' && (!user.customerId || user.customer?.id !== user.customerId || user.customer.status !== 'ACTIVE' || payload.customerVersion !== user.customer.accessVersion)) throw new AppError(401, ErrorCode.UNAUTHORIZED, '고객사 접근 권한이 변경되었습니다.')
    context.header('Cache-Control', 'no-store')
    context.set('authUser', user)
    await next()
  }
}

export const requireAdmin: MiddlewareHandler = async (context, next) => {
  const user = context.get('authUser') as AuthUser
  if (user.role !== 'ADMIN') throw new AppError(403, ErrorCode.FORBIDDEN, 'Administrator access is required')
  await next()
}

export function memberProfile(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    companyName: user.customer?.name ?? user.companyName,
    customerId: user.customerId ?? null,
    customerRole: user.customerRole ?? 'VIEWER',
    sessionVersion: user.sessionVersion ?? 0,
    customer: user.customer ? { id: user.customer.id, name: user.customer.name, businessNumber: user.customer.businessNumber, representativeName: user.customer.representativeName, address: user.customer.address, phone: user.customer.phone, status: user.customer.status } : null,
    customerApplication: user.customerApplication ? { id: user.customerApplication.id, status: user.customerApplication.status } : null,
    companyPhone: user.companyPhone ?? null,
    managerName: user.managerName,
    managerPhone: user.managerPhone ?? '',
    address: user.address ?? null,
    role: user.role,
    status: user.status,
    approvedAt: user.approvedAt ?? null,
    createdAt: user.createdAt,
  }
}

export function listMembers(repository: AuthRepository) {
  return async (context: Context) => success(context, { members: (await repository.listMembers()).map(memberProfile) })
}

export function approveMember(repository: AuthRepository) {
  return async (context: Context) => {
    const id = z.string().uuid().parse(context.req.param('id'))
    const user = await repository.findById(id)
    if (!user) throw new AppError(404, ErrorCode.NOT_FOUND, 'Member application was not found')
    if (user.status !== 'PENDING') throw new AppError(409, ErrorCode.CONFLICT, 'Member application is not pending')
    const decision = memberDecisionSchema.parse({ ...await context.req.json(), action: 'approve' })
    const approved = await repository.approveMember(user.id, new Date(), decision, (context.get('authUser') as AuthUser).id)
    if (!approved) throw new AppError(409, ErrorCode.CONFLICT, 'Member application status changed')
    return success(context, { member: memberProfile(approved) })
  }
}

export function currentUser(context: Context) {
  const user = context.get('authUser') as AuthUser
  return success(context, { user: memberProfile(user) })
}

export function updateMember(repository: AuthRepository) {
  return async (context: Context) => {
    if (!repository.changeMember) throw new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, '회원 관리를 사용할 수 없습니다.')
    const id = z.string().uuid().parse(context.req.param('id'))
    const member = await repository.changeMember(id, memberDecisionSchema.parse(await context.req.json()), (context.get('authUser') as AuthUser).id)
    if (!member) throw new AppError(404, ErrorCode.NOT_FOUND, '회원을 찾을 수 없습니다.')
    return success(context, { member: memberProfile(member) })
  }
}