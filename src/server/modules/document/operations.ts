import { and, asc, count, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { ConflictError, NotAllowedError, NotFoundError } from '../../core/errors.js'
import { hasPermission, type Ctx, defineOperation } from '../../core/operation.js'
import { type ActivityRecord, recordActivities } from '../activity/index.js'
import { getProjectsReferencingDocument, type DocumentProjectReference } from '../project/index.js'
import { escapeLikePattern } from '../search/index.js'
import { getTasksReferencingDocument, type DocumentTaskReference } from '../task/index.js'
import {
  archiveDocumentInput,
  createDocumentInput,
  documentPageInput,
  getDocumentInput,
  listDocumentTagsInput,
  type DocumentStatus,
  updateDocumentInput,
} from './inputs.js'
import { documents, documentTags } from './schema.js'

export type Document = typeof documents.$inferSelect
export type DocumentDetail = Document & { tags: string[] }
export type DocumentPage = { items: DocumentDetail[]; total: number }
export type DocumentReferences = {
  tasks: DocumentTaskReference[]
  projects: DocumentProjectReference[]
}
export type DocumentSearchFilter = {
  words: readonly string[]
  documentIds?: readonly number[]
  tag?: string
  statuses: readonly DocumentStatus[]
  createdFrom?: string
  createdTo?: string
  updatedFrom?: string
  updatedTo?: string
  limit: number
}
export type DocumentSearchItem = Pick<Document, 'id' | 'title' | 'status' | 'updatedAt'> & {
  matchedFields: Array<'title' | 'content'>
}
export type DocumentSearchPage = { items: DocumentSearchItem[]; total: number }

function readDocument(ctx: Ctx, id: number): Document {
  const document = ctx.db.select().from(documents).where(eq(documents.id, id)).get()
  if (!document) {
    throw new NotFoundError(`document:${id} が見つかりません`)
  }
  return document
}

function readTags(ctx: Ctx, documentId: number): string[] {
  return ctx.db
    .select({ tag: documentTags.tag })
    .from(documentTags)
    .where(eq(documentTags.documentId, documentId))
    .orderBy(asc(documentTags.tag))
    .all()
    .map((row) => row.tag)
}

/** search モジュール向け。Document の検索SQLは Document モジュールに閉じる。 */
export function searchDocuments(ctx: Ctx, filter: DocumentSearchFilter): DocumentSearchPage {
  if (filter.documentIds !== undefined && filter.documentIds.length === 0)
    return { items: [], total: 0 }
  const baseWhere = and(
    inArray(documents.status, [...filter.statuses]),
    filter.documentIds === undefined
      ? undefined
      : inArray(documents.id, [...new Set(filter.documentIds)]),
    filter.tag === undefined
      ? undefined
      : sql`exists (select 1 from ${documentTags} where ${documentTags.documentId} = ${documents.id} and ${documentTags.tag} = ${filter.tag})`,
    filter.createdFrom === undefined ? undefined : gte(documents.createdAt, filter.createdFrom),
    filter.createdTo === undefined ? undefined : lte(documents.createdAt, filter.createdTo),
    filter.updatedFrom === undefined ? undefined : gte(documents.updatedAt, filter.updatedFrom),
    filter.updatedTo === undefined ? undefined : lte(documents.updatedAt, filter.updatedTo),
  )
  const matched = new Map<number, DocumentSearchItem & { matchedWords: Set<number> }>()
  const words = filter.words.length === 0 ? [''] : filter.words
  for (const [wordIndex, word] of words.entries()) {
    const pattern = escapeLikePattern(word)
    const rows = ctx.db
      .select({
        id: documents.id,
        title: documents.title,
        status: documents.status,
        updatedAt: documents.updatedAt,
        titleMatched:
          word === ''
            ? sql<number>`0`
            : sql<number>`case when ${documents.title} like ${pattern} escape '\\' then 1 else 0 end`,
        contentMatched:
          word === ''
            ? sql<number>`0`
            : sql<number>`case when ${documents.content} like ${pattern} escape '\\' then 1 else 0 end`,
      })
      .from(documents)
      .where(
        and(
          baseWhere,
          word === ''
            ? undefined
            : sql`(${documents.title} like ${pattern} escape '\\' or ${documents.content} like ${pattern} escape '\\')`,
        ),
      )
      .all()
    for (const row of rows) {
      const entry = matched.get(row.id) ?? {
        id: row.id,
        title: row.title,
        status: row.status,
        updatedAt: row.updatedAt,
        matchedFields: [],
        matchedWords: new Set<number>(),
      }
      entry.matchedWords.add(wordIndex)
      if (row.titleMatched && !entry.matchedFields.includes('title'))
        entry.matchedFields.push('title')
      if (row.contentMatched && !entry.matchedFields.includes('content'))
        entry.matchedFields.push('content')
      matched.set(row.id, entry)
    }
  }
  const items = [...matched.values()]
    .filter((item) => item.matchedWords.size === words.length)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id - a.id)
  return {
    total: items.length,
    items: items.slice(0, filter.limit).map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      updatedAt: item.updatedAt,
      matchedFields: item.matchedFields,
    })),
  }
}

function detail(ctx: Ctx, document: Document): DocumentDetail {
  return { ...document, tags: readTags(ctx, document.id) }
}

function record(
  ctx: Ctx,
  eventType: ActivityRecord['eventType'],
  document: Document,
  before: ActivityRecord['before'],
  after: ActivityRecord['after'],
) {
  recordActivities(ctx, [
    {
      eventType,
      entityType: 'document',
      entityId: document.id,
      projectId: null,
      before,
      after,
    },
  ])
}

function ensureActive(document: Document): void {
  if (document.status !== 'active') {
    throw new NotAllowedError(`document:${document.id} は archived のため操作できません`)
  }
}

/** 他モジュールが参照先を検証・読み取りするときに使う。 */
export function getDocument(ctx: Ctx, id: number): DocumentDetail {
  return detail(ctx, readDocument(ctx, id))
}

/** id の集合から active な Document だけを id 昇順で返す（文脈取得用）。 */
export function getActiveDocuments(ctx: Ctx, ids: readonly number[]): DocumentDetail[] {
  if (ids.length === 0) return []
  return ctx.db
    .select()
    .from(documents)
    .where(and(inArray(documents.id, [...new Set(ids)]), eq(documents.status, 'active')))
    .orderBy(asc(documents.id))
    .all()
    .map((document) => detail(ctx, document))
}

/** 検索モジュール向け。検索条件の実装は search モジュールで組み立てる。 */
export function readDocumentsByIds(ctx: Ctx, ids: readonly number[]): DocumentDetail[] {
  if (ids.length === 0) return []
  return ctx.db
    .select()
    .from(documents)
    .where(inArray(documents.id, [...new Set(ids)]))
    .orderBy(asc(documents.id))
    .all()
    .map((document) => detail(ctx, document))
}

/** 既存タグを名前順で返す。archived の Document のタグも含む（F-DOC-02）。 */
export function getExistingDocumentTags(ctx: Ctx): string[] {
  return ctx.db
    .selectDistinct({ tag: documentTags.tag })
    .from(documentTags)
    .orderBy(asc(documentTags.tag))
    .all()
    .map((row) => row.tag)
}

export const listDocuments = defineOperation({
  name: 'list_documents',
  routes: ['web'],
  requires: [['document', 'read']],
  returns: [],
  entity: 'document',
  input: documentPageInput,
  run: (ctx, input): DocumentPage => {
    const where = eq(documents.status, input.status)
    const items = ctx.db
      .select()
      .from(documents)
      .where(where)
      .orderBy(asc(documents.id))
      .limit(input.limit)
      .offset(input.offset)
      .all()
      .map((document) => detail(ctx, document))
    const total = ctx.db.select({ value: count() }).from(documents).where(where).get()?.value ?? 0
    return { items, total }
  },
})

export const getDocumentOperation = defineOperation({
  name: 'get_document',
  routes: ['web', 'mcp'],
  requires: [['document', 'read']],
  returns: [],
  entity: 'document',
  input: getDocumentInput,
  run: (ctx, input) => getDocument(ctx, input.id),
})

/** Document 詳細画面で、参照している Task・Project を返す。 */
export const getDocumentReferences = defineOperation({
  name: 'get_document_references',
  routes: ['web'],
  requires: [['document', 'read']],
  returns: ['task', 'project'],
  entity: 'document',
  input: getDocumentInput,
  run: (ctx, input): DocumentReferences => {
    readDocument(ctx, input.id)
    return {
      tasks: hasPermission(ctx.actor, ['task', 'read'])
        ? getTasksReferencingDocument(ctx, input.id)
        : [],
      projects: hasPermission(ctx.actor, ['project', 'read'])
        ? getProjectsReferencingDocument(ctx, input.id)
        : [],
    }
  },
})

export const createDocument = defineOperation({
  name: 'create_document',
  routes: ['web', 'mcp'],
  requires: [['document', 'readwrite']],
  returns: [],
  entity: 'document',
  input: createDocumentInput,
  run: (ctx, input) => {
    const document = ctx.db
      .insert(documents)
      .values({
        title: input.title,
        content: input.content,
        status: 'active',
        createdBy: ctx.actor.id,
        updatedBy: ctx.actor.id,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .returning()
      .get()
    if (input.tags.length > 0) {
      ctx.db
        .insert(documentTags)
        .values(input.tags.map((tag) => ({ documentId: document.id, tag })))
        .run()
    }
    const result = detail(ctx, document)
    record(
      ctx,
      'document.created',
      document,
      {},
      {
        title: document.title,
        content: document.content,
        status: document.status,
        tags: result.tags,
      },
    )
    return result
  },
})

export const updateDocument = defineOperation({
  name: 'update_document',
  routes: ['web', 'mcp'],
  requires: [['document', 'readwrite']],
  returns: [],
  entity: 'document',
  input: updateDocumentInput,
  run: (ctx, input) => {
    const before = readDocument(ctx, input.id)
    ensureActive(before)
    const previousTags = readTags(ctx, before.id)
    const updated = ctx.db
      .update(documents)
      .set({
        title: input.title,
        content: input.content,
        updatedBy: ctx.actor.id,
        updatedAt: ctx.now,
        version: sql`${documents.version} + 1`,
      })
      .where(and(eq(documents.id, input.id), eq(documents.version, input.version)))
      .returning()
      .get()
    if (!updated) {
      throw new ConflictError(
        `document:${input.id} はほかの操作で更新されました。読み直してからやり直してください`,
      )
    }
    ctx.db.delete(documentTags).where(eq(documentTags.documentId, input.id)).run()
    if (input.tags.length > 0) {
      ctx.db
        .insert(documentTags)
        .values(input.tags.map((tag) => ({ documentId: input.id, tag })))
        .run()
    }
    const result = detail(ctx, updated)
    record(
      ctx,
      'document.updated',
      updated,
      { title: before.title, content: before.content, tags: previousTags },
      { title: updated.title, content: updated.content, tags: result.tags },
    )
    return result
  },
})

export const archiveDocument = defineOperation({
  name: 'archive_document',
  routes: ['web', 'mcp'],
  requires: [['document', 'readwrite']],
  returns: [],
  entity: 'document',
  input: archiveDocumentInput,
  run: (ctx, input) => {
    const before = readDocument(ctx, input.id)
    ensureActive(before)
    const archived = ctx.db
      .update(documents)
      .set({
        status: 'archived',
        updatedBy: ctx.actor.id,
        updatedAt: ctx.now,
        version: sql`${documents.version} + 1`,
      })
      .where(and(eq(documents.id, input.id), eq(documents.status, 'active')))
      .returning()
      .get()
    if (!archived) {
      throw new NotAllowedError(`document:${input.id} はすでに archive されています`)
    }
    const result = detail(ctx, archived)
    record(
      ctx,
      'document.archived',
      archived,
      { status: before.status },
      { status: archived.status },
    )
    return result
  },
})

export const listDocumentTags = defineOperation({
  name: 'list_document_tags',
  routes: ['web'],
  requires: [['document', 'read']],
  returns: [],
  entity: 'document',
  input: listDocumentTagsInput,
  run: (ctx) => getExistingDocumentTags(ctx),
})
