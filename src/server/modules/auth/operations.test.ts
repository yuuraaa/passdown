import {
  createTask,
  addTaskComment,
  startTask,
  requestTaskReview,
  approveTask,
  getTaskOperation,
} from '../task/index.js'
import { tasks } from '../task/schema.js'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { NotAllowedError, NotFoundError } from '../../core/errors.js'
import type { Ctx } from '../../core/operation.js'
import { formatDatetime } from '../../core/time.js'
import type { Database } from '../../db/connection.js'
import { ctxFor, insertActor } from '../../testing/fixtures.js'
import { expectRecorded } from '../../testing/recorded.js'
import { activities } from '../activity/schema.js'
import { actors, humanCredentials, sessions, tokens } from './schema.js'
import {
  authenticateToken,
  renameAgentActor,
  archiveAgentActor,
  listActorDirectory,
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
    expect(result).toEqual([
      { id: ctx.actor.id, name: ctx.actor.name, actorType: 'human', status: 'active' },
    ])
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
      status: 'active',
      unfinishedTaskCount: 0,
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

describe('エージェントの名前変更と削除', () => {
  it('空・重複・human の名前変更を拒否し、IDとトークンを維持する', () => {
    const agent = insertActor(database, { name: '変更前' })
    const token = issueToken(ctx, { id: agent.id })
    expect(() => renameAgentActor(ctx, { id: agent.id, name: ' ' })).toThrow()
    expect(() => renameAgentActor(ctx, { id: agent.id, name: ctx.actor.name })).toThrow(
      NotAllowedError,
    )
    expect(() => renameAgentActor(ctx, { id: ctx.actor.id, name: '変更' })).toThrow(NotAllowedError)
    expect(renameAgentActor(ctx, { id: agent.id, name: '変更後' })).toMatchObject({
      id: agent.id,
      name: '変更後',
    })
    expect(authenticateToken(database.db, token.token)).toMatchObject({
      id: agent.id,
      name: '変更後',
    })
    expect(
      database.db.select().from(activities).where(eq(activities.eventType, 'actor.renamed')).get(),
    ).toMatchObject({ before: { name: '変更前' }, after: { name: '変更後' } })
  })

  it('同意なしでは変更せず、同意後は未完了だけ解除し、履歴と完了担当を保持する', () => {
    const agent = insertActor(database, { name: '削除対象' })
    const first = issueToken(ctx, { id: agent.id })
    const second = issueToken(ctx, { id: agent.id })
    const old = issueToken(ctx, { id: agent.id })
    const oldTime = '2026-09-15T12:00:00.000+09:00'
    revokeToken({ ...ctx, now: oldTime }, { id: old.id })
    const open = createTask(ctx, { title: '未完了', assigneeId: agent.id })
    const done = createTask(ctxFor(database, agent), { title: '完了', assigneeId: agent.id })
    addTaskComment(ctxFor(database, agent), { id: done.id, body: '履歴' })
    startTask(ctx, { id: done.id })
    requestTaskReview(ctx, { id: done.id, result: '成果' })
    approveTask(ctx, { id: done.id })
    const recorded = database.db.select().from(activities).all().length
    expect(() => archiveAgentActor(ctx, { id: agent.id })).toThrow(NotAllowedError)
    expect(authenticateToken(database.db, first.token)).not.toBeNull()
    expect(database.db.select().from(activities).all()).toHaveLength(recorded)
    archiveAgentActor(ctx, { id: agent.id, unassignTasks: true })
    expect(database.db.select().from(tasks).where(eq(tasks.id, open.id)).get()).toMatchObject({
      assigneeId: null,
      version: open.version + 1,
      updatedAt: ctx.now,
      status: 'todo',
    })
    expect(getTaskOperation(ctx, { id: done.id })).toMatchObject({
      assigneeId: agent.id,
      createdBy: agent.id,
      comments: [{ createdBy: agent.id, body: '履歴' }],
    })
    expect(authenticateToken(database.db, first.token)).toBeNull()
    expect(authenticateToken(database.db, second.token)).toBeNull()
    expect(database.db.select().from(tokens).where(eq(tokens.id, old.id)).get()?.revokedAt).toBe(
      oldTime,
    )
    expect(listActors(ctx, {}).some((a) => a.id === agent.id)).toBe(false)
    expect(listActorDirectory(ctx, {})).toContainEqual({
      id: agent.id,
      name: agent.name,
      actorType: 'agent',
      status: 'archived',
    })
    expect(() => issueToken(ctx, { id: agent.id })).toThrow(NotAllowedError)
    expect(() => renameAgentActor(ctx, { id: agent.id, name: '再変更' })).toThrow(NotAllowedError)
    expect(() => archiveAgentActor(ctx, { id: agent.id })).toThrow(NotAllowedError)
    expect(() =>
      updateAgentPermissions(ctx, { id: agent.id, permissions: agent.permissions }),
    ).toThrow(NotAllowedError)
    expect(() => createTask(ctx, { title: '再割当', assigneeId: agent.id })).toThrow(
      NotAllowedError,
    )
    const replacement = createAgentActor(ctx, { name: agent.name, permissions: agent.permissions })
    expect(replacement.id).not.toBe(agent.id)
    expect(
      database.db
        .select()
        .from(activities)
        .where(eq(activities.eventType, 'task.auto_assignee_changed'))
        .get(),
    ).toMatchObject({
      entityId: open.id,
      actorId: ctx.actor.id,
      before: { assigneeId: agent.id },
      after: { assigneeId: null },
    })
  })

  it('履歴記録の失敗時は担当解除・トークン失効・削除をすべてロールバックする', () => {
    const agent = insertActor(database)
    const token = issueToken(ctx, { id: agent.id })
    const task = createTask(ctx, { title: 'ロールバック', assigneeId: agent.id })
    database.sqlite.exec(
      "CREATE TRIGGER reject_archive BEFORE INSERT ON activities WHEN NEW.event_type = 'actor.archived' BEGIN SELECT RAISE(ABORT, 'テスト用の失敗'); END",
    )
    expect(() => archiveAgentActor(ctx, { id: agent.id, unassignTasks: true })).toThrow()
    expect(database.db.select().from(actors).where(eq(actors.id, agent.id)).get()?.status).toBe(
      'active',
    )
    expect(authenticateToken(database.db, token.token)).not.toBeNull()
    expect(database.db.select().from(tasks).where(eq(tasks.id, task.id)).get()).toEqual(task)
    expect(
      database.db
        .select()
        .from(activities)
        .where(eq(activities.eventType, 'task.auto_assignee_changed'))
        .all(),
    ).toEqual([])
  })

  it('認証済みの操作は削除後も実行できるが次の認証は拒否する', () => {
    const agent = insertActor(database)
    const token = issueToken(ctx, { id: agent.id })
    const authenticated = authenticateToken(database.db, token.token)!
    archiveAgentActor(ctx, { id: agent.id })
    expect(
      createTask({ ...ctx, actor: authenticated, source: 'mcp' }, { title: '認証済み' }).createdBy,
    ).toBe(agent.id)
    expect(authenticateToken(database.db, token.token)).toBeNull()
  })
})

it.each(['todo', 'in_progress', 'blocked', 'review', 'done', 'cancelled'] as const)(
  '削除時の担当解除は %s の状態を判定する',
  (state) => {
    const agent = insertActor(database)
    const task = createTask(ctx, { title: '状態ごとの確認', assigneeId: agent.id })
    database.db.update(tasks).set({ status: state }).where(eq(tasks.id, task.id)).run()
    archiveAgentActor(ctx, { id: agent.id, unassignTasks: true })
    const saved = database.db.select().from(tasks).where(eq(tasks.id, task.id)).get()!
    const finished = state === 'done' || state === 'cancelled'
    expect(saved.assigneeId).toBe(finished ? agent.id : null)
    expect(saved.version).toBe(task.version + (finished ? 0 : 1))
    expect(saved.status).toBe(state)
  },
)

it('未失効のトークンでも削除状態なら認証を拒否し、humanは削除できない', () => {
  const agent = insertActor(database)
  const token = issueToken(ctx, { id: agent.id })
  database.db.update(actors).set({ status: 'archived' }).where(eq(actors.id, agent.id)).run()
  expect(authenticateToken(database.db, token.token)).toBeNull()
  expect(() => archiveAgentActor(ctx, { id: ctx.actor.id })).toThrow(NotAllowedError)
})
