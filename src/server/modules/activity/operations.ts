import type { Ctx } from '../../core/operation.js'
import type { EntityTypeValue, EventType } from './inputs.js'
import { activities } from './schema.js'

export type ActivityRecord = {
  eventType: EventType
  entityType: EntityTypeValue
  entityId: number
  /** 記録した時点の所属 Project。Project に載せないものは null（設計書 5.9） */
  projectId: number | null
  /** 変わった項目の変更前の値。作成の記録は {} */
  before: Record<string, unknown>
  /** 変わった項目の変更後の値 */
  after: Record<string, unknown>
}

/**
 * Activity を記録する（設計書 4.9）。Actor・経路・日時は ctx の値をそのまま使う。
 * 他のモジュールから呼ばれるだけの関数のため、defineOperation を使わない。
 */
export function recordActivities(ctx: Ctx, records: readonly ActivityRecord[]): void {
  if (records.length === 0) {
    return
  }
  ctx.db.transaction((tx) => {
    tx.insert(activities)
      .values(
        records.map((r) => ({
          ...r,
          actorId: ctx.actor.id,
          source: ctx.source,
          occurredAt: ctx.now,
        })),
      )
      .run()
  })
}
