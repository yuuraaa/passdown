import { hc } from 'hono/client'
import type { ApiType } from '../../server/http/app.js'

export type ApiErrorType =
  | 'invalid_input'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'not_allowed'
  | 'conflict'
  | 'internal'

export class ApiError extends Error {
  constructor(
    readonly type: ApiErrorType,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// Hono の RPC 型はサーバーの経路型だけを type import する。実行コードはブラウザに含めない。
export const api = hc<ApiType>('/api')

export async function readJson<T>(response: Response): Promise<T> {
  if (response.ok) return response.json() as Promise<T>

  const body = (await response.json().catch(() => null)) as {
    error?: { type?: ApiErrorType; message?: string }
  } | null
  const error = new ApiError(
    body?.error?.type ?? 'internal',
    body?.error?.message ?? '通信に失敗しました',
  )
  if (error.type === 'unauthorized' && window.location.pathname !== '/login') {
    const returnTo = `${window.location.pathname}${window.location.search}`
    window.location.assign(`/login?returnTo=${encodeURIComponent(returnTo)}`)
  }
  throw error
}
