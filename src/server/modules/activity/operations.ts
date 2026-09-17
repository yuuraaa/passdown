import { and, asc, count, eq, inArray, or, type SQL } from 'drizzle-orm'
import type { Ctx } from '../../core/operation.js'
import {
  activityRecordInput,
  actorActivitiesInput,
  entityActivitiesInput,
  projectActivitiesInput,
  type ActorActivitiesInput,
  type ActivityRecordInput,
  type EntityActivitiesInput,
  type ProjectActivitiesInput,
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

/** Task・Document・Inbox Item・Project など、対象そのものの Activity を読む。 */
export function getEntityActivities(ctx: Ctx, input: EntityActivitiesInput): ActivityPage {
  const parsed = entityActivitiesInput.parse(input)
  return readPage(
    ctx,
    and(eq(activities.entityType, parsed.entityType), eq(activities.entityId, parsed.entityId))!,
    parsed,
  )
}

/** Project 画面用に、その Project 自身と所属 Task の Activity を読む。 */
export function getProjectActivities(ctx: Ctx, input: ProjectActivitiesInput): ActivityPage {
  const parsed = projectActivitiesInput.parse(input)
  return readPage(ctx, eq(activities.projectId, parsed.projectId), parsed)
}

/** agent Actor 自身と、その Actor に属する Token の Activity をまとめて読む。 */
export function getActorActivities(ctx: Ctx, input: ActorActivitiesInput): ActivityPage {
  const parsed = actorActivitiesInput.parse(input)
  const actor = and(eq(activities.entityType, 'actor'), eq(activities.entityId, parsed.actorId))!
  const where =
    parsed.tokenIds.length === 0
      ? actor
      : or(
          actor,
          and(eq(activities.entityType, 'token'), inArray(activities.entityId, parsed.tokenIds)),
        )!
  return readPage(ctx, where, parsed)
}
