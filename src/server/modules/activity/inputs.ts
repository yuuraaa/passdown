import { z } from 'zod'

/** Activity の対象の種類。画面・MCP で `<種類>:<id>` と書くときの語でもある（設計書 5.1・5.9） */
export const entityTypes = ['actor', 'token', 'project', 'task', 'document', 'inbox_item'] as const
export type EntityTypeValue = (typeof entityTypes)[number]

/** 操作の経路（要件定義書 2.2） */
export const sources = ['web', 'mcp'] as const

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

/**
 * 他の行を指す id の入力。REST API と業務ロジックは数値で受け取り、
 * MCP の層は meta の種類を見て `<種類>:<id>` の文字列を受け取る形に変える（設計書 5.1）。
 */
export function entityId(entityType: EntityTypeValue) {
  return z.number().int().positive().meta({ entityType })
}
