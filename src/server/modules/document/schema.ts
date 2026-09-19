import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { datetime, inValues } from '../../core/columns.js'
import { actors } from '../auth/schema.js'
import { documentStatuses } from './inputs.js'

export const documents = sqliteTable(
  'documents',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    title: text().notNull(),
    content: text().notNull().default(''),
    status: text({ enum: documentStatuses }).notNull(),
    createdBy: integer()
      .notNull()
      .references(() => actors.id),
    updatedBy: integer()
      .notNull()
      .references(() => actors.id),
    createdAt: datetime().notNull(),
    updatedAt: datetime().notNull(),
    version: integer().notNull().default(1),
  },
  (t) => [check('documents_status_check', inValues(t.status, documentStatuses))],
)

export const documentTags = sqliteTable(
  'document_tags',
  {
    documentId: integer()
      .notNull()
      .references(() => documents.id),
    tag: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.tag] }), index('document_tags_tag_idx').on(t.tag)],
)
