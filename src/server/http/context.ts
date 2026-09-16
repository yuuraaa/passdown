import type { Context } from 'hono'
import type { Actor, Ctx, Db } from '../core/operation.js'
import { formatDatetime } from '../core/time.js'

/** 経路の層が受け取る依存。DB の接続は起動処理から渡され、業務ロジックの層へ ctx.db で渡すだけ */
export type RouteDeps = {
  db: Db
  now: () => Date
}

export type ApiEnv = { Variables: { actor: Actor } }

export function webCtx(deps: RouteDeps, c: Context<ApiEnv>): Ctx {
  return { db: deps.db, actor: c.get('actor'), source: 'web', now: formatDatetime(deps.now()) }
}
