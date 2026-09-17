import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { datetime, inValues } from '../../core/columns.js'
import { actors } from '../auth/schema.js'
import { projects } from '../project/schema.js'
import { entityTypes, eventTypes, sources } from './inputs.js'

export const activities = sqliteTable(
  'activities',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    eventType: text({ enum: eventTypes }).notNull(),
    entityType: text({ enum: entityTypes }).notNull(),
    // 対象のテーブルが種類ごとに違うため、外部キーは張らない（設計書 5.9）
    entityId: integer().notNull(),
    projectId: integer().references(() => projects.id),
    actorId: integer()
      .notNull()
      .references(() => actors.id),
    source: text({ enum: sources }).notNull(),
    before: text({ mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
    after: text({ mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: datetime().notNull(),
  },
  (t) => [
    check('activities_event_type_check', inValues(t.eventType, eventTypes)),
    check('activities_entity_type_check', inValues(t.entityType, entityTypes)),
    check('activities_source_check', inValues(t.source, sources)),
    index('activities_entity_idx').on(t.entityType, t.entityId),
    index('activities_project_id_idx').on(t.projectId),
  ],
)
