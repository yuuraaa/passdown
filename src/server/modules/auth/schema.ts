import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { datetime, inValues } from '../../core/columns.js'
import { actorTypes, permissions } from './inputs.js'

export const actors = sqliteTable(
  'actors',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    actorType: text({ enum: actorTypes }).notNull(),
    name: text().notNull().unique(),
    permProject: text({ enum: permissions }).notNull(),
    permTask: text({ enum: permissions }).notNull(),
    permDocument: text({ enum: permissions }).notNull(),
    permInbox: text({ enum: permissions }).notNull(),
  },
  (t) => [
    check('actors_actor_type_check', inValues(t.actorType, actorTypes)),
    check('actors_perm_project_check', inValues(t.permProject, permissions)),
    check('actors_perm_task_check', inValues(t.permTask, permissions)),
    check('actors_perm_document_check', inValues(t.permDocument, permissions)),
    check('actors_perm_inbox_check', inValues(t.permInbox, permissions)),
  ],
)

/** ログインの情報。actors と分け、Actor を読んだときにハッシュが混ざらないようにする（設計書 5.2） */
export const humanCredentials = sqliteTable('human_credentials', {
  actorId: integer()
    .primaryKey()
    .references(() => actors.id),
  loginName: text().notNull().unique(),
  passwordHash: text().notNull(),
})

export const tokens = sqliteTable(
  'tokens',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    actorId: integer()
      .notNull()
      .references(() => actors.id),
    tokenHash: text().notNull().unique(),
    issuedAt: datetime().notNull(),
    revokedAt: datetime(),
  },
  (t) => [index('tokens_actor_id_idx').on(t.actorId)],
)

export const sessions = sqliteTable(
  'sessions',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    actorId: integer()
      .notNull()
      .references(() => actors.id),
    sessionHash: text().notNull().unique(),
    createdAt: datetime().notNull(),
    expiresAt: datetime().notNull(),
  },
  (t) => [index('sessions_actor_id_idx').on(t.actorId)],
)
