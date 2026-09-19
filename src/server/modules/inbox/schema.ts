import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { inValues } from '../../core/columns.js'
import { actors } from '../auth/schema.js'
import { inboxItemStatuses } from './inputs.js'

export const inboxItems = sqliteTable(
  'inbox_items',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    content: text().notNull(),
    status: text({ enum: inboxItemStatuses }).notNull(),
    createdBy: integer()
      .notNull()
      .references(() => actors.id),
    version: integer().notNull().default(1),
  },
  (t) => [check('inbox_items_status_check', inValues(t.status, inboxItemStatuses))],
)
