import { randomUUID } from 'node:crypto'
import type { Actor, Ctx, Permission, Resource, Route } from '../core/operation.js'
import { formatDatetime } from '../core/time.js'
import type { Database } from '../db/connection.js'
import { hashSecret } from '../modules/auth/index.js'
import { actors, sessions, tokens } from '../modules/auth/schema.js'
import type { ProjectStatus } from '../modules/project/index.js'
import { projects } from '../modules/project/schema.js'

export const FIXED_NOW = new Date('2026-09-16T12:00:00.000+09:00')

export const ALL_READWRITE: Record<Resource, Permission> = {
  project: 'readwrite',
  task: 'readwrite',
  document: 'readwrite',
  inbox: 'readwrite',
}

export function insertActor(
  { db }: Database,
  options: {
    name?: string
    actorType?: 'human' | 'agent'
    permissions?: Partial<Record<Resource, Permission>>
  } = {},
): Actor {
  const permissions = { ...ALL_READWRITE, ...options.permissions }
  const row = db
    .insert(actors)
    .values({
      name: options.name ?? `actor-${randomUUID()}`,
      actorType: options.actorType ?? 'agent',
      permProject: permissions.project,
      permTask: permissions.task,
      permDocument: permissions.document,
      permInbox: permissions.inbox,
    })
    .returning()
    .get()
  return { id: row.id, name: row.name, permissions }
}

export function insertProject({ db }: Database, status: ProjectStatus = 'active'): number {
  return db.insert(projects).values({ name: 'テストの Project', status }).returning().get().id
}

/** トークンを発行した状態にする（発行の操作は別の Task で作る）。平文のトークンを返す */
export function insertToken({ db }: Database, actor: Actor, revoked = false): string {
  const token = randomUUID()
  const now = formatDatetime(FIXED_NOW)
  db.insert(tokens)
    .values({
      actorId: actor.id,
      tokenHash: hashSecret(token),
      issuedAt: now,
      revokedAt: revoked ? now : null,
    })
    .run()
  return token
}

/** ログインした状態にする（ログインの操作は別の Task で作る）。平文のセッション ID を返す */
export function insertSession({ db }: Database, actor: Actor, expiresAt: Date): string {
  const sessionId = randomUUID()
  db.insert(sessions)
    .values({
      actorId: actor.id,
      sessionHash: hashSecret(sessionId),
      createdAt: formatDatetime(FIXED_NOW),
      expiresAt: formatDatetime(expiresAt),
    })
    .run()
  return sessionId
}

export function ctxFor({ db }: Database, actor: Actor, source: Route = 'web'): Ctx {
  return { db, actor, source, now: formatDatetime(FIXED_NOW) }
}
