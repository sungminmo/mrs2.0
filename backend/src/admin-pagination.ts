import { z } from 'zod'
export const adminListQuery = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), rows: z.coerce.number().int().min(1).max(100).default(25), q: z.string().max(160).default(''), status: z.enum(['', 'ACTIVE', 'PENDING', 'REJECTED', 'SUSPENDED', 'APPROVED']).default(''), role: z.enum(['', 'SYSTEM_ADMIN', 'ADMIN', 'SALES', 'LOGISTICS']).default(''), id: z.string().max(80).optional(), customer: z.string().max(80).optional() })
export type AdminListQuery = z.infer<typeof adminListQuery>
export const listPaging = (query: AdminListQuery) => ({ skip: query.id ? 0 : (query.page - 1) * query.rows, take: query.id ? 1 : query.rows })
export const listPagination = (query: AdminListQuery, total: number) => ({ page: query.page, rows: query.rows, total })