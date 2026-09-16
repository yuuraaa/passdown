import { createHash } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { NotFoundError } from '../../core/errors.js'
import type { Actor, Ctx, Db } from '../../core/operation.js'
import { isSessionExpired, planSessionExtension } from './rules.js'
import { actors, sessions, tokens } from './schema.js'

/** トークン・セッション ID は推測できない乱数のため、速いハッシュで引く（設計書 5.3） */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

function toActor(row: typeof actors.$inferSelect): Actor {
  return {
    id: row.id,
    name: row.name,
    permissions: {
      project: row.permProject,
      task: row.permTask,
      document: row.permDocument,
      inbox: row.permInbox,
    },
  }
}

// 認証は操作した Actor が決まる前に行うため、ctx ではなく DB と現在の日時を受け取る

/** MCP の Bearer トークンから Actor を得る。無効なら null */
export function authenticateToken(db: Db, token: string): Actor | null {
  return db.transaction((tx) => {
    const row = tx
      .select({ actor: actors })
      .from(tokens)
      .innerJoin(actors, eq(tokens.actorId, actors.id))
      .where(and(eq(tokens.tokenHash, hashSecret(token)), isNull(tokens.revokedAt)))
      .get()
    return row ? toActor(row.actor) : null
  })
}

/** REST API のログインのセッションから Actor を得る。無効・期限切れなら null */
export function authenticateSession(db: Db, sessionId: string, now: string): Actor | null {
  return db.transaction((tx) => {
    const row = tx
      .select({ session: sessions, actor: actors })
      .from(sessions)
      .innerJoin(actors, eq(sessions.actorId, actors.id))
      .where(eq(sessions.sessionHash, hashSecret(sessionId)))
      .get()
    if (!row || isSessionExpired(row.session.expiresAt, now)) {
      return null
    }
    const extended = planSessionExtension(row.session.expiresAt, now)
    if (extended) {
      tx.update(sessions).set({ expiresAt: extended }).where(eq(sessions.id, row.session.id)).run()
    }
    return toActor(row.actor)
  })
}

/** Actor が存在することを確かめる（担当の指定など）。無ければ「見つからない」 */
export function assertActorExists(ctx: Ctx, actorId: number): void {
  ctx.db.transaction((tx) => {
    const row = tx.select({ id: actors.id }).from(actors).where(eq(actors.id, actorId)).get()
    if (!row) {
      throw new NotFoundError(`actor:${actorId} が見つかりません`)
    }
  })
}
