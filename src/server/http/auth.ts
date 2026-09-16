import { getCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { formatDatetime } from '../core/time.js'
import { authenticateSession } from '../modules/auth/index.js'
import type { ApiEnv, RouteDeps } from './context.js'
import { errorBody } from './errors.js'

export const SESSION_COOKIE = 'passdown_session'

/**
 * REST API はログインのセッション（Cookie）だけを受け付け、Authorization ヘッダを読まない。
 * これでエージェントのトークンは REST API に使えない（設計書 4.9）。
 */
export function sessionAuth(deps: RouteDeps) {
  return createMiddleware<ApiEnv>(async (c, next) => {
    const sessionId = getCookie(c, SESSION_COOKIE)
    const actor = sessionId
      ? authenticateSession(deps.db, sessionId, formatDatetime(deps.now()))
      : null
    if (!actor) {
      return c.json(errorBody('unauthorized', 'ログインしてください'), 401)
    }
    c.set('actor', actor)
    await next()
  })
}
