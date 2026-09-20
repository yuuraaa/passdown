import { describe, expect, it } from 'vitest'
import { archiveDocument, createDocument } from '../document/index.js'
import { createProject } from '../project/index.js'
import { addTaskComment, createTask } from '../task/index.js'
import { createTestDatabase } from '../../testing/db.js'
import { ctxFor, insertActor } from '../../testing/fixtures.js'
import { search } from './index.js'

describe('search', () => {
  it('Taskの項目とコメントをまたぐ複数語の部分一致をTask単位でまとめる', async () => {
    const database = await createTestDatabase()
    const actor = insertActor(database)
    const ctx = ctxFor(database, actor)
    const task = createTask(ctx, { title: '日本語の検索' })
    addTaskComment(ctx, { id: task.id, body: 'コメントに経緯を残す' })

    const result = search(ctx, { query: '日本語 経緯' })

    expect(result.tasks).toEqual({
      total: 1,
      items: [
        expect.objectContaining({
          id: task.id,
          matchedFields: ['title'],
          matchedComments: [expect.objectContaining({ body: 'コメントに経緯を残す' })],
        }),
      ],
    })
  })

  it('LIKEのメタ文字を文字として検索し、Project・タグ・Actorで絞り込む', async () => {
    const database = await createTestDatabase()
    const actor = insertActor(database)
    const other = insertActor(database)
    const ctx = ctxFor(database, actor)
    const document = createDocument(ctx, { title: '進捗 100%_完了', tags: [' K８S '] })
    const project = createProject(ctx, { name: 'Project', documentIds: [document.id] })
    const task = createTask(ctx, { title: '担当Task', projectId: project.id, assigneeId: actor.id })
    createTask(ctxFor(database, other), { title: '別のTask', assigneeId: other.id })

    const result = search(ctx, {
      query: '%_',
      projectId: project.id,
      tag: 'k8s',
      actorId: actor.id,
    })

    expect(result.tasks).toEqual({ total: 0, items: [] })
    expect(result.documents).toEqual({
      total: 1,
      items: [expect.objectContaining({ id: document.id, matchedFields: ['title'] })],
    })
    expect(task.assigneeId).toBe(actor.id)
  })

  it('キーワードを指定しないと完了済み・archivedを含む全対象を更新日時降順、id降順で返す', async () => {
    const database = await createTestDatabase()
    const actor = insertActor(database)
    const ctx = ctxFor(database, actor)
    const first = createTask(ctx, { title: '先' })
    const second = createTask(ctx, { title: '後' })
    const active = createDocument(ctx, { title: 'active' })
    const archived = createDocument(ctx, { title: 'archived' })
    archiveDocument(ctx, { id: archived.id })

    const result = search(ctx, {})

    expect(result.tasks.items.map((task) => task.id)).toEqual([second.id, first.id])
    expect(result.tasks.items.every((task) => task.matchedFields.length === 0)).toBe(true)
    expect(result.documents.items.map((document) => document.id)).toEqual([archived.id, active.id])
    expect(result.documents.items.every((document) => document.matchedFields.length === 0)).toBe(
      true,
    )
  })

  it('read権限がないリソースを空の結果として返す', async () => {
    const database = await createTestDatabase()
    const owner = insertActor(database)
    const taskOnly = insertActor(database, { permissions: { document: 'none' } })
    const documentOnly = insertActor(database, { permissions: { task: 'none' } })
    const none = insertActor(database, { permissions: { task: 'none', document: 'none' } })
    createTask(ctxFor(database, owner), { title: 'Task' })
    createDocument(ctxFor(database, owner), { title: 'Document' })

    expect(search(ctxFor(database, taskOnly), {}).documents).toEqual({ items: [], total: 0 })
    expect(search(ctxFor(database, documentOnly), {}).tasks).toEqual({ items: [], total: 0 })
    expect(search(ctxFor(database, none), {})).toEqual({
      tasks: { items: [], total: 0 },
      documents: { items: [], total: 0 },
    })
  })
})
