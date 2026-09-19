import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { inValues } from '../../core/columns.js'
import { documents } from '../document/schema.js'
import { projectStatuses } from './inputs.js'

export const projects = sqliteTable(
  'projects',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    name: text().notNull(),
    description: text().notNull().default(''),
    status: text({ enum: projectStatuses }).notNull(),
    instructions: text().notNull().default(''),
    repositories: text({ mode: 'json' }).$type<string[]>().notNull().default([]),
    version: integer().notNull().default(1),
  },
  (t) => [check('projects_status_check', inValues(t.status, projectStatuses))],
)

export const projectDocuments = sqliteTable(
  'project_documents',
  {
    projectId: integer()
      .notNull()
      .references(() => projects.id),
    documentId: integer()
      .notNull()
      .references(() => documents.id),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.documentId] }),
    index('project_documents_document_id_idx').on(t.documentId),
  ],
)
