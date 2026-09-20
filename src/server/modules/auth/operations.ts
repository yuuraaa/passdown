import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { and, asc, eq, isNull, lte } from 'drizzle-orm'
import { NotAllowedError, NotFoundError } from '../../core/errors.js'
import { type Actor, type Ctx, defineOperation, type Db } from '../../core/operation.js'
import { formatDatetime } from '../../core/time.js'
import { recordActivities } from '../activity/index.js'
import {
  actorIdInput,
  createAgentActorInput,
  createHumanAccountInput,
  listActorsInput,
  loginInput,
  resetHumanPasswordInput,
  tokenIdInput,
  updateAgentPermissionsInput,
} from './inputs.js'
import {
  checkCanChangeAgentPermissions,
  checkCanIssueToken,
  checkAgentActor,
  isSessionExpired,
  planSessionExtension,
  SESSION_TTL_MS,
} from './rules.js'
import { actors, humanCredentials, sessions, tokens } from './schema.js'

const SCRYPT_N = 2 ** 17
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_KEYLEN = 32
const SCRYPT_MAXMEM = 192 * 1024 * 1024

export type AuthActor = typeof actors.$inferSelect

const FAILURE_WINDOW_MS = 30 * 60 * 1000
const FAILURE_LIMIT = 1000
const INITIAL_FAILURE_DELAY_MS = 1000
const MAX_FAILURE_DELAY_MS = 30_000

/** ログイン失敗をログイン名単位で一時的に保持する。DB には保存しない（設計書 5.3）。 */
export class LoginFailureTracker {
  private readonly failures = new Map<string, { count: number; lastFailedAt: number }>()

  constructor(
    private readonly sleep: (milliseconds: number) => Promise<void> = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {}

  async fail(loginName: string, now: Date): Promise<void> {
    const nowMs = now.getTime()
    for (const [name, value] of this.failures) {
      if (nowMs - value.lastFailedAt > FAILURE_WINDOW_MS) this.failures.delete(name)
    }
    const previous = this.failures.get(loginName)
    const value = { count: (previous?.count ?? 0) + 1, lastFailedAt: nowMs }
    this.failures.set(loginName, value)
    if (this.failures.size > FAILURE_LIMIT) {
      const oldest = [...this.failures.entries()].sort(
        (a, b) => a[1].lastFailedAt - b[1].lastFailedAt,
      )[0]
      if (oldest) this.failures.delete(oldest[0])
    }
    const delay = Math.min(INITIAL_FAILURE_DELAY_MS * 2 ** (value.count - 1), MAX_FAILURE_DELAY_MS)
    await this.sleep(delay)
  }

  succeed(loginName: string): void {
    this.failures.delete(loginName)
  }
}

function deriveKey(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (err, derived) => {
      if (err) reject(err)
      else resolve(derived)
    })
  })
}

function toActor(row: AuthActor): Actor {
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

function permissionsOf(row: AuthActor) {
  return {
    project: row.permProject,
    task: row.permTask,
    document: row.permDocument,
    inbox: row.permInbox,
  }
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

/** CLI の初回 human 作成・パスワード再設定でも使う scrypt 形式。 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await deriveKey(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  })
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${derived.toString('base64url')}`
}

/** CLI 専用。Activity を作らず、Actor と credential を同じトランザクションで追加する。 */
export async function createHumanAccount(db: Db, input: unknown): Promise<AuthActor> {
  const parsed = createHumanAccountInput.parse(input)
  const passwordHash = await hashPassword(parsed.password)
  return db.transaction((tx) => {
    const actor = tx
      .insert(actors)
      .values({
        actorType: 'human',
        name: parsed.name,
        permProject: 'readwrite',
        permTask: 'readwrite',
        permDocument: 'readwrite',
        permInbox: 'readwrite',
      })
      .returning()
      .get()
    tx.insert(humanCredentials)
      .values({ actorId: actor.id, loginName: parsed.loginName, passwordHash })
      .run()
    return actor
  })
}

/** CLI 専用。対象の全セッションを、ハッシュ更新と同じトランザクションで削除する。 */
export async function resetHumanPassword(db: Db, input: unknown): Promise<void> {
  const parsed = resetHumanPasswordInput.parse(input)
  const passwordHash = await hashPassword(parsed.password)
  db.transaction((tx) => {
    const credential = tx
      .select({ actorId: humanCredentials.actorId })
      .from(humanCredentials)
      .innerJoin(actors, eq(humanCredentials.actorId, actors.id))
      .where(and(eq(humanCredentials.loginName, parsed.loginName), eq(actors.actorType, 'human')))
      .get()
    if (!credential) throw new NotFoundError(`loginName:${parsed.loginName} が見つかりません`)
    tx.update(humanCredentials)
      .set({ passwordHash })
      .where(eq(humanCredentials.actorId, credential.actorId))
      .run()
    tx.delete(sessions).where(eq(sessions.actorId, credential.actorId)).run()
  })
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [scheme, n, r, p, saltText, hashText] = encoded.split('$')
  if (scheme !== 'scrypt' || !n || !r || !p || !saltText || !hashText) return false
  const expected = Buffer.from(hashText, 'base64url')
  if (expected.length === 0) return false
  const actual = await deriveKey(password, Buffer.from(saltText, 'base64url'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT_MAXMEM,
  })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function authenticateToken(db: Db, token: string): Actor | null {
  return db.transaction((tx) => {
    const row = tx
      .select({ actor: actors })
      .from(tokens)
      .innerJoin(actors, eq(tokens.actorId, actors.id))
      .where(
        and(
          eq(tokens.tokenHash, hashSecret(token)),
          isNull(tokens.revokedAt),
          eq(actors.actorType, 'agent'),
        ),
      )
      .get()
    return row ? toActor(row.actor) : null
  })
}

export function authenticateSession(db: Db, sessionId: string, now: string): Actor | null {
  return db.transaction((tx) => {
    const row = tx
      .select({ session: sessions, actor: actors })
      .from(sessions)
      .innerJoin(actors, eq(sessions.actorId, actors.id))
      .where(and(eq(sessions.sessionHash, hashSecret(sessionId)), eq(actors.actorType, 'human')))
      .get()
    if (!row) return null
    if (isSessionExpired(row.session.expiresAt, now)) {
      tx.delete(sessions).where(eq(sessions.id, row.session.id)).run()
      return null
    }
    const extended = planSessionExtension(row.session.expiresAt, now)
    if (extended)
      tx.update(sessions).set({ expiresAt: extended }).where(eq(sessions.id, row.session.id)).run()
    return toActor(row.actor)
  })
}

/** パスワード照合は DB トランザクション外で行う。 */
export async function login(
  db: Db,
  input: unknown,
  now: string,
): Promise<{ actor: Actor; sessionId: string } | null> {
  const parsed = loginInput.parse(input)
  const credential = db
    .select({ actor: actors, passwordHash: humanCredentials.passwordHash })
    .from(humanCredentials)
    .innerJoin(actors, eq(humanCredentials.actorId, actors.id))
    .where(eq(humanCredentials.loginName, parsed.loginName))
    .get()
  // 成否にかかわらず、ログインの処理で期限切れのセッションを掃除する（設計書 5.3）。
  db.transaction((tx) => tx.delete(sessions).where(lte(sessions.expiresAt, now)).run())
  const dummy = await hashPassword('passdown-invalid-login')
  const verified = await verifyPassword(parsed.password, credential?.passwordHash ?? dummy)
  if (!credential || credential.actor.actorType !== 'human' || !verified) return null
  const sessionId = randomBytes(32).toString('base64url')
  db.transaction((tx) => {
    tx.insert(sessions)
      .values({
        actorId: credential.actor.id,
        sessionHash: hashSecret(sessionId),
        createdAt: now,
        expiresAt: formatDatetime(new Date(Date.parse(now) + SESSION_TTL_MS)),
      })
      .run()
  })
  return { actor: toActor(credential.actor), sessionId }
}

export function logout(db: Db, sessionId: string): void {
  db.transaction((tx) =>
    tx
      .delete(sessions)
      .where(eq(sessions.sessionHash, hashSecret(sessionId)))
      .run(),
  )
}

export function assertActorExists(ctx: Ctx, actorId: number): void {
  ctx.db.transaction((tx) => {
    if (!tx.select({ id: actors.id }).from(actors).where(eq(actors.id, actorId)).get())
      throw new NotFoundError(`actor:${actorId} が見つかりません`)
  })
}

export function getActorTokenIds(ctx: Ctx, actorId: number): number[] {
  return ctx.db.transaction((tx) => {
    if (!tx.select({ id: actors.id }).from(actors).where(eq(actors.id, actorId)).get())
      throw new NotFoundError(`actor:${actorId} が見つかりません`)
    return tx
      .select({ id: tokens.id })
      .from(tokens)
      .where(eq(tokens.actorId, actorId))
      .orderBy(asc(tokens.id))
      .all()
      .map((token) => token.id)
  })
}

export const listActors = defineOperation({
  name: 'list_actors',
  routes: ['web', 'mcp'],
  requires: [['task', 'read']],
  returns: [],
  entity: 'actor',
  input: listActorsInput,
  run: (ctx) =>
    ctx.db
      .select({ id: actors.id, name: actors.name, actorType: actors.actorType })
      .from(actors)
      .orderBy(asc(actors.id))
      .all(),
})

export const createAgentActor = defineOperation({
  name: 'create_agent_actor',
  routes: ['web'],
  requires: [],
  returns: [],
  entity: 'actor',
  input: createAgentActorInput,
  run: (ctx, input) => {
    const actor = ctx.db
      .insert(actors)
      .values({
        actorType: 'agent',
        name: input.name,
        permProject: input.permissions.project,
        permTask: input.permissions.task,
        permDocument: input.permissions.document,
        permInbox: input.permissions.inbox,
      })
      .returning()
      .get()
    recordActivities(ctx, [
      {
        eventType: 'actor.created',
        entityType: 'actor',
        entityId: actor.id,
        projectId: null,
        before: {},
        after: { actorType: actor.actorType, name: actor.name, permissions: permissionsOf(actor) },
      },
    ])
    return actor
  },
})

export const updateAgentPermissions = defineOperation({
  name: 'update_agent_permissions',
  routes: ['web'],
  requires: [],
  returns: [],
  entity: 'actor',
  input: updateAgentPermissionsInput,
  run: (ctx, input) => {
    const actor = ctx.db.select().from(actors).where(eq(actors.id, input.id)).get()
    if (!actor) throw new NotFoundError(`actor:${input.id} が見つかりません`)
    checkCanChangeAgentPermissions(actor)
    const updated = ctx.db
      .update(actors)
      .set({
        permProject: input.permissions.project,
        permTask: input.permissions.task,
        permDocument: input.permissions.document,
        permInbox: input.permissions.inbox,
      })
      .where(eq(actors.id, actor.id))
      .returning()
      .get()
    recordActivities(ctx, [
      {
        eventType: 'actor.permissions_changed',
        entityType: 'actor',
        entityId: actor.id,
        projectId: null,
        before: { permissions: permissionsOf(actor) },
        after: { permissions: permissionsOf(updated) },
      },
    ])
    return updated
  },
})

export const listActorTokens = defineOperation({
  name: 'list_actor_tokens',
  routes: ['web'],
  requires: [],
  returns: [],
  entity: 'token',
  input: actorIdInput,
  run: (ctx, input) => {
    const actor = ctx.db.select().from(actors).where(eq(actors.id, input.id)).get()
    if (!actor) throw new NotFoundError(`actor:${input.id} が見つかりません`)
    checkAgentActor(actor)
    return ctx.db
      .select({
        id: tokens.id,
        actorId: tokens.actorId,
        issuedAt: tokens.issuedAt,
        revokedAt: tokens.revokedAt,
      })
      .from(tokens)
      .where(eq(tokens.actorId, input.id))
      .orderBy(asc(tokens.id))
      .all()
  },
})

export const issueToken = defineOperation({
  name: 'issue_token',
  routes: ['web'],
  requires: [],
  returns: [],
  entity: 'token',
  input: actorIdInput,
  run: (ctx, input) => {
    const actor = ctx.db.select().from(actors).where(eq(actors.id, input.id)).get()
    if (!actor) throw new NotFoundError(`actor:${input.id} が見つかりません`)
    checkCanIssueToken(actor)
    const token = randomBytes(32).toString('base64url')
    const issued = ctx.db
      .insert(tokens)
      .values({ actorId: actor.id, tokenHash: hashSecret(token), issuedAt: ctx.now })
      .returning()
      .get()
    recordActivities(ctx, [
      {
        eventType: 'token.issued',
        entityType: 'token',
        entityId: issued.id,
        projectId: null,
        before: {},
        after: { actorId: actor.id, issuedAt: issued.issuedAt },
      },
    ])
    return {
      id: issued.id,
      actorId: issued.actorId,
      issuedAt: issued.issuedAt,
      revokedAt: issued.revokedAt,
      token,
    }
  },
})

export const revokeToken = defineOperation({
  name: 'revoke_token',
  routes: ['web'],
  requires: [],
  returns: [],
  entity: 'token',
  input: tokenIdInput,
  run: (ctx, input) => {
    const token = ctx.db.select().from(tokens).where(eq(tokens.id, input.id)).get()
    if (!token) throw new NotFoundError(`token:${input.id} が見つかりません`)
    if (token.revokedAt !== null)
      throw new NotAllowedError(`token:${input.id} はすでに失効しています`)
    const revoked = ctx.db
      .update(tokens)
      .set({ revokedAt: ctx.now })
      .where(eq(tokens.id, token.id))
      .returning()
      .get()
    recordActivities(ctx, [
      {
        eventType: 'token.revoked',
        entityType: 'token',
        entityId: token.id,
        projectId: null,
        before: { revokedAt: null },
        after: { revokedAt: revoked.revokedAt },
      },
    ])
    return revoked
  },
})
