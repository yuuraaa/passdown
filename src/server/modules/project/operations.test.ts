import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { ConflictError, NotAllowedError } from '../../core/errors.js'
import { createDocument } from '../document/index.js'
import { documents } from '../document/schema.js'
import { createTask } from '../task/index.js'
import { tasks } from '../task/schema.js'
import { createTestDatabase } from '../../testing/db.js'
import { ctxFor, insertActor } from '../../testing/fixtures.js'
import type { Database } from '../../db/connection.js'
import { activities } from '../activity/schema.js'
import { projectDocuments } from './schema.js'
import {
  archiveProject,
  completeProject,
  createProject,
  getProjectContext,
  getProjectOperation,
  getProjectsReferencingDocument,
  listProjects,
  updateProject,
} from './index.js'

let database: Database
let ctx: ReturnType<typeof ctxFor>

beforeEach(async () => {
  database = await createTestDatabase()
  ctx = ctxFor(database, insertActor(database))
})

function create(
  input: Partial<{
    name: string
    description: string
    instructions: string
    repositories: string[]
    documentIds: number[]
  }> = {},
) {
  return createProject(ctx, { name: 'Project', ...input })
}

describe('Project 操作', () => {
  it('作成・一覧・詳細で Document 参照を返し、Activity を記録する', () => {
    const document = createDocument(ctx, { title: '資料' })
    const project = create({
      description: '概要',
      instructions: '指示',
      repositories: ['repo'],
      documentIds: [document.id],
    })

    expect(listProjects(ctx, {}).items).toHaveLength(1)
    expect(getProjectOperation(ctx, { id: project.id })).toMatchObject({
      documents: [{ id: document.id, title: '資料' }],
    })
    expect(database.db.select().from(projectDocuments).all()).toEqual([
      { projectId: project.id, documentId: document.id },
    ])
    expect(
      database.db
        .select()
        .from(activities)
        .where(eq(activities.projectId, project.id))
        .all()
        .map((a) => a.eventType),
    ).toEqual(['project.created', 'project.document_linked'])
  })

  it('active Project だけを version 付きで更新し、参照の差分を記録する', () => {
    const first = createDocument(ctx, { title: '一つ目' })
    const second = createDocument(ctx, { title: '二つ目' })
    const project = create({ documentIds: [first.id] })
    const updated = updateProject(ctx, {
      id: project.id,
      name: '更新後',
      description: '',
      instructions: '',
      repositories: [],
      documentIds: [second.id],
      version: project.version,
    })
    expect(updated).toMatchObject({ name: '更新後', version: 2, documents: [{ id: second.id }] })
    expect(() =>
      updateProject(ctx, {
        id: project.id,
        name: '競合',
        description: '',
        instructions: '',
        repositories: [],
        documentIds: [],
        version: 1,
      }),
    ).toThrow(ConflictError)
    expect(
      database.db
        .select()
        .from(activities)
        .where(eq(activities.projectId, project.id))
        .all()
        .slice(-3)
        .map((a) => a.eventType),
    ).toEqual(['project.updated', 'project.document_unlinked', 'project.document_linked'])
  })

  it('完了できるのは未完了 Task がない active Project だけ', () => {
    const project = create()
    createTask(ctx, { title: '残タスク', projectId: project.id })
    expect(() => completeProject(ctx, { id: project.id })).toThrow(NotAllowedError)
    const empty = create({ name: '空' })
    expect(completeProject(ctx, { id: empty.id })).toMatchObject({ status: 'done', version: 2 })
    expect(() =>
      updateProject(ctx, {
        id: empty.id,
        name: '不可',
        description: '',
        instructions: '',
        repositories: [],
        documentIds: [],
        version: 2,
      }),
    ).toThrow(NotAllowedError)
  })

  it('archive は未完了 Task を cancel し、Project を読み取り専用にする', () => {
    const project = create()
    const task = createTask(ctx, { title: '取消対象', projectId: project.id })
    expect(archiveProject(ctx, { id: project.id })).toMatchObject({ status: 'archived' })
    expect(
      database.db
        .select({ status: tasks.status, result: tasks.result })
        .from(tasks)
        .where(eq(tasks.id, task.id))
        .get(),
    ).toEqual({ status: 'cancelled', result: 'Project をやめたため' })
    expect(() => archiveProject(ctx, { id: project.id })).toThrow(NotAllowedError)
  })

  it('文脈は Task と active Document を上限付きで返し、Document の参照元を公開する', () => {
    const project = create({ description: '概要', instructions: '指示' })
    const active = createDocument(ctx, { title: '有効' })
    const archived = createDocument(ctx, { title: '過去' })
    const updated = updateProject(ctx, {
      id: project.id,
      name: project.name,
      description: project.description,
      instructions: project.instructions,
      repositories: project.repositories,
      documentIds: [active.id, archived.id],
      version: project.version,
    })
    database.db
      .update(documents)
      .set({ status: 'archived' })
      .where(eq(documents.id, archived.id))
      .run()
    createTask(ctx, { title: 'low', projectId: project.id, priority: 'low' })
    const high = createTask(ctx, { title: 'high', projectId: project.id, priority: 'high' })
    expect(getProjectContext(ctx, { id: project.id })).toMatchObject({
      tasks: [{ id: high.id }, { title: 'low' }],
      documents: [{ id: active.id, title: '有効' }],
      taskTotal: 2,
      documentTotal: 1,
    })
    expect(getProjectsReferencingDocument(ctx, active.id)).toEqual([
      { id: updated.id, name: project.name, status: 'active' },
    ])
  })
})
