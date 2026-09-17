import { and, asc, count, eq, inArray, or, type SQL } from 'drizzle-orm'
import { type Ctx, defineOperation } from '../../core/operation.js'
import { getActorTokenIds } from '../auth/index.js'
import {
  activityRecordInput,
  actorActivitiesInput,
  entityActivitiesInput,
  projectActivitiesInput,
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
  return ctx.db.transaction((tx) => {
    const items = tx
      .select()
      .from(activities)
      .where(where)
      .orderBy(asc(activities.id))
      .limit(page.limit)
      .offset(page.offset)
      .all()
    const total = tx.select({ value: count() }).from(activities).where(where).get()?.value ?? 0
    return { items, total }
  })
}

/** Task・Document・Inbox Item など、対象そのものの Activity を読む（Web UI 専用）。 */
export const getEntityActivities = defineOperation({
  name: 'get_entity_activities',
  routes: ['web'],
  requires: [],
  returns: [],
  // Web 専用なので MCP の id 変換には使われない。現在の公開経路の対象を宣言する。
  entity: 'task',
  input: entityActivitiesInput,
  run: (ctx, input): ActivityPage =>
    readPage(
      ctx,
      and(eq(activities.entityType, input.entityType), eq(activities.entityId, input.entityId))!,
      input,
    ),
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
    readPage(ctx, eq(activities.projectId, input.projectId), input),
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
