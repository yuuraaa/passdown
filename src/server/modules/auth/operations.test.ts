import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { NotAllowedError, NotFoundError } from '../../core/errors.js'
import type { Ctx } from '../../core/operation.js'
import { formatDatetime } from '../../core/time.js'
import type { Database } from '../../db/connection.js'
import { ctxFor, insertActor } from '../../testing/fixtures.js'
import { expectRecorded } from '../../testing/recorded.js'
import { activities } from '../activity/schema.js'
import { humanCredentials, sessions, tokens } from './schema.js'
import {
  authenticateToken,
  createHumanAccount,
  createAgentActor,
  getAgentActor,
  issueToken,
  listActorTokens,
  listActors,
  LoginFailureTracker,
  revokeToken,
  resetHumanPassword,
  updateAgentPermissions,
  login,
} from './operations.js'
import { createTestDatabase } from '../../testing/db.js'

let database: Database
let ctx: Ctx

beforeEach(async () => {
  database = await createTestDatabase()
  ctx = ctxFor(database, insertActor(database, { actorType: 'human' }))
})

describe('agent Actor と Token', () => {
  it('agent Actor を作り、権限を Activity に記録する', () => {
    const actor = expectRecorded(database, () =>
      createAgentActor(ctx, {
        name: 'Codex',
        permissions: { project: 'read', task: 'readwrite', document: 'none', inbox: 'read' },
      }),
    )
    expect(actor).toMatchObject({ actorType: 'agent', name: 'Codex', permTask: 'readwrite' })
    expect(
      database.db.select().from(activities).where(eq(activities.entityId, actor.id)).get(),
    ).toMatchObject({
      eventType: 'actor.created',
      after: {
        permissions: { project: 'read', task: 'readwrite', document: 'none', inbox: 'read' },
      },
    })
  })

  it('トークンは一度だけ平文で返し、ハッシュだけを保存して失効できる', () => {
    const agent = insertActor(database)
    const issued = expectRecorded(database, () => issueToken(ctx, { id: agent.id }))
    expect(issued.token).toBeTruthy()
    expect(JSON.stringify(issued)).not.toContain('tokenHash')
    expect(
      database.db.select().from(tokens).where(eq(tokens.id, issued.id)).get()?.tokenHash,
    ).not.toBe(issued.token)
    expect(authenticateToken(database.db, issued.token)).toMatchObject({ id: agent.id })

    expectRecorded(database, () => revokeToken(ctx, { id: issued.id }))
    expect(authenticateToken(database.db, issued.token)).toBeNull()
  })

  it('human には agent 用トークンの発行も権限変更も許可しない', () => {
    expect(() => issueToken(ctx, { id: ctx.actor.id })).toThrow(NotAllowedError)
    expect(() => listActorTokens(ctx, { id: ctx.actor.id })).toThrow(NotAllowedError)
    expect(() =>
      updateAgentPermissions(ctx, {
        id: ctx.actor.id,
        permissions: { project: 'none', task: 'none', document: 'none', inbox: 'none' },
      }),
    ).toThrow(NotAllowedError)
  })

  it('権限変更は既発行トークンの認証結果へ直ちに反映される', () => {
    const agent = insertActor(database, { permissions: { task: 'read' } })
    const issued = issueToken(ctx, { id: agent.id })
    updateAgentPermissions(ctx, {
      id: agent.id,
      permissions: { project: 'none', task: 'readwrite', document: 'none', inbox: 'none' },
    })
    expect(authenticateToken(database.db, issued.token)?.permissions.task).toBe('readwrite')
  })

  it('担当候補は名前と種別だけを返す', () => {
    const result = listActors(ctx, {})
    expect(result).toEqual([{ id: ctx.actor.id, name: ctx.actor.name, actorType: 'human' }])
  })

  it('agent Actor の現在の権限を Settings 用に取得する', () => {
    const agent = insertActor(database, {
      name: 'Codex',
      permissions: { project: 'read', task: 'readwrite', document: 'none', inbox: 'read' },
    })

    expect(getAgentActor(ctx, { id: agent.id })).toEqual({
      id: agent.id,
      name: 'Codex',
      actorType: 'agent',
      permissions: { project: 'read', task: 'readwrite', document: 'none', inbox: 'read' },
    })
  })

  it('human または存在しない Actor の詳細取得を拒否する', () => {
    expect(() => getAgentActor(ctx, { id: ctx.actor.id })).toThrow(NotAllowedError)
    expect(() => getAgentActor(ctx, { id: 999 })).toThrow(NotFoundError)
  })
})

describe('LoginFailureTracker', () => {
  it('失敗ごとに遅延を増やし、成功・時間切れでリセットする', async () => {
    const delays: number[] = []
    const tracker = new LoginFailureTracker((delay) => {
      delays.push(delay)
      return Promise.resolve()
    })
    const now = new Date('2026-09-16T12:00:00.000+09:00')
    await tracker.fail('owner', now)
    await tracker.fail('owner', now)
    tracker.succeed('owner')
    await tracker.fail('owner', now)
    await tracker.fail('owner', new Date(now.getTime() + 31 * 60 * 1000))
    expect(delays).toEqual([1000, 2000, 1000, 1000])
  })

  it('遅延は30秒で頭打ちになる', async () => {
    const delays: number[] = []
    const tracker = new LoginFailureTracker((delay) => {
      delays.push(delay)
      return Promise.resolve()
    })
    const now = new Date('2026-09-16T12:00:00.000+09:00')
    for (let count = 0; count < 8; count += 1) await tracker.fail('owner', now)
    expect(delays.at(-1)).toBe(30_000)
  })
})

describe('CLI 用 human アカウント操作', () => {
  it('human と credential を作成し、表示名・ハッシュ・ログインを確認できる', async () => {
    const actor = await createHumanAccount(database.db, {
      loginName: 'owner',
      name: 'オーナー',
      password: 'correct horse battery staple',
    })
    expect(actor).toMatchObject({ actorType: 'human', name: 'オーナー' })
    expect(actor).toMatchObject({
      permProject: 'readwrite',
      permTask: 'readwrite',
      permDocument: 'readwrite',
      permInbox: 'readwrite',
    })
    const credential = database.db.select().from(humanCredentials).get()
    expect(credential).toMatchObject({ actorId: actor.id, loginName: 'owner' })
    expect(credential?.passwordHash).toMatch(/^scrypt\$131072\$8\$1\$/)
    expect(credential?.passwordHash).not.toContain('correct horse battery staple')
    await expect(
      login(
        database.db,
        { loginName: 'owner', password: 'correct horse battery staple' },
        formatDatetime(new Date('2026-09-16T03:00:00+09:00')),
      ),
    ).resolves.toMatchObject({
      actor: { id: actor.id },
    })
    expect(database.db.select().from(activities).all()).toEqual([])
  })

  it('重複したログイン名では Actor も credential も追加しない', async () => {
    await createHumanAccount(database.db, {
      loginName: 'owner',
      name: 'owner',
      password: 'password',
    })
    await expect(
      createHumanAccount(database.db, {
        loginName: 'owner',
        name: 'another',
        password: 'password',
      }),
    ).rejects.toThrow()
    expect(database.db.select().from(humanCredentials).all()).toHaveLength(1)
    expect(database.db.select().from(activities).all()).toEqual([])
    expect(database.db.select().from(sessions).all()).toEqual([])
  })

  it('パスワード再設定で全セッションを削除し、新しいパスワードだけを受け付ける', async () => {
    const actor = await createHumanAccount(database.db, {
      loginName: 'owner',
      name: 'owner',
      password: 'old-password',
    })
    const first = await login(
      database.db,
      { loginName: 'owner', password: 'old-password' },
      formatDatetime(new Date('2026-09-16T03:00:00+09:00')),
    )
    const second = await login(
      database.db,
      { loginName: 'owner', password: 'old-password' },
      formatDatetime(new Date('2026-09-16T03:01:00+09:00')),
    )
    expect(first?.actor.id).toBe(actor.id)
    expect(second?.actor.id).toBe(actor.id)
    await resetHumanPassword(database.db, { loginName: 'owner', password: 'new-password' })
    expect(database.db.select().from(sessions).all()).toEqual([])
    await expect(
      login(
        database.db,
        { loginName: 'owner', password: 'old-password' },
        formatDatetime(new Date('2026-09-16T03:02:00+09:00')),
      ),
    ).resolves.toBeNull()
    await expect(
      login(
        database.db,
        { loginName: 'owner', password: 'new-password' },
        formatDatetime(new Date('2026-09-16T03:02:00+09:00')),
      ),
    ).resolves.toMatchObject({
      actor: { id: actor.id },
    })
    expect(database.db.select().from(activities).all()).toEqual([])
  })
})
