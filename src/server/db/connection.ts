import Sqlite from 'better-sqlite3'
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3'

/**
 * SQLite を開く。接続のたびに外部キーの検査を有効にする（設計書 5.1）。
 * 接続のインスタンスは起動処理だけが持ち、業務ロジックの層には ctx.db で渡す（設計書 4.2）。
 */
export type Database = {
  sqlite: Sqlite.Database
  db: BetterSQLite3Database
}

export function openDatabase(path: string): Database {
  const sqlite = new Sqlite(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle({ client: sqlite, casing: 'snake_case' })
  return { sqlite, db }
}
