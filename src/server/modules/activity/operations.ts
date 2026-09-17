import { and, asc, count, eq, inArray, or, type SQL } from 'drizzle-orm'
import { NotFoundError } from '../../core/errors.js'
import { type Ctx, defineOperation } from '../../core/operation.js'
import { getActorTokenIds } from '../auth/index.js'
import {
  activityRecordInput,
  actorActivitiesInput,
  documentActivitiesInput,
  inboxItemActivitiesInput,
  projectActivitiesInput,
  taskActivitiesInput,
  type ActivityRecordInput,
} from './inputs.js'
import { activities } from './schema.js'

export type Activity = typeof activities.$inferSelect
export type ActivityRecord = ActivityRecordInput
export type ActivityPage = { items: Activity[]; total: number }

/**
 * Activity を記録する（設計書 4.9）。Actor・経路・日時は ctx の値をそのまま使う。
 * 他のモジュールから呼ばれるだけの関数のため、defineOperation を使わない。
 */
export function recordActivities(ctx: Ctx, records: readonly ActivityRecord[]): void {
  if (records.length === 0) {
    return
  }
  // 他モジュール向けの公開 API でも、DB の CHECK 制約だけに頼らず組み合わせまで検証する。
  const parsed = records.map((record) => activityRecordInput.parse(record))
  ctx.db.transaction((tx) => {
    tx.insert(activities)
      .values(
        parsed.map((r) => ({
          ...r,
          actorId: ctx.actor.id,
          source: ctx.source,
          occurredAt: ctx.now,
        })),
      )
      .run()
  })
}

function readPage(ctx: Ctx, where: SQL, page: { limit: number; offset: number }): ActivityPage {
  const items = ctx.db
    .select()
    .from(activities)
    .where(where)
    .orderBy(asc(activities.id))
    .limit(page.limit)
    .offset(page.offset)
    .all()
  const total = ctx.db.select({ value: count() }).from(activities).where(where).get()?.value ?? 0
  return { items, total }
}

/**
 * すべての対象は作成時の Activity を持ち、完全削除されないため、0件なら対象も存在しない。
 * 未実装の対象モジュールのテーブルへ直接依存せずに、Activity の持ち物だけで確認する。
 */
function requireExistingTarget(
  page: ActivityPage,
  entityType: 'project' | 'task' | 'document' | 'inbox_item',
  entityId: number,
): ActivityPage {
  if (page.total === 0) {
    throw new NotFoundError(`${entityType}:${entityId} が見つかりません`)
  }
  return page
}

function readEntityPage(
  ctx: Ctx,
  entityType: 'task' | 'document' | 'inbox_item',
  entityId: number,
  page: { limit: number; offset: number },
): ActivityPage {
  return requireExistingTarget(
    readPage(
      ctx,
      and(eq(activities.entityType, entityType), eq(activities.entityId, entityId))!,
      page,
    ),
    entityType,
    entityId,
  )
}

/** Task の Activity を読む（Web UI 専用）。 */
export const getTaskActivities = defineOperation({
  name: 'get_task_activities',
  routes: ['web'],
  requires: [],
  returns: [],
  entity: 'task',
  input: taskActivitiesInput,
  run: (ctx, input): ActivityPage => readEntityPage(ctx, 'task', input.taskId, input),
})

/** Document の Activity を読む（Web UI 専用）。 */
export const getDocumentActivities = defineOperation({
  name: 'get_document_activities',
  routes: ['web'],
  requires: [],
  returns: [],
  entity: 'document',
  input: documentActivitiesInput,
  run: (ctx, input): ActivityPage => readEntityPage(ctx, 'document', input.documentId, input),
})

/** Inbox Item の Activity を読む（Web UI 専用）。変換先の付加は Inbox モジュールが行う。 */
export const getInboxItemActivities = defineOperation({
  name: 'get_inbox_item_activities',
  routes: ['web'],
  requires: [],
  returns: [],
  entity: 'inbox_item',
  input: inboxItemActivitiesInput,
  run: (ctx, input): ActivityPage => readEntityPage(ctx, 'inbox_item', input.inboxItemId, input),
})

/** Project 画面用に、その Project 自身と所属 Task の Activity を読む（Web UI 専用）。 */
export const getProjectActivities = defineOperation({
  name: 'get_project_activities',
  routes: ['web'],
  requires: [],
  returns: [],
  entity: 'project',
  input: projectActivitiesInput,
  run: (ctx, input): ActivityPage =>
    requireExistingTarget(
      readPage(ctx, eq(activities.projectId, input.projectId), input),
      'project',
      input.projectId,
    ),
})

/** agent Actor 自身と、その Actor に属する Token の Activity をまとめて読む（Web UI 専用）。 */
export const getActorActivities = defineOperation({
  name: 'get_actor_activities',
  routes: ['web'],
  requires: [],
  returns: [],
  entity: 'actor',
  input: actorActivitiesInput,
  run: (ctx, input): ActivityPage => {
    const tokenIds = getActorTokenIds(ctx, input.actorId)
    const actor = and(eq(activities.entityType, 'actor'), eq(activities.entityId, input.actorId))!
    const where =
      tokenIds.length === 0
        ? actor
        : or(
            actor,
            and(eq(activities.entityType, 'token'), inArray(activities.entityId, tokenIds)),
          )!
    return readPage(ctx, where, input)
  },
})
