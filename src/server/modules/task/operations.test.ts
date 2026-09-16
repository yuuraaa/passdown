import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { ConflictError, NotAllowedError, NotFoundError } from '../../core/errors.js'
import type { Ctx, Db } from '../../core/operation.js'
import type { Database } from '../../db/connection.js'
import { createTestDatabase } from '../../testing/db.js'
import { ctxFor, insertActor, insertProject } from '../../testing/fixtures.js'
import { changedTables, expectRecorded, snapshotTables } from '../../testing/recorded.js'
import { activities } from '../activity/schema.js'
import { createTask, startTask } from './operations.js'
import { tasks } from './schema.js'

let database: Database
let ctx: Ctx

beforeEach(async () => {
  database = await createTestDatabase()
  ctx = ctxFor(database, insertActor(database, { actorType: 'human' }), 'mcp')
})

const create = (input: Parameters<typeof createTask>[1]) =>
  expectRecorded(database, () => createTask(ctx, input))
const start = (id: number) => expectRecorded(database, () => startTask(ctx, { id }))

function activitiesOf(taskId: number) {
  return database.db
    .select()
    .from(activities)
    .where(eq(activities.entityId, taskId))
    .orderBy(activities.id)
    .all()
}

function readTask(id: number) {
  return database.db.select().from(tasks).where(eq(tasks.id, id)).get()
}

function expectNothingWritten(call: () => unknown, error: new (...args: never[]) => Error) {
  const before = snapshotTables(database)
  expect(call).toThrow(error)
  expect(changedTables(before, snapshotTables(database))).toEqual([])
}

describe('createTask', () => {
  it('todo の Task を作り、作成した項目を Activity に記録する', () => {
    const assignee = insertActor(database)
    const projectId = insertProject(database)
    const task = create({
      title: 'やること',
      description: '説明',
      acceptanceCriteria: '条件',
      priority: 'high',
      links: ['https://example.com/pr/1'],
      assigneeId: assignee.id,
      projectId,
    })

    expect(task).toMatchObject({
      status: 'todo',
      priority: 'high',
      projectId,
      parentId: null,
      assigneeId: assignee.id,
      links: ['https://example.com/pr/1'],
      createdBy: ctx.actor.id,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      version: 1,
    })
    expect(activitiesOf(task.id)).toMatchObject([
      {
        eventType: 'task.created',
        entityType: 'task',
        entityId: task.id,
        projectId,
        actorId: ctx.actor.id,
        source: 'mcp',
        before: {},
        after: {
          title: 'やること',
          description: '説明',
          acceptanceCriteria: '条件',
          status: 'todo',
          priority: 'high',
          projectId,
          parentId: null,
          assigneeId: assignee.id,
          links: ['https://example.com/pr/1'],
        },
        occurredAt: ctx.now,
      },
    ])
  })

  it('子 Task は、指定しなければ親の Project に属する', () => {
    const projectId = insertProject(database)
    const parent = create({ title: '親', projectId })
    const child = create({ title: '子', parentId: parent.id })
    expect(child).toMatchObject({ parentId: parent.id, projectId })
  })

  it('親と違う Project は指定できない', () => {
    const parent = create({ title: '親', projectId: insertProject(database) })
    const other = insertProject(database)
    expectNothingWritten(
      () => createTask(ctx, { title: '子', parentId: parent.id, projectId: other }),
      NotAllowedError,
    )
  })

  it('in_progress の親には子を追加できる', () => {
    const parent = create({ title: '親' })
    start(parent.id)
    expect(create({ title: '子', parentId: parent.id }).parentId).toBe(parent.id)
  })

  it.each(['done', 'archived'] as const)('%s の Project には作成できない', (status) => {
    const projectId = insertProject(database, status)
    expectNothingWritten(() => createTask(ctx, { title: 't', projectId }), NotAllowedError)
  })

  it.each([
    ['親 Task', { parentId: 999 }],
    ['Project', { projectId: 999 }],
    ['担当', { assigneeId: 999 }],
  ])('存在しない%sは見つからない', (_label, ids) => {
    expectNothingWritten(() => createTask(ctx, { title: 't', ...ids }), NotFoundError)
  })
})

describe('startTask', () => {
  it('todo の Task を in_progress にし、version を上げ、状態の変化を記録する', () => {
    const task = create({ title: 't' })
    const started = start(task.id)

    expect(started).toMatchObject({ status: 'in_progress', version: 2, updatedAt: ctx.now })
    expect(activitiesOf(task.id).at(-1)).toMatchObject({
      eventType: 'task.started',
      actorId: ctx.actor.id,
      source: 'mcp',
      before: { status: 'todo' },
      after: { status: 'in_progress' },
    })
  })

  it('二重に着手すると操作できない', () => {
    const task = create({ title: 't' })
    start(task.id)
    expectNothingWritten(() => startTask(ctx, { id: task.id }), NotAllowedError)
  })

  it('todo の祖先を上へたどって自動で in_progress にし、起点の Actor・経路で1件ずつ記録する', () => {
    const projectId = insertProject(database)
    const root = create({ title: '最上位', projectId })
    const parent = create({ title: '親', parentId: root.id })
    const child = create({ title: '子', parentId: parent.id })

    start(child.id)

    for (const t of [root, parent]) {
      expect(readTask(t.id)).toMatchObject({ status: 'in_progress', version: 2 })
      expect(activitiesOf(t.id).at(-1)).toMatchObject({
        eventType: 'task.auto_started',
        projectId,
        actorId: ctx.actor.id,
        source: 'mcp',
        before: { status: 'todo' },
        after: { status: 'in_progress' },
      })
    }
  })

  it('in_progress の親より上へは連動しない', () => {
    const root = create({ title: '最上位' })
    const parent = create({ title: '親', parentId: root.id })
    start(parent.id)
    // 最上位を todo に戻した状態を作る（todo に戻す操作は別の Task で作る）
    database.db.update(tasks).set({ status: 'todo' }).where(eq(tasks.id, root.id)).run()
    const child = create({ title: '子', parentId: parent.id })

    start(child.id)

    expect(readTask(root.id)?.status).toBe('todo')
    expect(readTask(parent.id)?.status).toBe('in_progress')
  })

  it('読んでから書くまでに version が変わっていたら競合にし、何も書かない', () => {
    const task = create({ title: 't' })
    // 最初の UPDATE の直前に、ほかの操作が version を上げたことにする
    let interfered = false
    const interfere = (db: Db): Db =>
      new Proxy(db, {
        get(target, prop, receiver) {
          if (prop === 'update' && !interfered) {
            interfered = true
            database.sqlite.prepare('update tasks set version = version + 1').run()
          }
          if (prop === 'transaction') {
            return (run: (tx: Db) => unknown) => target.transaction((tx) => run(interfere(tx)))
          }
          return Reflect.get(target, prop, receiver) as unknown
        },
      })
    const concurrent: Ctx = { ...ctx, db: interfere(ctx.db) }
    const before = snapshotTables(database)
    expect(() => startTask(concurrent, { id: task.id })).toThrow(ConflictError)
    expect(changedTables(before, snapshotTables(database))).toEqual([])
  })

  it('存在しない Task は見つからない', () => {
    expectNothingWritten(() => startTask(ctx, { id: 999 }), NotFoundError)
  })
})
