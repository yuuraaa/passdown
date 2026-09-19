import * as kit from 'drizzle-kit/api'
import { type Database, openDatabase } from '../db/connection.js'
import * as activity from '../modules/activity/schema.js'
import * as auth from '../modules/auth/schema.js'
import * as document from '../modules/document/schema.js'
import * as inbox from '../modules/inbox/schema.js'
import * as project from '../modules/project/schema.js'
import * as task from '../modules/task/schema.js'

// drizzle-kit/api の型は、入れていない DB ドライバーの型を参照していて解決できないため、使う形だけを書く
type Snapshot = { readonly __snapshot: unique symbol }
const generateSQLiteDrizzleJson = kit.generateSQLiteDrizzleJson as unknown as (
  imports: Record<string, unknown>,
  prevId: string | undefined,
  casing: 'snake_case',
) => Promise<Snapshot>
const generateSQLiteMigration = kit.generateSQLiteMigration as unknown as (
  prev: Snapshot,
  cur: Snapshot,
) => Promise<string[]>

let statements: Promise<string[]> | undefined

/** 全モジュールの schema.ts から CREATE 文を作る（drizzle-kit push と同じ生成の仕組みを使う） */
function schemaStatements(): Promise<string[]> {
  statements ??= (async () => {
    const empty = await generateSQLiteDrizzleJson({}, undefined, 'snake_case')
    const current = await generateSQLiteDrizzleJson(
      { ...activity, ...auth, ...document, ...inbox, ...project, ...task },
      undefined,
      'snake_case',
    )
    return generateSQLiteMigration(empty, current)
  })()
  return statements
}

/** テスト用のインメモリの DB（設計書 4.3）。テストごとに作り、分離する */
export async function createTestDatabase(): Promise<Database> {
  const database = openDatabase(':memory:')
  for (const statement of await schemaStatements()) {
    database.sqlite.exec(statement)
  }
  return database
}
