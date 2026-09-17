import { z } from 'zod'

/** Activity の対象の種類。画面・MCP で `<種類>:<id>` と書くときの語でもある（設計書 5.1・5.9） */
export const entityTypes = ['actor', 'token', 'project', 'task', 'document', 'inbox_item'] as const
export type EntityTypeValue = (typeof entityTypes)[number]

/** 操作の経路（要件定義書 2.2） */
export const sources = ['web', 'mcp'] as const
export type Source = (typeof sources)[number]

/** event_type の一覧（設計書 5.9） */
export const eventTypes = [
  'actor.created',
  'actor.permissions_changed',
  'token.issued',
  'token.revoked',
  'project.created',
  'project.updated',
  'project.document_linked',
  'project.document_unlinked',
  'project.completed',
  'project.archived',
  'task.created',
  'task.updated',
  'task.assignee_changed',
  'task.parent_changed',
  'task.moved',
  'task.document_linked',
  'task.document_unlinked',
  'task.started',
  'task.blocked',
  'task.review_requested',
  'task.approved',
  'task.returned_to_todo',
  'task.cancelled',
  'task.commented',
  'task.auto_started',
  'task.auto_cancelled',
  'task.auto_moved',
  'document.created',
  'document.updated',
  'document.archived',
  'inbox_item.captured',
  'inbox_item.updated',
  'inbox_item.converted',
  'inbox_item.archived',
] as const
export type EventType = (typeof eventTypes)[number]

const activityFields = z.record(z.string(), z.json())

/** 他モジュールが Activity を記録するときの入力（設計書 5.9） */
export const activityRecordInput = z
  .object({
    eventType: z.enum(eventTypes),
    entityType: z.enum(entityTypes),
    entityId: z.number().int().positive(),
    projectId: z.number().int().positive().nullable(),
    before: activityFields.default({}),
    after: activityFields.default({}),
  })
  .superRefine((value, ctx) => {
    if (!value.eventType.startsWith(`${value.entityType}.`)) {
      ctx.addIssue({
        code: 'custom',
        path: ['eventType'],
        message: 'eventType の対象と entityType が一致していません',
      })
    }

    if (value.entityType === 'project' && value.projectId !== value.entityId) {
      ctx.addIssue({
        code: 'custom',
        path: ['projectId'],
        message: 'Project の Activity には対象と同じ projectId が必要です',
      })
    } else if (
      value.entityType !== 'project' &&
      value.entityType !== 'task' &&
      value.projectId !== null
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['projectId'],
        message: 'Task・Project 以外の Activity に projectId は記録できません',
      })
    }
  })

/** 他モジュールへ公開する記録型。before / after は省略不可にする。 */
export type ActivityRecordInput = z.output<typeof activityRecordInput>

/** Activity の一覧に共通するページング。足した順（id 昇順）で返す（設計書 4.10・7.4） */
export const activityPageInput = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export const entityActivitiesInput = activityPageInput.extend({
  entityType: z.enum(entityTypes),
  entityId: z.number().int().positive(),
})
export type EntityActivitiesInput = z.input<typeof entityActivitiesInput>

export const projectActivitiesInput = activityPageInput.extend({
  projectId: z.number().int().positive(),
})
export type ProjectActivitiesInput = z.input<typeof projectActivitiesInput>

export const actorActivitiesInput = activityPageInput.extend({
  actorId: z.number().int().positive(),
})
export type ActorActivitiesInput = z.input<typeof actorActivitiesInput>

/**
 * 他の行を指す id の入力。REST API と業務ロジックは数値で受け取り、
 * MCP の層は meta の種類を見て `<種類>:<id>` の文字列を受け取る形に変える（設計書 5.1）。
 */
export function entityId(entityType: EntityTypeValue) {
  return z.number().int().positive().meta({ entityType })
}
