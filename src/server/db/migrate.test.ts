import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Sqlite from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from './connection.js'
import { applyMigrations, type MigrationOptions } from './migrate.js'

let dir: string
let options: MigrationOptions
const journal: { idx: number; version: string; when: number; tag: string; breakpoints: boolean }[] =
  []

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'passdown-migrate-'))
  options = {
    migrationsFolder: join(dir, 'drizzle'),
    backupDir: join(dir, 'backups'),
    keep: 2,
    now: new Date('2026-09-16T12:00:00.000+09:00'),
  }
  journal.length = 0
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** drizzle-kit generate が作るのと同じ形で、マイグレーションを1本足す */
function addMigration(sql: string) {
  const idx = journal.length
  const tag = `${String(idx).padStart(4, '0')}_test`
  mkdirSync(join(options.migrationsFolder, 'meta'), { recursive: true })
  writeFileSync(join(options.migrationsFolder, `${tag}.sql`), sql)
  journal.push({ idx, version: '6', when: 1_700_000_000_000 + idx, tag, breakpoints: true })
  writeFileSync(
    join(options.migrationsFolder, 'meta', '_journal.json'),
    JSON.stringify({ version: '7', dialect: 'sqlite', entries: journal }),
  )
}

function tablesOf(path: string) {
  const sqlite = new Sqlite(path, { readonly: true })
  const names = sqlite
    .prepare("select name from sqlite_master where type = 'table' and name like 't%' order by name")
    .pluck()
    .all()
  sqlite.close()
  return names
}

const dbPath = () => join(dir, 'passdown.sqlite3')
const migrate = (now = options.now) => {
  const database = openDatabase(dbPath())
  try {
    return applyMigrations(database, { ...options, now })
  } finally {
    database.sqlite.close()
  }
}

describe('applyMigrations', () => {
  it('マイグレーションがなければ何もしない（v1 までは drizzle-kit push で当てる）', () => {
    expect(migrate()).toEqual({ status: 'no-migrations' })
  })

  it('初回はコピーを残さずに適用し、2回目は何もしない', () => {
    addMigration('create table t1 (id integer);')

    expect(migrate()).toEqual({ status: 'applied', count: 1, backup: null })
    expect(migrate()).toEqual({ status: 'up-to-date' })
    expect(tablesOf(dbPath())).toEqual(['t1'])
  })

  it('未適用のものだけを、適用の前の DB のコピーを残してから適用する', () => {
    addMigration('create table t1 (id integer);')
    migrate()
    addMigration('create table t2 (id integer);')

    const result = migrate()

    expect(result).toEqual({
      status: 'applied',
      count: 1,
      backup: join(options.backupDir, 'before-migration-20260916T120000.000.sqlite3'),
    })
    expect(tablesOf(dbPath())).toEqual(['t1', 't2'])
    // コピーは適用の直前の断面
    expect(tablesOf(result.status === 'applied' ? (result.backup ?? '') : '')).toEqual(['t1'])
  })

  it('コピーは決めた世代数だけ残し、古いものから消す', () => {
    addMigration('create table t1 (id integer);')
    migrate()
    for (const [i, hour] of [10, 11, 12].entries()) {
      addMigration(`create table t${i + 2} (id integer);`)
      migrate(new Date(`2026-09-16T${hour}:00:00.000+09:00`))
    }

    expect(readdirSync(options.backupDir)).toEqual([
      'before-migration-20260916T110000.000.sqlite3',
      'before-migration-20260916T120000.000.sqlite3',
    ])
  })

  it('失敗したら例外を投げ、DB は適用の前のまま', () => {
    addMigration('create table t1 (id integer);')
    migrate()
    addMigration(
      'create table t2 (id integer);\n--> statement-breakpoint\ncreate table t1 (id integer);',
    )

    expect(() => migrate()).toThrow()
    expect(tablesOf(dbPath())).toEqual(['t1'])
  })
})
