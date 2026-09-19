import type { Actor, Ctx, Resource } from '../core/operation.js'
import type { Database } from '../db/connection.js'
import { recordActivities } from '../modules/activity/index.js'
import { blockTask, createTask, requestTaskReview, startTask } from '../modules/task/index.js'
import { createDocument } from '../modules/document/index.js'
import { ctxFor, insertActor, insertProject, insertToken } from './fixtures.js'
import { tokens } from '../modules/auth/schema.js'

export type Harness = {
  database: Database
  /** すべての権限を持つ Actor。データの用意に使う */
  owner: Actor
  ownerCtx: Ctx
}

export type Scenario = {
  /** データを用意し、成功する入力を返す */
  arrange: (h: Harness) => unknown
  /**
   * returns に宣言したリソースごとに、read を持たない Actor で呼んだ結果に
   * そのリソースが含まれていないかを確かめる（設計書 4.9）
   */
  excludes?: Partial<Record<Resource, (result: unknown) => boolean>>
}

/**
 * 起点の操作ごとの、成功する入力とデータの用意（設計書 4.9 の表駆動のテスト）。
 * 操作を足したらここにも足す。足し忘れると表駆動のテストが失敗する。
 */
export const scenarios: Record<string, Scenario> = {
  list_actors: {
    arrange: () => ({}),
  },
  create_agent_actor: {
    arrange: () => ({
      name: '実装エージェント',
      permissions: { project: 'read', task: 'readwrite', document: 'read', inbox: 'none' },
    }),
  },
  update_agent_permissions: {
    arrange: ({ database }) => ({
      id: insertActor(database).id,
      permissions: { project: 'read', task: 'read', document: 'none', inbox: 'readwrite' },
    }),
  },
  list_actor_tokens: {
    arrange: ({ database }) => ({ id: insertActor(database).id }),
  },
  issue_token: {
    arrange: ({ database }) => ({ id: insertActor(database).id }),
  },
  revoke_token: {
    arrange: ({ database, owner }) => {
      insertToken(database, owner)
      return { id: database.db.select({ id: tokens.id }).from(tokens).get()!.id }
    },
  },
  get_task_activities: {
    arrange: ({ ownerCtx }) => {
      recordActivities(ownerCtx, [
        {
          eventType: 'task.created',
          entityType: 'task',
          entityId: 1,
          projectId: null,
          before: {},
          after: { title: 'Task' },
        },
      ])
      return { taskId: 1 }
    },
  },
  get_document_activities: {
    arrange: ({ ownerCtx }) => {
      recordActivities(ownerCtx, [
        {
          eventType: 'document.created',
          entityType: 'document',
          entityId: 1,
          projectId: null,
          before: {},
          after: { title: 'Document' },
        },
      ])
      return { documentId: 1 }
    },
  },
  get_inbox_item_activities: {
    arrange: ({ ownerCtx }) => {
      recordActivities(ownerCtx, [
        {
          eventType: 'inbox_item.captured',
          entityType: 'inbox_item',
          entityId: 1,
          projectId: null,
          before: {},
          after: { content: 'Inbox Item' },
        },
      ])
      return { inboxItemId: 1 }
    },
  },
  get_project_activities: {
    arrange: ({ database, ownerCtx }) => {
      const projectId = insertProject(database)
      recordActivities(ownerCtx, [
        {
          eventType: 'project.created',
          entityType: 'project',
          entityId: projectId,
          projectId,
          before: {},
          after: { name: 'Project' },
        },
      ])
      return { projectId }
    },
  },
  get_actor_activities: {
    arrange: ({ owner }) => ({ actorId: owner.id }),
  },
  create_task: {
    arrange: () => ({ title: 'テストの Task' }),
  },
  start_task: {
    arrange: ({ ownerCtx }) => {
      const task = createTask.withoutPermissionCheck(ownerCtx, { title: '着手する Task' })
      return { id: task.id }
    },
  },
  list_tasks: { arrange: () => ({}) },
  list_actionable_tasks: { arrange: () => ({}) },
  get_task: {
    arrange: ({ ownerCtx }) => ({
      id: createTask.withoutPermissionCheck(ownerCtx, { title: '読む Task' }).id,
    }),
    excludes: { document: (result) => (result as { documents: unknown[] }).documents.length === 0 },
  },
  update_task: {
    arrange: ({ ownerCtx }) => {
      const task = createTask.withoutPermissionCheck(ownerCtx, { title: '更新前' })
      return {
        id: task.id,
        title: '更新後',
        description: '',
        acceptanceCriteria: '',
        priority: 'normal',
        links: [],
        assigneeId: null,
        parentId: null,
        projectId: null,
        documentIds: [],
        version: task.version,
      }
    },
  },
  add_task_comment: {
    arrange: ({ ownerCtx }) => ({
      id: createTask.withoutPermissionCheck(ownerCtx, { title: 'コメント' }).id,
      body: '本文',
    }),
  },
  block_task: {
    arrange: ({ ownerCtx }) => {
      const task = createTask.withoutPermissionCheck(ownerCtx, { title: 'block' })
      startTask.withoutPermissionCheck(ownerCtx, { id: task.id })
      return { id: task.id, blockedReason: '理由' }
    },
  },
  request_task_review: {
    arrange: ({ ownerCtx }) => {
      const task = createTask.withoutPermissionCheck(ownerCtx, { title: 'review' })
      startTask.withoutPermissionCheck(ownerCtx, { id: task.id })
      return { id: task.id, result: '成果' }
    },
  },
  return_task_to_todo: {
    arrange: ({ ownerCtx }) => {
      const task = createTask.withoutPermissionCheck(ownerCtx, { title: 'return' })
      startTask.withoutPermissionCheck(ownerCtx, { id: task.id })
      blockTask.withoutPermissionCheck(ownerCtx, { id: task.id, blockedReason: '理由' })
      return { id: task.id, body: '回答' }
    },
  },
  approve_task: {
    arrange: ({ ownerCtx }) => {
      const task = createTask.withoutPermissionCheck(ownerCtx, { title: 'approve' })
      startTask.withoutPermissionCheck(ownerCtx, { id: task.id })
      requestTaskReview.withoutPermissionCheck(ownerCtx, { id: task.id, result: '成果' })
      return { id: task.id }
    },
  },
  cancel_task: {
    arrange: ({ ownerCtx }) => ({
      id: createTask.withoutPermissionCheck(ownerCtx, { title: 'cancel' }).id,
      result: '理由',
    }),
  },
  list_documents: {
    arrange: () => ({}),
  },
  get_document: {
    arrange: ({ ownerCtx }) => ({
      id: createDocument.withoutPermissionCheck(ownerCtx, { title: 'Document' }).id,
    }),
  },
  create_document: {
    arrange: () => ({ title: 'Document', tags: ['設計'] }),
  },
  update_document: {
    arrange: ({ ownerCtx }) => {
      const document = createDocument.withoutPermissionCheck(ownerCtx, { title: 'Document' })
      return {
        id: document.id,
        title: '更新済み',
        content: '本文',
        tags: ['設計'],
        version: document.version,
      }
    },
  },
  archive_document: {
    arrange: ({ ownerCtx }) => ({
      id: createDocument.withoutPermissionCheck(ownerCtx, { title: 'Document' }).id,
    }),
  },
  list_document_tags: {
    arrange: ({ ownerCtx }) => {
      createDocument.withoutPermissionCheck(ownerCtx, { title: 'Document', tags: ['設計'] })
      return {}
    },
  },
}

export function createHarness(database: Database): Harness {
  const owner = insertActor(database, { name: 'オーナー', actorType: 'human' })
  return { database, owner, ownerCtx: ctxFor(database, owner) }
}
