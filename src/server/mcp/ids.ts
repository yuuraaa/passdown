import { z } from 'zod'
import type { EntityType } from '../core/operation.js'

/**
 * MCP では id を `<種類>:<id>` の文字列で受け渡す（設計書 5.1）。
 * 変換は MCP の層のこの1か所に閉じ、業務ロジックの層と REST API は数値の id を使う。
 */

function entityIdString(entityType: EntityType) {
  return z
    .string()
    .regex(new RegExp(`^${entityType}:[1-9][0-9]*$`), `${entityType}:<数値> の形で指定してください`)
    .transform((s) => Number(s.slice(entityType.length + 1)))
}

function entityTypeOf(schema: z.ZodType): EntityType | undefined {
  const meta = z.globalRegistry.get(schema)
  return meta?.entityType as EntityType | undefined
}

function convertField(field: z.ZodType): z.ZodType {
  let converted: z.ZodType
  if (field instanceof z.ZodOptional) {
    converted = convertField(field.unwrap() as z.ZodType).optional()
  } else if (field instanceof z.ZodArray) {
    converted = z.array(convertField(field.element as z.ZodType))
  } else if (field instanceof z.ZodObject) {
    converted = toMcpInputSchema(field)
  } else if (field instanceof z.ZodDiscriminatedUnion) {
    converted = z.union(
      field.options.map((option) => toMcpInputSchema(option as z.ZodObject)) as [
        z.ZodObject,
        z.ZodObject,
        ...z.ZodObject[],
      ],
    )
  } else {
    const entityType = entityTypeOf(field)
    converted = entityType ? entityIdString(entityType) : field
  }
  if (converted !== field && field.description) {
    converted = converted.describe(field.description)
  }
  return converted
}

/** 入力のスキーマ（inputs.ts）の id の項目を、`<種類>:<id>` の文字列を受け取る形に変える */
export function toMcpInputSchema(schema: z.ZodObject): z.ZodObject {
  return z.object(
    Object.fromEntries(
      Object.entries(schema.shape).map(([key, field]) => [key, convertField(field as z.ZodType)]),
    ),
  )
}

/** 結果の中で、項目名から種類が決まる id（`id` 自体の種類は操作の entity で決まる） */
const ID_FIELDS: Record<string, EntityType> = {
  projectId: 'project',
  parentId: 'task',
  assigneeId: 'actor',
  createdBy: 'actor',
  updatedBy: 'actor',
  actorId: 'actor',
  taskId: 'task',
  documentId: 'document',
}

/**
 * 結果の id を `<種類>:<id>` に変える。一覧の `items` は同じ種類として扱う。
 * ほかのリソースを入れ子で返す操作を足すときは、入れ子の項目名と種類の対応をここに足す。
 */
export function toMcpIds(value: unknown, entity: EntityType): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => toMcpIds(v, entity))
  }
  if (value === null || typeof value !== 'object') {
    return value
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => {
      if (key === 'id' && typeof v === 'number') {
        return [key, `${entity}:${v}`]
      }
      const fieldType = ID_FIELDS[key]
      if (fieldType && typeof v === 'number') {
        return [key, `${fieldType}:${v}`]
      }
      if (key === 'items') {
        return [key, toMcpIds(v, entity)]
      }
      if (key === 'matchedComments' && Array.isArray(v)) {
        return [
          key,
          (v as unknown[]).map((comment) =>
            comment !== null &&
            typeof comment === 'object' &&
            typeof (comment as { id?: unknown }).id === 'number'
              ? { ...comment, id: `comment:${(comment as { id: number }).id}` }
              : comment,
          ),
        ]
      }
      if (key === 'parent' || key === 'children') {
        return [key, toMcpIds(v, 'task')]
      }
      if (key === 'tasks') {
        return [key, toMcpIds(v, 'task')]
      }
      if (key === 'documents') {
        return [key, toMcpIds(v, 'document')]
      }
      if (key === 'tasks') {
        return [key, toMcpIds(v, 'task')]
      }
      return [key, v]
    }),
  )
}
