import { z } from '@hono/zod-openapi'

const timestamp = z.iso.datetime()
const count = z.number().int().nonnegative()
const decimal = z.string().regex(/^\d+(\.\d+)?$/)
const counts = z.record(z.string(), count)
const envelope = (data: z.ZodType) => z.object({ success: z.literal(true), data })
const meta = z.object({ page: count, size: count, totalElements: count, totalPages: count })

export const apiError = z.object({ success: z.literal(false), error: z.object({ code: z.string(), message: z.string(), details: z.array(z.object({ path: z.string(), code: z.string(), message: z.string() })).optional() }) }).openapi('ApiError')
export const memberProfile = z.object({
  id: z.string(), email: z.string(), companyName: z.string(), customerId: z.string().nullable(), customerRole: z.enum(['VIEWER', 'MANAGER']), sessionVersion: count,
  customer: z.object({ id: z.string(), name: z.string(), businessNumber: z.string().nullable(), representativeName: z.string(), address: z.string(), phone: z.string(), status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED']) }).nullable(),
  customerApplication: z.object({ id: z.string(), status: z.string() }).nullable(), companyPhone: z.string().nullable(), managerName: z.string(), managerPhone: z.string(), address: z.string().nullable(), role: z.enum(['CUSTOMER', 'ADMIN']), adminRole: z.string().nullable(), status: z.string(), approvedAt: timestamp.nullable(), createdAt: timestamp,
}).openapi('AuthenticationProfile')
const session = envelope(z.object({ accessToken: z.string(), tokenType: z.literal('Bearer'), user: memberProfile })).openapi('AuthenticationSession')
const profile = envelope(z.object({ user: memberProfile })).openapi('AuthenticationCurrentUser')
const quoteLine = z.object({ id: z.string(), quoteId: z.string(), productId: z.string(), sortOrder: count, name: z.string(), category: z.string(), grade: z.string(), unit: z.string(), specification: z.string(), brand: z.string(), imageUrl: z.string().nullable(), quantity: decimal, originalUnitPrice: decimal, discountRate: count, unitPrice: decimal, originalTotal: decimal, total: decimal }).openapi('PurchaseQuotesLine')
const quote = z.object({ id: z.string(), code: z.string(), customerId: z.string(), actorUserId: z.string(), status: z.literal('RECEIVED'), company: z.string(), contactName: z.string(), phone: z.string(), email: z.string(), address: z.string(), deliveryDate: z.string().nullable(), note: z.string(), originalTotal: decimal, total: decimal, createdAt: timestamp, items: z.array(quoteLine) }).openapi('PurchaseQuotesRequestSnapshot')
const offerStatus = z.enum(['SENT', 'SUPERSEDED', 'DECLINED', 'WITHDRAWN', 'ACCEPTED'])
const quoteList = envelope(z.object({ records: z.array(quote.extend({ responseStatus: z.enum(['WAITING', 'SENT', 'EXPIRED', 'SUPERSEDED', 'DECLINED', 'WITHDRAWN', 'ACCEPTED']), latestOffer: z.object({ id: z.string(), revision: count, status: offerStatus, sentAt: timestamp.nullable(), expiresAt: timestamp.nullable() }).nullable(), order: z.object({ id: z.string(), code: z.string() }).nullable() })), page: count, size: count, total: count, summary: counts })).openapi('PurchaseQuotesList')
const inspectionList = z.object({ data: z.array(z.object({ id: z.string(), receivingId: z.string(), siteName: z.string(), receivedAt: timestamp.nullable(), status: z.enum(['AWAITING_ACKNOWLEDGEMENT', 'COMPLETED']), acknowledgedAt: timestamp.nullable(), consentedAt: timestamp.nullable(), hasDisposalTargets: z.boolean(), disposalTargetCount: count, consentRequired: z.boolean(), canConsent: z.boolean() })), meta, summary: z.object({ acknowledgement: z.object({ PENDING: count, COMPLETED: count }), disposal: z.object({ NONE: count, REQUIRED: count, CONSENTED: count }) }) }).openapi('InspectionsList')
const receiving = z.object({ id: z.string(), customerId: z.string(), siteId: z.string().nullable(), siteName: z.string(), managerName: z.string(), managerPhone: z.string(), channel: z.string(), volume: z.string(), volumeDescription: z.string(), summary: z.string(), status: z.enum(['REQUESTED', 'APPROVED', 'RECEIVED', 'REJECTED', 'CANCELLED']), requestedAt: timestamp, scheduledAt: timestamp.nullable(), receivedAt: timestamp.nullable(), termsAgreedAt: timestamp, termsVersion: z.string(), termsText: z.string(), transportEstimate: decimal.nullable(), note: z.string(), createdAt: timestamp, updatedAt: timestamp }).openapi('ReceivingsRecord')
const receivingList = z.object({ data: z.array(receiving), meta, summary: counts }).openapi('ReceivingsList')

export const responseSchemas = new Map<string, z.ZodType>([
  ['post /api/auth/login', session], ['post /api/admin/auth/login', session], ['patch /api/auth/me', session],
  ['get /api/auth/me', profile], ['get /api/admin/auth/me', profile],
  ['get /api/customer/quotes', quoteList], ['get /api/customer/quotes/{id}', envelope(quote).openapi('PurchaseQuotesDetail')],
  ['get /api/customer/inspections', inspectionList], ['get /api/customer/receivings', receivingList],
])