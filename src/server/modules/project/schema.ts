import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { inValues } from '../../core/columns.js'
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
