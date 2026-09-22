import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { SignJWT, jwtVerify } from 'jose'
import { z } from 'zod'
import { AppError, ErrorCode, success } from './http.js'
import type { Context, MiddlewareHandler } from 'hono'

const scrypt = promisify(scryptCallback)
const hashLength = 64

export type AuthUser = {
  id: string
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
  companyName: string
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
  approveMember: (id: string, approvedAt: Date) => Promise<AuthUser | null>
}

export const loginSchema = z.object({
  email: z.string().trim().pipe(z.email()).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
})

export const registrationSchema = z.object({
  email: z.string().trim().pipe(z.email()).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
  companyName: z.string().trim().min(1).max(160),
  companyPhone: z.string().trim().max(30).optional(),
  managerName: z.string().trim().min(1).max(80),
  managerPhone: z.string().trim().min(1).max(30),
  address: z.string().trim().max(500).optional(),
})

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
  return new SignJWT({ email: user.email, companyName: user.companyName, managerName: user.managerName, role: user.role })
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
    const accessToken = await issueToken(user, secret, expiresIn)
    const { passwordHash: _passwordHash, status: _status, ...profile } = user
    return success(context, { accessToken, tokenType: 'Bearer', user: profile })
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
    try {
      const { payload } = await jwtVerify(authorization.slice(7), tokenKey(secret), { algorithms: ['HS256'] })
      if (!payload.sub || typeof payload.email !== 'string') throw new Error('Invalid token payload')
      const user = await repository.findById(payload.sub)
      if (!user || user.status !== 'ACTIVE') throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Account is not available')
      context.set('authUser', user)
      await next()
    } catch (error) {
      if (error instanceof AppError) throw error
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid or expired access token')
    }
  }
}

export const requireAdmin: MiddlewareHandler = async (context, next) => {
  const user = context.get('authUser') as AuthUser
  if (user.role !== 'ADMIN') throw new AppError(403, ErrorCode.FORBIDDEN, 'Administrator access is required')
  await next()
}

function memberProfile(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    companyName: user.companyName,
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
    const approved = await repository.approveMember(user.id, new Date())
    if (!approved) throw new AppError(409, ErrorCode.CONFLICT, 'Member application status changed')
    return success(context, { member: memberProfile(approved) })
  }
}

export function currentUser(context: Context) {
  const user = context.get('authUser') as AuthUser
  const { passwordHash: _passwordHash, status: _status, ...profile } = user
  return success(context, { user: profile })
}