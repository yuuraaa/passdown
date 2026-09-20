import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { ConflictError, ForbiddenError, NotAllowedError } from '../../core/errors.js'
import type { Ctx } from '../../core/operation.js'
import type { Database } from '../../db/connection.js'
import { createTestDatabase } from '../../testing/db.js'
import { changedTables, expectRecorded, snapshotTables } from '../../testing/recorded.js'
import { ctxFor, insertActor } from '../../testing/fixtures.js'
import { activities } from '../activity/schema.js'
import { documents } from '../document/schema.js'
import { projects } from '../project/schema.js'
import { tasks } from '../task/schema.js'
import {
  archiveInboxItem,
  captureInboxItem,
  convertInboxItem,
  getInboxItemOperation,
  getInboxItemActivities,
  listInboxItems,
  updateInboxItem,
} from './operations.js'
import { inboxItems } from './schema.js'

let database: Database
let ctx: Ctx

beforeEach(async () => {
  database = await createTestDatabase()
  ctx = ctxFor(database, insertActor(database), 'mcp')
})

const capture = (content = '思いつき') =>
  expectRecorded(database, () => captureInboxItem(ctx, { content }))

function expectNothingWritten(call: () => unknown, error: new (...args: never[]) => Error) {
  const before = snapshotTables(database)
  expect(call).toThrow(error)
  expect(changedTables(before, snapshotTables(database))).toEqual([])
}

describe('Inbox Item の操作', () => {
  it('取り込み、未整理の既定一覧、状態別一覧を扱う', () => {
    const first = capture('最初')
    const second = capture('次')
    archiveInboxItem(ctx, { id: first.id })

    expect(listInboxItems(ctx, {}).items.map((item) => item.id)).toEqual([second.id])
    expect(listInboxItems(ctx, { status: 'archived' }).items).toMatchObject([
      { id: first.id, content: '最初' },
    ])
  })

  it('状態に関係なく ID 指定で1件取得する', () => {
    const untriaged = capture('未整理')
    const triaged = capture('整理済み')
    const archived = capture('アーカイブ済み')
    convertInboxItem(ctx, {
      id: triaged.id,
      target: { targetType: 'task', target: { title: '変換先' } },
    })
    archiveInboxItem(ctx, { id: archived.id })

    expect(getInboxItemOperation(ctx, { id: untriaged.id })).toMatchObject({
      id: untriaged.id,
      status: 'untriaged',
    })
    expect(getInboxItemOperation(ctx, { id: triaged.id })).toMatchObject({
      id: triaged.id,
      status: 'triaged',
    })
    expect(getInboxItemOperation(ctx, { id: archived.id })).toMatchObject({
      id: archived.id,
      status: 'archived',
    })
  })

  it('本文を version 付きで更新し、競合時は何も書かない', () => {
    const item = capture()
    expect(
      updateInboxItem(ctx, { id: item.id, content: '更新後', version: item.version }),
    ).toMatchObject({
      content: '更新後',
      version: 2,
    })
    expectNothingWritten(
      () => updateInboxItem(ctx, { id: item.id, content: '失敗', version: item.version }),
      ConflictError,
    )
  })

  it('archive 後は更新・再 archive・変換できない', () => {
    const item = capture()
    expect(archiveInboxItem(ctx, { id: item.id })).toMatchObject({ status: 'archived', version: 2 })
    expectNothingWritten(
      () => updateInboxItem(ctx, { id: item.id, content: '変更', version: 2 }),
      NotAllowedError,
    )
    expectNothingWritten(() => archiveInboxItem(ctx, { id: item.id }), NotAllowedError)
    expectNothingWritten(
      () =>
        convertInboxItem(ctx, {
          id: item.id,
          target: { targetType: 'task', target: { title: 'Task' } },
        }),
      NotAllowedError,
    )
  })

  it.each([
    ['project', { name: 'Project' }, projects, 'project.created'],
    ['task', { title: 'Task' }, tasks, 'task.created'],
    ['document', { title: 'Document' }, documents, 'document.created'],
  ] as const)('%s に変換し、両方の Activity を記録する', (targetType, target, table, eventType) => {
    const item = capture()
    const converted = expectRecorded(database, () =>
      convertInboxItem(ctx, { id: item.id, target: { targetType, target } } as never),
    )
    const targetRow = database.db.select().from(table).get()!

    expect(converted).toMatchObject({ status: 'triaged', version: 2 })
    expect(
      database.db.select().from(activities).where(eq(activities.entityId, item.id)).all().at(-1),
    ).toMatchObject({
      eventType: 'inbox_item.converted',
      after: { status: 'triaged', convertedTo: { entityType: targetType, entityId: targetRow.id } },
      actorId: ctx.actor.id,
      source: 'mcp',
    })
    expect(
      database.db
        .select()
        .from(activities)
        .where(and(eq(activities.entityId, targetRow.id), eq(activities.entityType, targetType)))
        .get(),
    ).toMatchObject({ eventType })
    expect(
      getInboxItemActivities(ctxFor(database, ctx.actor), { inboxItemId: item.id }).items.at(-1),
    ).toMatchObject({
      convertedTo: { entityType: targetType, entityId: targetRow.id },
    })
  })

  it('変換先の write 権限がなければ、何も書かない', () => {
    const item = capture()
    const actor = insertActor(database, { permissions: { task: 'read' } })
    expectNothingWritten(
      () =>
        convertInboxItem(ctxFor(database, actor), {
          id: item.id,
          target: { targetType: 'task', target: { title: 'Task' } },
        }),
      ForbiddenError,
    )
  })

  it('変換先の作成に失敗したら Item も triaged にしない', () => {
    const item = capture()
    const actor = insertActor(database, { permissions: { task: 'readwrite' } })
    const before = snapshotTables(database)

    expect(() =>
      convertInboxItem(ctxFor(database, actor), {
        id: item.id,
        target: { targetType: 'task', target: { title: 'Task', assigneeId: 999 } },
      }),
    ).toThrow()
    expect(changedTables(before, snapshotTables(database))).toEqual([])
    expect(
      database.db.select().from(inboxItems).where(eq(inboxItems.id, item.id)).get(),
    ).toMatchObject({
      status: 'untriaged',
    })
  })

  it('triaged 化が競合で失敗したら変換先と Activity をロールバックする', () => {
    const item = capture()
    database.sqlite.exec(`
      create trigger reject_inbox_triage before update of status on inbox_items
      when new.status = 'triaged'
      begin
        select raise(ignore);
      end
    `)

    expectNothingWritten(
      () =>
        convertInboxItem(ctx, {
          id: item.id,
          target: { targetType: 'task', target: { title: '変換先 Task' } },
        }),
      NotAllowedError,
    )
    expect(database.db.select().from(tasks).all()).toEqual([])
    expect(
      database.db.select().from(inboxItems).where(eq(inboxItems.id, item.id)).get(),
    ).toMatchObject({ status: 'untriaged' })
  })
})
