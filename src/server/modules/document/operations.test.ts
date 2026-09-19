import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { ConflictError, NotAllowedError } from '../../core/errors.js'
import type { Ctx } from '../../core/operation.js'
import type { Database } from '../../db/connection.js'
import { createTestDatabase } from '../../testing/db.js'
import { changedTables, expectRecorded, snapshotTables } from '../../testing/recorded.js'
import { ctxFor, insertActor } from '../../testing/fixtures.js'
import { activities } from '../activity/schema.js'
import {
  archiveDocument,
  createDocument,
  getActiveDocuments,
  getDocumentOperation,
  listDocumentTags,
  listDocuments,
  updateDocument,
} from './operations.js'
import { documents } from './schema.js'

let database: Database
let ctx: Ctx

beforeEach(async () => {
  database = await createTestDatabase()
  ctx = ctxFor(database, insertActor(database), 'mcp')
})

const create = (input: Parameters<typeof createDocument>[1]) =>
  expectRecorded(database, () => createDocument(ctx, input))

function expectNothingWritten(call: () => unknown, error: new (...args: never[]) => Error) {
  const before = snapshotTables(database)
  expect(call).toThrow(error)
  expect(changedTables(before, snapshotTables(database))).toEqual([])
}

describe('Document の操作', () => {
  it('作成時にタグを保存し、Activity を記録する', () => {
    const document = create({ title: '設計', content: '# 本文', tags: [' K8S ', '設計'] })

    expect(document).toMatchObject({
      status: 'active',
      tags: ['k8s', '設計'],
      createdBy: ctx.actor.id,
      updatedBy: ctx.actor.id,
      version: 1,
    })
    expect(
      database.db.select().from(activities).where(eq(activities.entityId, document.id)).get(),
    ).toMatchObject({
      eventType: 'document.created',
      actorId: ctx.actor.id,
      source: 'mcp',
      after: { title: '設計', content: '# 本文', status: 'active', tags: ['k8s', '設計'] },
    })
  })

  it('active を既定に id 昇順で一覧し、archived は明示指定時だけ返す', () => {
    const first = create({ title: '1' })
    const second = create({ title: '2' })
    archiveDocument(ctx, { id: first.id })

    expect(listDocuments(ctx, {}).items.map((document) => document.id)).toEqual([second.id])
    expect(listDocuments(ctx, { status: 'archived' }).items.map((document) => document.id)).toEqual(
      [first.id],
    )
  })

  it('更新は version を確認してタグを置き換え、Activity を記録する', () => {
    const document = create({ title: '旧題', content: '旧本文', tags: ['旧'] })
    const updated = updateDocument(ctx, {
      id: document.id,
      title: '新題',
      content: '新本文',
      tags: ['新', ' K8S '],
      version: document.version,
    })

    expect(updated).toMatchObject({
      title: '新題',
      content: '新本文',
      tags: ['k8s', '新'],
      version: 2,
    })
    expect(
      database.db
        .select()
        .from(activities)
        .where(eq(activities.entityId, document.id))
        .all()
        .at(-1),
    ).toMatchObject({
      eventType: 'document.updated',
      before: { title: '旧題', content: '旧本文', tags: ['旧'] },
      after: { title: '新題', content: '新本文', tags: ['k8s', '新'] },
    })
  })

  it('古い version の更新は競合として何も書かない', () => {
    const document = create({ title: '資料' })
    expectNothingWritten(
      () =>
        updateDocument(ctx, {
          id: document.id,
          title: '変更',
          content: '',
          tags: [],
          version: document.version + 1,
        }),
      ConflictError,
    )
  })

  it('archive は version なしで状態を変え、以後の更新と再 archive を拒否する', () => {
    const document = create({ title: '資料' })
    const archived = archiveDocument(ctx, { id: document.id })

    expect(archived).toMatchObject({ status: 'archived', version: 2, updatedBy: ctx.actor.id })
    expectNothingWritten(
      () =>
        updateDocument(ctx, { id: document.id, title: '変更', content: '', tags: [], version: 2 }),
      NotAllowedError,
    )
    expectNothingWritten(() => archiveDocument(ctx, { id: document.id }), NotAllowedError)
  })

  it('既存タグには archived Document のタグも含める', () => {
    const document = create({ title: '資料', tags: ['運用'] })
    archiveDocument(ctx, { id: document.id })
    create({ title: '別資料', tags: ['設計'] })

    expect(listDocumentTags(ctx, {})).toEqual(['設計', '運用'])
  })

  it('active な Document だけを複数 id から id 順で返す', () => {
    const first = create({ title: '1' })
    const archived = create({ title: '2' })
    const last = create({ title: '3' })
    archiveDocument(ctx, { id: archived.id })

    expect(
      getActiveDocuments(ctx, [last.id, archived.id, first.id]).map((document) => document.id),
    ).toEqual([first.id, last.id])
  })

  it('詳細取得は archived Document も返す', () => {
    const document = create({ title: '資料' })
    archiveDocument(ctx, { id: document.id })
    expect(getDocumentOperation(ctx, { id: document.id }).status).toBe('archived')
  })

  it('archive は現在の状態を条件にして更新する', () => {
    const document = create({ title: '資料' })
    database.db
      .update(documents)
      .set({ status: 'archived' })
      .where(eq(documents.id, document.id))
      .run()
    expect(() => archiveDocument(ctx, { id: document.id })).toThrow(NotAllowedError)
  })
})
