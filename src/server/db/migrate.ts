import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { formatDatetime } from '../core/time.js'
import type { Database } from './connection.js'

const MIGRATIONS_TABLE = '__drizzle_migrations'
const BACKUP_PREFIX = 'before-migration-'

export type MigrationOptions = {
  migrationsFolder: string
  backupDir: string
  /** マイグレーションの前に残すコピーの世代数（設計書 2.7） */
  keep: number
  now: Date
}

export type MigrationResult =
  | { status: 'no-migrations' }
  | { status: 'up-to-date' }
  | { status: 'applied'; count: number; backup: string | null }

/**
 * 未適用のマイグレーションを適用する（設計書 2.6）。適用の前に DB のコピーを残す。
 * 失敗したら例外を投げる。呼び出し側はサーバーを開始せずに異常終了する。
 */
export function applyMigrations(
  { sqlite, db }: Database,
  options: MigrationOptions,
): MigrationResult {
  // v1 を出すまでは drizzle-kit push でスキーマを当て、マイグレーションの SQL を持たない（設計書 2.6）
  if (!existsSync(join(options.migrationsFolder, 'meta', '_journal.json'))) {
    return { status: 'no-migrations' }
  }
  const migrations = readMigrationFiles({ migrationsFolder: options.migrationsFolder })
  const lastApplied = readLastApplied(sqlite)
  const pending = migrations.filter((m) => lastApplied === null || lastApplied < m.folderMillis)
  if (pending.length === 0) {
    return { status: 'up-to-date' }
  }

  // まだ何も入っていない DB（初回の起動）は、戻す先がないためコピーを残さない
  const backup = hasTables(sqlite) ? backupBeforeMigration(sqlite, options) : null
  migrate(db, { migrationsFolder: options.migrationsFolder, migrationsTable: MIGRATIONS_TABLE })
  return { status: 'applied', count: pending.length, backup }
}

function readLastApplied(sqlite: Database['sqlite']): number | null {
  const table = sqlite
    .prepare("select 1 from sqlite_master where type = 'table' and name = ?")
    .get(MIGRATIONS_TABLE)
  if (!table) {
    return null
  }
  const row = sqlite
    .prepare(`select created_at from ${MIGRATIONS_TABLE} order by created_at desc limit 1`)
    .get() as { created_at: number } | undefined
  return row ? Number(row.created_at) : null
}

function hasTables(sqlite: Database['sqlite']): boolean {
  return (
    sqlite
      .prepare("select 1 from sqlite_master where type = 'table' and name not like 'sqlite_%'")
      .get() !== undefined
  )
}

function backupBeforeMigration(sqlite: Database['sqlite'], options: MigrationOptions): string {
  mkdirSync(options.backupDir, { recursive: true })
  // ファイル名に使えるよう、日時の区切り文字を除く（並び順は保たれる）
  const stamp = formatDatetime(options.now).replace(/[-:]/g, '').replace('+0900', '')
  const path = join(options.backupDir, `${BACKUP_PREFIX}${stamp}.sqlite3`)
  // 動かしたまま一貫した断面を取れ、-wal・-shm を一緒にコピーせずに済む（設計書 2.7）
  sqlite.prepare('vacuum into ?').run(path)

  const old = readdirSync(options.backupDir)
    .filter((f) => f.startsWith(BACKUP_PREFIX))
    .sort()
    .slice(0, -options.keep)
  for (const file of old) {
    rmSync(join(options.backupDir, file))
  }
  return path
}
