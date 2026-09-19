import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { NotAllowedError } from '../../core/errors.js'
import type { Ctx } from '../../core/operation.js'
import type { Database } from '../../db/connection.js'
import { ctxFor, insertActor } from '../../testing/fixtures.js'
import { expectRecorded } from '../../testing/recorded.js'
import { activities } from '../activity/schema.js'
import { tokens } from './schema.js'
import {
  authenticateToken,
  createAgentActor,
  issueToken,
  listActorTokens,
  listActors,
  LoginFailureTracker,
  revokeToken,
  updateAgentPermissions,
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
