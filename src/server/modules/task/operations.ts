import { and, eq, sql } from 'drizzle-orm'
import { ConflictError, NotFoundError } from '../../core/errors.js'
import { type Ctx, defineOperation } from '../../core/operation.js'
import { type ActivityRecord, recordActivities } from '../activity/index.js'
import { assertActorExists } from '../auth/index.js'
import { getProjectStatus } from '../project/index.js'
import { createTaskInput, startTaskInput, type TaskStatus } from './inputs.js'
import {
  checkCanAddChild,
  checkProjectAcceptsTasks,
  planStart,
  resolveProjectOfNewTask,
} from './rules.js'
import { tasks } from './schema.js'

export type Task = typeof tasks.$inferSelect

// ---- モジュールの中で使うクエリ（他のモジュールには公開しない。設計書 4.4） ----

function readTask(ctx: Ctx, id: number): Task {
  const task = ctx.db.select().from(tasks).where(eq(tasks.id, id)).get()
  if (!task) {
    throw new NotFoundError(`task:${id} が見つかりません`)
  }
  return task
}

type AncestorRow = Pick<Task, 'id' | 'status' | 'projectId' | 'version'>

/** 祖先の Task を近い順に読む（設計書 5.5） */
function readAncestors(ctx: Ctx, id: number): AncestorRow[] {
  return ctx.db.all<AncestorRow>(sql`
    with recursive ancestors(id, status, project_id, version, parent_id, depth) as (
      select p.id, p.status, p.project_id, p.version, p.parent_id, 1
        from ${tasks} c join ${tasks} p on p.id = c.parent_id
       where c.id = ${id}
      union all
      select p.id, p.status, p.project_id, p.version, p.parent_id, a.depth + 1
        from ancestors a join ${tasks} p on p.id = a.parent_id
    )
    select id, status, project_id as projectId, version from ancestors order by depth
  `)
}

/** 状態を変える。楽観ロックで更新した行が0件なら競合（設計書 4.2 の例外1） */
function updateStatus(ctx: Ctx, task: Pick<Task, 'id' | 'version'>, status: TaskStatus): Task {
  const updated = ctx.db
    .update(tasks)
    .set({ status, version: sql`${tasks.version} + 1`, updatedAt: ctx.now })
    .where(and(eq(tasks.id, task.id), eq(tasks.version, task.version)))
    .returning()
    .get()
  if (!updated) {
    throw new ConflictError(
      `task:${task.id} はほかの操作で更新されました。読み直してからやり直してください`,
    )
  }
  return updated
}

function statusChange(
  eventType: ActivityRecord['eventType'],
  task: Pick<Task, 'id' | 'projectId'>,
  before: TaskStatus,
  after: TaskStatus,
): ActivityRecord {
  return {
    eventType,
    entityType: 'task',
    entityId: task.id,
    projectId: task.projectId,
    before: { status: before },
    after: { status: after },
  }
}

// ---- 起点の操作 ----

export const createTask = defineOperation({
  name: 'create_task',
  routes: ['web', 'mcp'],
  requires: [['task', 'readwrite']],
  returns: [],
  entity: 'task',
  input: createTaskInput,
  run: (ctx, input) => {
    const parent = input.parentId === undefined ? null : readTask(ctx, input.parentId)
    const projectId = resolveProjectOfNewTask(parent, input.projectId)
    if (parent) {
      checkCanAddChild(parent)
    }
    if (projectId !== null) {
      checkProjectAcceptsTasks(projectId, getProjectStatus(ctx, projectId))
    }
    if (input.assigneeId !== undefined) {
      assertActorExists(ctx, input.assigneeId)
    }

    const task = ctx.db
      .insert(tasks)
      .values({
        title: input.title,
        description: input.description,
        acceptanceCriteria: input.acceptanceCriteria,
        status: 'todo',
        priority: input.priority,
        projectId,
        parentId: parent?.id ?? null,
        assigneeId: input.assigneeId ?? null,
        links: input.links,
        createdBy: ctx.actor.id,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .returning()
      .get()

    recordActivities(ctx, [
      {
        eventType: 'task.created',
        entityType: 'task',
        entityId: task.id,
        projectId: task.projectId,
        before: {},
        after: {
          title: task.title,
          description: task.description,
          acceptanceCriteria: task.acceptanceCriteria,
          status: task.status,
          priority: task.priority,
          projectId: task.projectId,
          parentId: task.parentId,
          assigneeId: task.assigneeId,
          links: task.links,
        },
      },
    ])
    return task
  },
})

export const startTask = defineOperation({
  name: 'start_task',
  routes: ['web', 'mcp'],
  requires: [['task', 'readwrite']],
  returns: [],
  entity: 'task',
  input: startTaskInput,
  run: (ctx, input) => {
    const task = readTask(ctx, input.id)
    const autoStart = planStart(task, readAncestors(ctx, task.id))

    const started = updateStatus(ctx, task, 'in_progress')
    for (const ancestor of autoStart) {
      updateStatus(ctx, ancestor, 'in_progress')
    }

    recordActivities(ctx, [
      statusChange('task.started', task, task.status, 'in_progress'),
      ...autoStart.map((a) => statusChange('task.auto_started', a, a.status, 'in_progress')),
    ])
    return started
  },
})
