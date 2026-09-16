import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
import { datetime, inValues } from '../../core/columns.js'
import { actors } from '../auth/schema.js'
import { projects } from '../project/schema.js'
import { taskPriorities, taskStatuses } from './inputs.js'

export const tasks = sqliteTable(
  'tasks',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    title: text().notNull(),
    description: text().notNull().default(''),
    acceptanceCriteria: text().notNull().default(''),
    status: text({ enum: taskStatuses }).notNull(),
    priority: text({ enum: taskPriorities }).notNull().default('normal'),
    projectId: integer().references(() => projects.id),
    parentId: integer().references((): AnySQLiteColumn => tasks.id),
    assigneeId: integer().references(() => actors.id),
    result: text().notNull().default(''),
    blockedReason: text().notNull().default(''),
    links: text({ mode: 'json' }).$type<string[]>().notNull().default([]),
    createdBy: integer()
      .notNull()
      .references(() => actors.id),
    createdAt: datetime().notNull(),
    updatedAt: datetime().notNull(),
    version: integer().notNull().default(1),
  },
  (t) => [
    check('tasks_status_check', inValues(t.status, taskStatuses)),
    check('tasks_priority_check', inValues(t.priority, taskPriorities)),
    index('tasks_parent_id_idx').on(t.parentId),
    index('tasks_project_id_idx').on(t.projectId),
    index('tasks_assignee_id_idx').on(t.assigneeId),
  ],
)
