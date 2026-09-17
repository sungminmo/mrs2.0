import type { Context } from 'hono'
import { ZodError } from 'zod'

export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

type ErrorDetail = {
  path: string
  message: string
  code: string
}

export class AppError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 409 | 429 | 503,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: ErrorDetail[],
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function success<T>(context: Context, data: T, status: 200 | 201 | 202 = 200) {
  return context.json({ success: true as const, data }, status)
}

export function failure(context: Context, status: number, code: ErrorCode, message: string, details?: ErrorDetail[]) {
  return context.json({ success: false as const, error: { code, message, ...(details ? { details } : {}) } }, status as 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503)
}

export function handleError(error: Error, context: Context) {
  if (error instanceof AppError) {
    return failure(context, error.status, error.code, error.message, error.details)
  }

  if (error instanceof ZodError) {
    return failure(context, 400, ErrorCode.VALIDATION_ERROR, 'Request validation failed', error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    })))
  }

  console.error(error)
  return failure(context, 500, ErrorCode.INTERNAL_ERROR, 'Internal server error')
}