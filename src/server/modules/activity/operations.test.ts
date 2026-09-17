import { describe, expect, it } from 'vitest'
import { createTestDatabase } from '../../testing/db.js'
import { ctxFor, insertActor, insertProject, insertToken } from '../../testing/fixtures.js'
import {
  getActorActivities,
  getEntityActivities,
  getProjectActivities,
  recordActivities,
} from './operations.js'

describe('Activity の記録と取得', () => {
  it('Actor・経路・変更前後・発生日時を記録する', async () => {
    const database = await createTestDatabase()
    const actor = insertActor(database, { name: '実装エージェント' })
    const ctx = ctxFor(database, actor, 'mcp')

    recordActivities(ctx, [
      {
        eventType: 'task.blocked',
        entityType: 'task',
        entityId: 10,
        projectId: null,
        before: { status: 'in_progress', blockedReason: '' },
        after: { status: 'blocked', blockedReason: '判断が必要' },
      },
    ])

    expect(getEntityActivities(ctx, { entityType: 'task', entityId: 10 }).items).toEqual([
      expect.objectContaining({
        eventType: 'task.blocked',
        actorId: actor.id,
        source: 'mcp',
        before: { status: 'in_progress', blockedReason: '' },
        after: { status: 'blocked', blockedReason: '判断が必要' },
        occurredAt: ctx.now,
      }),
    ])
  })

  it('対象単位では id 昇順でページングし、切り出す前の総件数を返す', async () => {
    const database = await createTestDatabase()
    const ctx = ctxFor(database, insertActor(database))
    recordActivities(
      ctx,
      [1, 2, 3].map((id) => ({
        eventType: 'task.created' as const,
        entityType: 'task' as const,
        entityId: 20,
        projectId: null,
        before: {},
        after: { sequence: id },
      })),
    )

    const page = getEntityActivities(ctx, {
      entityType: 'task',
      entityId: 20,
      limit: 1,
      offset: 1,
    })
    expect(page.total).toBe(3)
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.after).toEqual({ sequence: 2 })
  })

  it('Project 単位では Project 自身と記録時点で所属する Task を返す', async () => {
    const database = await createTestDatabase()
    const ctx = ctxFor(database, insertActor(database))
    const projectId = insertProject(database)
    recordActivities(ctx, [
      {
        eventType: 'project.created',
        entityType: 'project',
        entityId: projectId,
        projectId,
        before: {},
        after: { name: 'Project' },
      },
      {
        eventType: 'task.created',
        entityType: 'task',
        entityId: 1,
        projectId,
        before: {},
        after: { title: 'Task' },
      },
      {
        eventType: 'task.created',
        entityType: 'task',
        entityId: 2,
        projectId: null,
        before: {},
        after: { title: '別の Task' },
      },
    ])

    const page = getProjectActivities(ctx, { projectId })
    expect(page.total).toBe(2)
    expect(page.items.map((item) => item.entityType)).toEqual(['project', 'task'])
  })

  it('Actor 自身と、その Actor に属する Token の記録だけをまとめて返す', async () => {
    const database = await createTestDatabase()
    const ctx = ctxFor(database, insertActor(database))
    const target = insertActor(database)
    insertToken(database, target)
    const other = insertActor(database)
    insertToken(database, other)
    recordActivities(ctx, [
      {
        eventType: 'actor.created',
        entityType: 'actor',
        entityId: target.id,
        projectId: null,
        before: {},
        after: { name: 'agent' },
      },
      {
        eventType: 'token.issued',
        entityType: 'token',
        entityId: 1,
        projectId: null,
        before: {},
        after: { actorId: target.id },
      },
      {
        eventType: 'token.issued',
        entityType: 'token',
        entityId: 2,
        projectId: null,
        before: {},
        after: { actorId: other.id },
      },
    ])

    const page = getActorActivities(ctx, { actorId: target.id })
    expect(page.total).toBe(2)
    expect(page.items.map((item) => [item.entityType, item.entityId])).toEqual([
      ['actor', target.id],
      ['token', 1],
    ])
  })

  it('不正な記録が混ざると1件も書かない', async () => {
    const database = await createTestDatabase()
    const ctx = ctxFor(database, insertActor(database))

    expect(() =>
      recordActivities(ctx, [
        {
          eventType: 'task.created',
          entityType: 'task',
          entityId: 1,
          projectId: null,
          before: {},
          after: {},
        },
        {
          eventType: 'project.created',
          entityType: 'task',
          entityId: 2,
          projectId: null,
          before: {},
          after: {},
        },
      ]),
    ).toThrow()
    expect(getEntityActivities(ctx, { entityType: 'task', entityId: 1 }).total).toBe(0)
  })
})
