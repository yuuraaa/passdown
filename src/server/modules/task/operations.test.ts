import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { ConflictError, NotAllowedError, NotFoundError } from '../../core/errors.js'
import type { Ctx, Db } from '../../core/operation.js'
import type { Database } from '../../db/connection.js'
import { createTestDatabase } from '../../testing/db.js'
import { ctxFor, insertActor, insertProject } from '../../testing/fixtures.js'
import { changedTables, expectRecorded, snapshotTables } from '../../testing/recorded.js'
import { activities } from '../activity/schema.js'
import { createDocument } from '../document/index.js'
import { documents } from '../document/schema.js'
import {
  addTaskComment,
  blockTask,
  cancelTask,
  cancelUnfinishedProjectTasks,
  createTask,
  getTasksReferencingDocument,
  getTaskOperation,
  getUnfinishedProjectTasks,
  hasUnfinishedProjectTasks,
  requestTaskReview,
  returnTaskToTodo,
  startTask,
  updateTask,
} from './operations.js'
import { taskComments, taskDocuments, tasks } from './schema.js'

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

describe('Task の更新・完了処理', () => {
  const updateInput = (task: { id: number; version: number }) => ({
    id: task.id,
    title: '更新後',
    description: '',
    acceptanceCriteria: '',
    priority: 'normal' as const,
    links: [],
    assigneeId: null,
    parentId: null,
    projectId: null,
    documentIds: [],
    version: task.version,
  })

  it('最上位 Task の Project 変更は全子孫へ追随し、auto_moved を記録する', () => {
    const root = create({ title: 'root' })
    const child = create({ title: 'child', parentId: root.id })
    const grandchild = create({ title: 'grandchild', parentId: child.id })
    const projectId = insertProject(database)

    updateTask(ctx, { ...updateInput(root), projectId })

    for (const task of [child, grandchild]) {
      expect(readTask(task.id)).toMatchObject({ projectId })
      expect(activitiesOf(task.id).at(-1)).toMatchObject({
        eventType: 'task.auto_moved',
        before: { projectId: null },
        after: { projectId },
      })
    }
  })

  it('in_progress の Task を todo の親へ付けると親を自動で着手する', () => {
    const parent = create({ title: '親' })
    const child = create({ title: '子' })
    start(child.id)

    updateTask(ctx, { ...updateInput(readTask(child.id)!), parentId: parent.id })

    expect(readTask(parent.id)).toMatchObject({ status: 'in_progress' })
    expect(activitiesOf(parent.id).at(-1)).toMatchObject({ eventType: 'task.auto_started' })
  })

  it('Document の参照差分を保存し、追加・削除の Activity を記録する', () => {
    const task = create({ title: 't' })
    const first = createDocument(ctx, { title: 'first' })
    const second = createDocument(ctx, { title: 'second' })
    const linked = updateTask(ctx, { ...updateInput(task), documentIds: [first.id] })
    updateTask(ctx, { ...updateInput(linked), documentIds: [second.id] })

    expect(
      database.db.select().from(taskDocuments).where(eq(taskDocuments.taskId, task.id)).all(),
    ).toEqual([{ taskId: task.id, documentId: second.id }])
    expect(activitiesOf(task.id).map((a) => a.eventType)).toContain('task.document_linked')
    expect(activitiesOf(task.id).map((a) => a.eventType)).toContain('task.document_unlinked')
  })

  it('Web の詳細には archived Document を残し、MCP の詳細からは除く', () => {
    const task = create({ title: 't' })
    const active = createDocument(ctx, { title: 'active' })
    const archived = createDocument(ctx, { title: 'archived' })
    const updated = updateTask(ctx, { ...updateInput(task), documentIds: [active.id, archived.id] })
    database.db
      .update(documents)
      .set({ status: 'archived' })
      .where(eq(documents.id, archived.id))
      .run()

    expect(getTaskOperation(ctxFor(database, ctx.actor, 'web'), { id: updated.id }).documents).toHaveLength(
      2,
    )
    expect(getTaskOperation(ctx, { id: updated.id }).documents).toEqual([
      expect.objectContaining({ id: active.id, status: 'active' }),
    ])
  })

  it('コメントだけでは version を上げず、todo 復帰ではコメントと blockedReason の消去を行う', () => {
    const task = create({ title: 't' })
    start(task.id)
    const blocked = blockTask(ctx, { id: task.id, blockedReason: '確認が必要' })
    addTaskComment(ctx, { id: task.id, body: '途中経過' })
    expect(readTask(task.id)?.version).toBe(blocked.version)

    const returned = returnTaskToTodo(ctx, { id: task.id, body: '回答です' })
    expect(returned).toMatchObject({
      status: 'todo',
      blockedReason: '',
      version: blocked.version + 1,
    })
    expect(
      database.db.select().from(taskComments).where(eq(taskComments.taskId, task.id)).all(),
    ).toHaveLength(2)
  })

  it('未完了の子があれば review を拒否し、cancel は未完了の子孫だけを連動 cancel する', () => {
    const parent = create({ title: '親' })
    const active = create({ title: '作業中', parentId: parent.id })
    const finished = create({ title: '完了', parentId: parent.id })
    start(parent.id)
    expectNothingWritten(
      () => requestTaskReview(ctx, { id: parent.id, result: '成果' }),
      NotAllowedError,
    )

    database.db.update(tasks).set({ status: 'done' }).where(eq(tasks.id, finished.id)).run()
    const cancelled = cancelTask(ctx, { id: parent.id, result: '中止理由' })
    expect(cancelled.status).toBe('cancelled')
    expect(readTask(active.id)).toMatchObject({
      status: 'cancelled',
      result: '親 Task をやめたため',
    })
    expect(readTask(finished.id)?.status).toBe('done')
    expect(activitiesOf(active.id).at(-1)?.eventType).toBe('task.auto_cancelled')
  })

  it('version が古い更新は Task・参照・Activity を一切変更しない', () => {
    const task = create({ title: 't' })
    database.db
      .update(tasks)
      .set({ version: task.version + 1 })
      .where(eq(tasks.id, task.id))
      .run()
    const stale = updateInput(task)
    expectNothingWritten(() => updateTask(ctx, stale), ConflictError)
  })
})

describe('他モジュール向け公開 API', () => {
  it('Project の未完了 Task を優先度順に読み、完了判定に使える', () => {
    const projectId = insertProject(database)
    const low = create({ title: 'low', projectId, priority: 'low' })
    const high = create({ title: 'high', projectId, priority: 'high' })
    const done = create({ title: 'done', projectId })
    database.db.update(tasks).set({ status: 'done' }).where(eq(tasks.id, done.id)).run()

    expect(getUnfinishedProjectTasks(ctx, projectId).map((task) => task.id)).toEqual([
      high.id,
      low.id,
    ])
    expect(hasUnfinishedProjectTasks(ctx, projectId)).toBe(true)
  })

  it('Project archive 用の一括 cancel は未完了 Task だけを自動 cancel として記録する', () => {
    const projectId = insertProject(database)
    const open = create({ title: 'open', projectId })
    const done = create({ title: 'done', projectId })
    database.db.update(tasks).set({ status: 'done' }).where(eq(tasks.id, done.id)).run()

    cancelUnfinishedProjectTasks(ctx, projectId)

    expect(readTask(open.id)).toMatchObject({ status: 'cancelled', result: 'Project をやめたため' })
    expect(readTask(done.id)?.status).toBe('done')
    expect(activitiesOf(open.id).at(-1)).toMatchObject({ eventType: 'task.auto_cancelled' })
    expect(hasUnfinishedProjectTasks(ctx, projectId)).toBe(false)
  })

  it('Document の参照元として Task を ID 順で返す', () => {
    const first = create({ title: 'first' })
    const second = create({ title: 'second' })
    const document = createDocument(ctx, { title: '資料' })
    database.db
      .insert(taskDocuments)
      .values([
        { taskId: second.id, documentId: document.id },
        { taskId: first.id, documentId: document.id },
      ])
      .run()

    expect(getTasksReferencingDocument(ctx, document.id).map((task) => task.id)).toEqual([
      first.id,
      second.id,
    ])
  })
})
