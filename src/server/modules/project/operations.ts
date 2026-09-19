import { and, asc, count, eq, inArray, sql } from 'drizzle-orm'
import { ConflictError, NotAllowedError, NotFoundError } from '../../core/errors.js'
import { hasPermission, type Ctx, defineOperation } from '../../core/operation.js'
import { type ActivityRecord, recordActivities } from '../activity/index.js'
import { getActiveDocuments, getDocument, type DocumentDetail } from '../document/index.js'
import {
  cancelUnfinishedProjectTasks,
  getUnfinishedProjectTasks,
  hasUnfinishedProjectTasks,
  type ProjectTaskSummary,
} from '../task/index.js'
import {
  archiveProjectInput,
  completeProjectInput,
  createProjectInput,
  getProjectInput,
  listProjectsInput,
  type ProjectStatus,
  updateProjectInput,
} from './inputs.js'
import { projectDocuments, projects } from './schema.js'

export type Project = typeof projects.$inferSelect
export type ProjectDetail = Project & { documents: DocumentDetail[] }
export type ProjectContext = Pick<
  Project,
  'id' | 'name' | 'description' | 'instructions' | 'repositories'
> & {
  tasks: ProjectTaskSummary[]
  taskTotal: number
  documents: Pick<DocumentDetail, 'id' | 'title' | 'tags'>[]
  documentTotal: number
}
export type DocumentProjectReference = Pick<Project, 'id' | 'name' | 'status'>

function readProject(ctx: Ctx, id: number): Project {
  const project = ctx.db.select().from(projects).where(eq(projects.id, id)).get()
  if (!project) throw new NotFoundError(`project:${id} が見つかりません`)
  return project
}
function readDocumentIds(ctx: Ctx, projectId: number): number[] {
  return ctx.db
    .select({ id: projectDocuments.documentId })
    .from(projectDocuments)
    .where(eq(projectDocuments.projectId, projectId))
    .orderBy(asc(projectDocuments.documentId))
    .all()
    .map((row) => row.id)
}
function detail(ctx: Ctx, project: Project): ProjectDetail {
  return {
    ...project,
    documents: hasPermission(ctx.actor, ['document', 'read'])
      ? readDocumentIds(ctx, project.id).map((id) => getDocument(ctx, id))
      : [],
  }
}
function ensureActive(project: Project): void {
  if (project.status !== 'active')
    throw new NotAllowedError(`project:${project.id} は ${project.status} のため操作できません`)
}
function activity(
  eventType: ActivityRecord['eventType'],
  project: Project,
  before: ActivityRecord['before'],
  after: ActivityRecord['after'],
): ActivityRecord {
  return {
    eventType,
    entityType: 'project',
    entityId: project.id,
    projectId: project.id,
    before,
    after,
  }
}

/** Task モジュールが Project の状態を確認するときに使う。 */
export function getProjectStatus(ctx: Ctx, projectId: number): ProjectStatus {
  return ctx.db.transaction((tx) => readProject({ ...ctx, db: tx }, projectId).status)
}
/** Document の参照元表示・検索で使う。 */
export function getProjectsReferencingDocument(
  ctx: Ctx,
  documentId: number,
): DocumentProjectReference[] {
  return ctx.db.transaction((tx) =>
    tx
      .select({ id: projects.id, name: projects.name, status: projects.status })
      .from(projects)
      .innerJoin(projectDocuments, eq(projectDocuments.projectId, projects.id))
      .where(eq(projectDocuments.documentId, documentId))
      .orderBy(asc(projects.id))
      .all(),
  )
}
/** 検索で Project が参照する Document を絞り込むときに使う。 */
export function getProjectDocumentIds(ctx: Ctx, projectId: number): number[] {
  return ctx.db.transaction((tx) => readDocumentIds({ ...ctx, db: tx }, projectId))
}

export const listProjects = defineOperation({
  name: 'list_projects',
  routes: ['web', 'mcp'],
  requires: [['project', 'read']],
  returns: [],
  entity: 'project',
  input: listProjectsInput,
  run: (ctx, input) => {
    const where = inArray(projects.status, input.statuses)
    return {
      items: ctx.db
        .select()
        .from(projects)
        .where(where)
        .orderBy(asc(projects.id))
        .limit(input.limit)
        .offset(input.offset)
        .all(),
      total: ctx.db.select({ value: count() }).from(projects).where(where).get()?.value ?? 0,
    }
  },
})
export const getProjectOperation = defineOperation({
  name: 'get_project',
  routes: ['web'],
  requires: [['project', 'read']],
  returns: ['document'],
  entity: 'project',
  input: getProjectInput,
  run: (ctx, input) => detail(ctx, readProject(ctx, input.id)),
})
export const createProject = defineOperation({
  name: 'create_project',
  routes: ['web', 'mcp'],
  requires: [
    ['project', 'readwrite'],
    ['document', 'read'],
  ],
  returns: [],
  entity: 'project',
  input: createProjectInput,
  run: (ctx, input) => {
    for (const id of input.documentIds) getDocument(ctx, id)
    const project = ctx.db
      .insert(projects)
      .values({
        name: input.name,
        description: input.description,
        instructions: input.instructions,
        repositories: input.repositories,
        status: 'active',
      })
      .returning()
      .get()
    const ids = [...new Set(input.documentIds)]
    if (ids.length)
      ctx.db
        .insert(projectDocuments)
        .values(ids.map((documentId) => ({ projectId: project.id, documentId })))
        .run()
    recordActivities(ctx, [
      activity(
        'project.created',
        project,
        {},
        {
          name: project.name,
          description: project.description,
          instructions: project.instructions,
          repositories: project.repositories,
          status: project.status,
        },
      ),
      ...ids.map((documentId) => activity('project.document_linked', project, {}, { documentId })),
    ])
    return detail(ctx, project)
  },
})
export const updateProject = defineOperation({
  name: 'update_project',
  routes: ['web', 'mcp'],
  requires: [
    ['project', 'readwrite'],
    ['document', 'read'],
  ],
  returns: [],
  entity: 'project',
  input: updateProjectInput,
  run: (ctx, input) => {
    const before = readProject(ctx, input.id)
    ensureActive(before)
    if (before.version !== input.version)
      throw new ConflictError(
        `project:${before.id} はほかの操作で更新されました。読み直してからやり直してください`,
      )
    for (const id of input.documentIds) getDocument(ctx, id)
    const updated = ctx.db
      .update(projects)
      .set({
        name: input.name,
        description: input.description,
        instructions: input.instructions,
        repositories: input.repositories,
        version: sql`${projects.version} + 1`,
      })
      .where(and(eq(projects.id, before.id), eq(projects.version, before.version)))
      .returning()
      .get()
    if (!updated)
      throw new ConflictError(
        `project:${before.id} はほかの操作で更新されました。読み直してからやり直してください`,
      )
    const previous = readDocumentIds(ctx, before.id)
    const next = [...new Set(input.documentIds)]
    ctx.db.delete(projectDocuments).where(eq(projectDocuments.projectId, before.id)).run()
    if (next.length)
      ctx.db
        .insert(projectDocuments)
        .values(next.map((documentId) => ({ projectId: before.id, documentId })))
        .run()
    const records: ActivityRecord[] = [
      activity(
        'project.updated',
        updated,
        {
          name: before.name,
          description: before.description,
          instructions: before.instructions,
          repositories: before.repositories,
        },
        {
          name: updated.name,
          description: updated.description,
          instructions: updated.instructions,
          repositories: updated.repositories,
        },
      ),
    ]
    for (const documentId of previous.filter((id) => !next.includes(id)))
      records.push(activity('project.document_unlinked', updated, { documentId }, {}))
    for (const documentId of next.filter((id) => !previous.includes(id)))
      records.push(activity('project.document_linked', updated, {}, { documentId }))
    recordActivities(ctx, records)
    return detail(ctx, updated)
  },
})
export const getProjectContext = defineOperation({
  name: 'get_project_context',
  routes: ['web', 'mcp'],
  requires: [['project', 'read']],
  returns: ['task', 'document'],
  entity: 'project',
  input: getProjectInput,
  run: (ctx, input): ProjectContext => {
    const project = readProject(ctx, input.id)
    const allTasks = hasPermission(ctx.actor, ['task', 'read'])
      ? getUnfinishedProjectTasks(ctx, project.id)
      : []
    const allDocuments = hasPermission(ctx.actor, ['document', 'read'])
      ? getActiveDocuments(ctx, readDocumentIds(ctx, project.id))
      : []
    return {
      id: project.id,
      name: project.name,
      description: project.description,
      instructions: project.instructions,
      repositories: project.repositories,
      tasks: allTasks.slice(0, 50),
      taskTotal: allTasks.length,
      documents: allDocuments.slice(0, 50).map(({ id, title, tags }) => ({ id, title, tags })),
      documentTotal: allDocuments.length,
    }
  },
})
export const completeProject = defineOperation({
  name: 'complete_project',
  routes: ['web'],
  requires: [['project', 'readwrite']],
  returns: [],
  entity: 'project',
  input: completeProjectInput,
  run: (ctx, input) => {
    const before = readProject(ctx, input.id)
    ensureActive(before)
    if (hasUnfinishedProjectTasks(ctx, before.id))
      throw new NotAllowedError('終わっていない Task があるため完了できません')
    const project = ctx.db
      .update(projects)
      .set({ status: 'done', version: sql`${projects.version} + 1` })
      .where(and(eq(projects.id, before.id), eq(projects.status, 'active')))
      .returning()
      .get()
    if (!project) throw new NotAllowedError(`project:${before.id} は操作できません`)
    recordActivities(ctx, [
      activity('project.completed', project, { status: before.status }, { status: project.status }),
    ])
    return detail(ctx, project)
  },
})
export const archiveProject = defineOperation({
  name: 'archive_project',
  routes: ['web'],
  requires: [['project', 'readwrite']],
  returns: [],
  entity: 'project',
  input: archiveProjectInput,
  run: (ctx, input) => {
    const before = readProject(ctx, input.id)
    ensureActive(before)
    const project = ctx.db
      .update(projects)
      .set({ status: 'archived', version: sql`${projects.version} + 1` })
      .where(and(eq(projects.id, before.id), eq(projects.status, 'active')))
      .returning()
      .get()
    if (!project) throw new NotAllowedError(`project:${before.id} は操作できません`)
    cancelUnfinishedProjectTasks(ctx, project.id)
    recordActivities(ctx, [
      activity('project.archived', project, { status: before.status }, { status: project.status }),
    ])
    return detail(ctx, project)
  },
})
