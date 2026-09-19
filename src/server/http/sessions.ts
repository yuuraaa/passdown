import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { Hono } from 'hono'
import { formatDatetime } from '../core/time.js'
import { LoginFailureTracker, login, loginInput, logout } from '../modules/auth/index.js'
import type { ApiEnv, RouteDeps } from './context.js'
import { SESSION_COOKIE, sessionAuth } from './auth.js'
import { errorBody } from './errors.js'
import { zValidator } from './validator.js'

const sessionCookie = { httpOnly: true, sameSite: 'lax' as const, path: '/' }

/** ログインだけは未認証で受け、以後のセッション操作は Cookie 認証を通す。 */
export function sessionRoutes(deps: RouteDeps) {
  const failures = new LoginFailureTracker()
  return new Hono<ApiEnv>()
    .post('/', zValidator('json', loginInput), async (c) => {
      const result = await login(deps.db, c.req.valid('json'), formatDatetime(deps.now()))
      if (!result) {
        await failures.fail(c.req.valid('json').loginName, deps.now())
        return c.json(errorBody('unauthorized', 'ログイン名またはパスワードが違います'), 401)
      }
      failures.succeed(c.req.valid('json').loginName)
      setCookie(c, SESSION_COOKIE, result.sessionId, sessionCookie)
      return c.json(result.actor, 200)
    })
    .use(sessionAuth(deps))
    .get('/', (c) => c.json(c.get('actor'), 200))
    .delete('/', (c) => {
      const sessionId = getCookie(c, SESSION_COOKIE)
      if (sessionId) logout(deps.db, sessionId)
      deleteCookie(c, SESSION_COOKIE, { ...sessionCookie })
      return c.json({}, 200)
    })
}
