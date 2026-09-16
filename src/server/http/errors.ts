import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { AppError, type AppErrorType } from '../core/errors.js'

/** 応答のエラーの種類（設計書 7.6） */
export type ApiErrorType = AppErrorType | 'unauthorized' | 'internal'

export type ApiErrorBody = { error: { type: ApiErrorType; message: string } }

const STATUS: Record<AppErrorType, ContentfulStatusCode> = {
  invalid_input: 400,
  forbidden: 403,
  not_found: 404,
  not_allowed: 409,
  conflict: 409,
}

export function errorBody(type: ApiErrorType, message: string): ApiErrorBody {
  return { error: { type, message } }
}

/** 例外を応答に変える。想定外のエラーの詳細は返さず、ログに残す（設計書 4.6） */
export function handleError(err: Error, c: Context) {
  if (err instanceof AppError) {
    return c.json(errorBody(err.type, err.message), STATUS[err.type])
  }
  console.error(err)
  return c.json(errorBody('internal', 'サーバーで想定外のエラーが起きました'), 500)
}
