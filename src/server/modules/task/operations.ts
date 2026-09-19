import { and, asc, count, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { ConflictError, NotAllowedError, NotFoundError } from '../../core/errors.js'
import { hasPermission, type Ctx, defineOperation } from '../../core/operation.js'
import { type ActivityRecord, recordActivities } from '../activity/index.js'
import { assertActorExists } from '../auth/index.js'
import { getDocument } from '../document/index.js'
import { getProjectStatus } from '../project/index.js'
import {
  addTaskCommentInput,
  approveTaskInput,
  blockTaskInput,
  cancelTaskInput,
  createTaskInput,
  getTaskInput,
  listActionableTasksInput,
  listTasksInput,
  requestTaskReviewInput,
  returnTaskToTodoInput,
  startTaskInput,
  type TaskStatus,
  updateTaskInput,
} from './inputs.js'
import {
  checkCanAddChild,
  checkProjectAcceptsTasks,
  planStart,
  resolveProjectOfNewTask,
} from './rules.js'
import { taskComments, taskDocuments, tasks } from './schema.js'

export type Task = typeof tasks.$inferSelect
export type TaskComment = typeof taskComments.$inferSelect
export type TaskDetail = Task & {
  comments: TaskComment[]
  documents: ReturnType<typeof getDocument>[]
  parent: Pick<Task, 'id' | 'title' | 'description' | 'acceptanceCriteria'> | null
  children: Pick<Task, 'id' | 'title' | 'status'>[]
}

function readTask(ctx: Ctx, id: number): Task {
  const task = ctx.db.select().from(tasks).where(eq(tasks.id, id)).get()
  if (!task) throw new NotFoundError(`task:${id} が見つかりません`)
  return task
}
function readComments(ctx: Ctx, taskId: number): TaskComment[] {
  return ctx.db
    .select()
    .from(taskComments)
    .where(eq(taskComments.taskId, taskId))
    .orderBy(asc(taskComments.id))
    .all()
}
function readDocumentIds(ctx: Ctx, taskId: number): number[] {
  return ctx.db
    .select({ id: taskDocuments.documentId })
    .from(taskDocuments)
    .where(eq(taskDocuments.taskId, taskId))
    .orderBy(asc(taskDocuments.documentId))
    .all()
    .map((x) => x.id)
}
function detail(ctx: Ctx, task: Task): TaskDetail {
  const documents = hasPermission(ctx.actor, ['document', 'read'])
    ? readDocumentIds(ctx, task.id)
        .map((id) => getDocument(ctx, id))
        .filter((d) => ctx.source === 'web' || d.status === 'active')
    : []
  const parent =
    task.parentId === null
      ? null
      : (ctx.db
          .select({
            id: tasks.id,
            title: tasks.title,
            description: tasks.description,
            acceptanceCriteria: tasks.acceptanceCriteria,
          })
          .from(tasks)
          .where(eq(tasks.id, task.parentId))
          .get() ?? null)
  const children = ctx.db
    .select({ id: tasks.id, title: tasks.title, status: tasks.status })
    .from(tasks)
    .where(eq(tasks.parentId, task.id))
    .orderBy(asc(tasks.id))
    .all()
  return { ...task, comments: readComments(ctx, task.id), documents, parent, children }
}
type Ancestor = Pick<Task, 'id' | 'status' | 'projectId' | 'version'>
function readAncestors(ctx: Ctx, id: number): Ancestor[] {
  return ctx.db.all<Ancestor>(
    sql`with recursive a(id,status,project_id,version,parent_id,depth) as (select p.id,p.status,p.project_id,p.version,p.parent_id,1 from ${tasks} c join ${tasks} p on p.id=c.parent_id where c.id=${id} union all select p.id,p.status,p.project_id,p.version,p.parent_id,a.depth+1 from a join ${tasks} p on p.id=a.parent_id) select id,status,project_id as projectId,version from a order by depth`,
  )
}
function readDescendants(ctx: Ctx, id: number): Task[] {
  return ctx.db.all<Task>(
    sql`with recursive d(id) as (select id from ${tasks} where parent_id=${id} union all select t.id from ${tasks} t join d on t.parent_id=d.id) select t.* from ${tasks} t join d on t.id=d.id order by t.id`,
  )
}
function ensureMutable(task: Task): void {
  if (task.status === 'done' || task.status === 'cancelled')
    throw new NotAllowedError(`task:${task.id} は ${task.status} のため操作できません`)
}
function update(ctx: Ctx, before: Task, values: Partial<Task>): Task {
  const row = ctx.db
    .update(tasks)
    .set({ ...values, version: sql`${tasks.version} + 1`, updatedAt: ctx.now })
    .where(and(eq(tasks.id, before.id), eq(tasks.version, before.version)))
    .returning()
    .get()
  if (!row)
    throw new ConflictError(
      `task:${before.id} はほかの操作で更新されました。読み直してからやり直してください`,
    )
  return row
}
function activity(
  eventType: ActivityRecord['eventType'],
  task: Task,
  before: ActivityRecord['before'],
  after: ActivityRecord['after'],
): ActivityRecord {
  return {
    eventType,
    entityType: 'task',
    entityId: task.id,
    projectId: task.projectId,
    before,
    after,
  }
}
function status(
  ctx: Ctx,
  task: Task,
  next: TaskStatus,
  eventType: ActivityRecord['eventType'],
  extra: Partial<Task> = {},
): Task {
  const updated = update(ctx, task, { ...extra, status: next })
  recordActivities(ctx, [
    activity(eventType, updated, { status: task.status }, { status: next, ...extra }),
  ])
  return updated
}

export type ProjectTaskSummary = Pick<Task, 'id' | 'title' | 'status' | 'priority' | 'assigneeId'>
export type DocumentTaskReference = Pick<Task, 'id' | 'title' | 'status' | 'projectId'>

/** Project の文脈取得と完了判定で使う、終わっていない Task の読み取り。 */
export function getUnfinishedProjectTasks(ctx: Ctx, projectId: number): ProjectTaskSummary[] {
  return ctx.db.transaction((tx) =>
    tx
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        assigneeId: tasks.assigneeId,
      })
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), notInArray(tasks.status, ['done', 'cancelled'])))
      .orderBy(
        sql`case ${tasks.priority} when 'high' then 0 when 'normal' then 1 else 2 end`,
        asc(tasks.id),
      )
      .all(),
  )
}

/** Project を done にできるか判定するときに使う。 */
export function hasUnfinishedProjectTasks(ctx: Ctx, projectId: number): boolean {
  return getUnfinishedProjectTasks(ctx, projectId).length > 0
}

/** Project archive に伴い、所属する終わっていない Task をまとめて cancel する。 */
export function cancelUnfinishedProjectTasks(ctx: Ctx, projectId: number): void {
  ctx.db.transaction((tx) => {
    const taskCtx = { ...ctx, db: tx }
    const unfinished = tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), notInArray(tasks.status, ['done', 'cancelled'])))
      .orderBy(asc(tasks.id))
      .all()
    for (const task of unfinished) {
      status(taskCtx, task, 'cancelled', 'task.auto_cancelled', {
        result: 'Project をやめたため',
      })
    }
  })
}

/** Document の参照元表示で使う、Document を参照している Task の読み取り。 */
export function getTasksReferencingDocument(ctx: Ctx, documentId: number): DocumentTaskReference[] {
  return ctx.db.transaction((tx) =>
    tx
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        projectId: tasks.projectId,
      })
      .from(tasks)
      .innerJoin(taskDocuments, eq(taskDocuments.taskId, tasks.id))
      .where(eq(taskDocuments.documentId, documentId))
      .orderBy(asc(tasks.id))
      .all(),
  )
}

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
    if (parent) checkCanAddChild(parent)
    if (projectId !== null) checkProjectAcceptsTasks(projectId, getProjectStatus(ctx, projectId))
    if (input.assigneeId !== undefined) assertActorExists(ctx, input.assigneeId)
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
      activity(
        'task.created',
        task,
        {},
        {
          title: task.title,
          description: task.description,
          acceptanceCriteria: task.acceptanceCriteria,
          status: task.status,
          priority: task.priority,
          projectId,
          parentId: task.parentId,
          assigneeId: task.assigneeId,
          links: task.links,
        },
      ),
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
    const ancestors = planStart(task, readAncestors(ctx, task.id))
    const started = status(ctx, task, 'in_progress', 'task.started')
    for (const ancestor of ancestors)
      status(ctx, ancestor as Task, 'in_progress', 'task.auto_started')
    return started
  },
})
export const listTasks = defineOperation({
  name: 'list_tasks',
  routes: ['web', 'mcp'],
  requires: [['task', 'read']],
  returns: [],
  entity: 'task',
  input: listTasksInput,
  run: (ctx, input) => {
    const where = and(
      inArray(tasks.status, input.statuses),
      input.projectId === undefined ? undefined : eq(tasks.projectId, input.projectId),
      input.assigneeId === undefined ? undefined : eq(tasks.assigneeId, input.assigneeId),
    )
    const items = ctx.db
      .select()
      .from(tasks)
      .where(where)
      .orderBy(asc(tasks.id))
      .limit(input.limit)
      .offset(input.offset)
      .all()
    const total = ctx.db.select({ value: count() }).from(tasks).where(where).get()?.value ?? 0
    const base = and(
      input.projectId === undefined ? undefined : eq(tasks.projectId, input.projectId),
      input.assigneeId === undefined ? undefined : eq(tasks.assigneeId, input.assigneeId),
    )
    const statusCounts = Object.fromEntries(
      ctx.db
        .select({ status: tasks.status, value: count() })
        .from(tasks)
        .where(base)
        .groupBy(tasks.status)
        .all()
        .map((x) => [x.status, x.value]),
    )
    return { items, total, statusCounts }
  },
})
export const listActionableTasks = defineOperation({
  name: 'list_actionable_tasks',
  routes: ['web', 'mcp'],
  requires: [['task', 'read']],
  returns: [],
  entity: 'task',
  input: listActionableTasksInput,
  run: (ctx) => ({
    items: ctx.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.assigneeId, ctx.actor.id),
          eq(tasks.status, 'todo'),
          notInArray(
            tasks.id,
            ctx.db
              .select({ id: tasks.parentId })
              .from(tasks)
              .where(sql`${tasks.parentId} is not null`),
          ),
        ),
      )
      .orderBy(
        sql`case ${tasks.priority} when 'high' then 0 when 'normal' then 1 else 2 end`,
        asc(tasks.id),
      )
      .all(),
  }),
})
export const getTaskOperation = defineOperation({
  name: 'get_task',
  routes: ['web', 'mcp'],
  requires: [['task', 'read']],
  returns: ['document'],
  entity: 'task',
  input: getTaskInput,
  run: (ctx, input) => detail(ctx, readTask(ctx, input.id)),
})
export const updateTask = defineOperation({
  name: 'update_task',
  routes: ['web', 'mcp'],
  requires: [
    ['task', 'readwrite'],
    ['document', 'read'],
  ],
  returns: [],
  entity: 'task',
  input: updateTaskInput,
  run: (ctx, input) => {
    const before = readTask(ctx, input.id)
    ensureMutable(before)
    if (before.version !== input.version)
      throw new ConflictError(
        `task:${before.id} はほかの操作で更新されました。読み直してからやり直してください`,
      )
    if (input.assigneeId !== null) assertActorExists(ctx, input.assigneeId)
    if (input.projectId !== null)
      checkProjectAcceptsTasks(input.projectId, getProjectStatus(ctx, input.projectId))
    if (before.parentId !== null && input.projectId !== before.projectId)
      throw new NotAllowedError(`親を持つ task:${before.id} の Project は個別に変更できません`)
    const parent = input.parentId === null ? null : readTask(ctx, input.parentId)
    if (parent) {
      checkCanAddChild(parent)
      if (
        parent.id === before.id ||
        readDescendants(ctx, before.id).some((x) => x.id === parent.id)
      )
        throw new NotAllowedError('親子関係を循環させることはできません')
      if (parent.projectId !== input.projectId)
        throw new NotAllowedError('親 Task と同じ Project を指定してください')
    }
    const descendants =
      before.parentId === null && before.projectId !== input.projectId
        ? readDescendants(ctx, before.id)
        : []
    const previousDocumentIds = readDocumentIds(ctx, before.id)
    for (const id of input.documentIds) getDocument(ctx, id)
    const updated = update(ctx, before, {
      title: input.title,
      description: input.description,
      acceptanceCriteria: input.acceptanceCriteria,
      priority: input.priority,
      links: input.links,
      assigneeId: input.assigneeId,
      parentId: input.parentId,
      projectId: input.projectId,
    })
    ctx.db.delete(taskDocuments).where(eq(taskDocuments.taskId, before.id)).run()
    if (input.documentIds.length)
      ctx.db
        .insert(taskDocuments)
        .values(
          [...new Set(input.documentIds)].map((documentId) => ({ taskId: before.id, documentId })),
        )
        .run()
    const records: ActivityRecord[] = [
      activity(
        'task.updated',
        updated,
        {
          title: before.title,
          description: before.description,
          acceptanceCriteria: before.acceptanceCriteria,
          priority: before.priority,
          links: before.links,
        },
        {
          title: updated.title,
          description: updated.description,
          acceptanceCriteria: updated.acceptanceCriteria,
          priority: updated.priority,
          links: updated.links,
        },
      ),
    ]
    if (before.assigneeId !== updated.assigneeId)
      records.push(
        activity(
          'task.assignee_changed',
          updated,
          { assigneeId: before.assigneeId },
          { assigneeId: updated.assigneeId },
        ),
      )
    if (before.parentId !== updated.parentId)
      records.push(
        activity(
          'task.parent_changed',
          updated,
          { parentId: before.parentId },
          { parentId: updated.parentId },
        ),
      )
    if (before.projectId !== updated.projectId)
      records.push(
        activity(
          'task.moved',
          updated,
          { projectId: before.projectId },
          { projectId: updated.projectId },
        ),
      )
    for (const descendant of descendants) {
      const moved = update(ctx, descendant, { projectId: updated.projectId })
      records.push(
        activity(
          'task.auto_moved',
          moved,
          { projectId: descendant.projectId ?? null },
          { projectId: moved.projectId ?? null },
        ),
      )
    }
    const nextDocumentIds = new Set(input.documentIds)
    for (const documentId of previousDocumentIds.filter((id) => !nextDocumentIds.has(id)))
      records.push(activity('task.document_unlinked', updated, { documentId }, {}))
    for (const documentId of nextDocumentIds)
      if (!previousDocumentIds.includes(documentId))
        records.push(activity('task.document_linked', updated, {}, { documentId }))
    if (before.status === 'in_progress' && parent?.status === 'todo') {
      status(ctx, parent, 'in_progress', 'task.auto_started')
      for (const ancestor of planStart(parent, readAncestors(ctx, parent.id))) {
        const started = status(ctx, ancestor as Task, 'in_progress', 'task.auto_started')
        void started
      }
    }
    recordActivities(ctx, records)
    return detail(ctx, updated)
  },
})
export const addTaskComment = defineOperation({
  name: 'add_task_comment',
  routes: ['web', 'mcp'],
  requires: [['task', 'readwrite']],
  returns: [],
  entity: 'task',
  input: addTaskCommentInput,
  run: (ctx, input) => {
    const task = readTask(ctx, input.id)
    ensureMutable(task)
    const comment = ctx.db
      .insert(taskComments)
      .values({ taskId: task.id, body: input.body, createdBy: ctx.actor.id, createdAt: ctx.now })
      .returning()
      .get()
    ctx.db.update(tasks).set({ updatedAt: ctx.now }).where(eq(tasks.id, task.id)).run()
    recordActivities(ctx, [
      activity('task.commented', task, {}, { commentId: comment.id, body: comment.body }),
    ])
    return comment
  },
})
export const blockTask = defineOperation({
  name: 'block_task',
  routes: ['web', 'mcp'],
  requires: [['task', 'readwrite']],
  returns: [],
  entity: 'task',
  input: blockTaskInput,
  run: (ctx, input) => {
    const task = readTask(ctx, input.id)
    if (task.status !== 'in_progress')
      throw new NotAllowedError('blocked にできるのは in_progress の Task だけです')
    return status(ctx, task, 'blocked', 'task.blocked', { blockedReason: input.blockedReason })
  },
})
export const requestTaskReview = defineOperation({
  name: 'request_task_review',
  routes: ['web', 'mcp'],
  requires: [['task', 'readwrite']],
  returns: [],
  entity: 'task',
  input: requestTaskReviewInput,
  run: (ctx, input) => {
    const task = readTask(ctx, input.id)
    if (task.status !== 'in_progress')
      throw new NotAllowedError('review に出せるのは in_progress の Task だけです')
    if (
      ctx.db
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.parentId, task.id), notInArray(tasks.status, ['done', 'cancelled'])))
        .get()
    )
      throw new NotAllowedError('終わっていない子 Task があるため review に出せません')
    return status(ctx, task, 'review', 'task.review_requested', { result: input.result })
  },
})
export const returnTaskToTodo = defineOperation({
  name: 'return_task_to_todo',
  routes: ['web', 'mcp'],
  requires: [['task', 'readwrite']],
  returns: [],
  entity: 'task',
  input: returnTaskToTodoInput,
  run: (ctx, input) => {
    const task = readTask(ctx, input.id)
    if (task.status !== 'blocked' && task.status !== 'review')
      throw new NotAllowedError('todo に戻せるのは blocked / review の Task だけです')
    const comment = ctx.db
      .insert(taskComments)
      .values({ taskId: task.id, body: input.body, createdBy: ctx.actor.id, createdAt: ctx.now })
      .returning()
      .get()
    const result = status(ctx, task, 'todo', 'task.returned_to_todo', { blockedReason: '' })
    recordActivities(ctx, [
      activity('task.commented', task, {}, { commentId: comment.id, body: comment.body }),
    ])
    return result
  },
})
export const approveTask = defineOperation({
  name: 'approve_task',
  routes: ['web'],
  requires: [['task', 'readwrite']],
  returns: [],
  entity: 'task',
  input: approveTaskInput,
  run: (ctx, input) => {
    const task = readTask(ctx, input.id)
    if (task.status !== 'review')
      throw new NotAllowedError('承認できるのは review の Task だけです')
    return status(ctx, task, 'done', 'task.approved')
  },
})
export const cancelTask = defineOperation({
  name: 'cancel_task',
  routes: ['web'],
  requires: [['task', 'readwrite']],
  returns: [],
  entity: 'task',
  input: cancelTaskInput,
  run: (ctx, input) => {
    const task = readTask(ctx, input.id)
    ensureMutable(task)
    const cancelled = status(ctx, task, 'cancelled', 'task.cancelled', { result: input.result })
    for (const child of readDescendants(ctx, task.id).filter(
      (x) => x.status !== 'done' && x.status !== 'cancelled',
    ))
      status(ctx, child, 'cancelled', 'task.auto_cancelled', { result: '親 Task をやめたため' })
    return cancelled
  },
})
