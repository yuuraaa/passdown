import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Sqlite from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  backupMiddleware,
  createBackup,
  listBackups,
  runBackupIfNeeded,
  shouldBackup,
  restoreBackup,
} from './backup.js'

let dir: string
let backupDir: string
let db: Sqlite.Database

function jstDate(year: number, month: number, day: number, hour: number, minute: number, second: number): Date {
  return new Date(Date.UTC(year, month, day, hour - 9, minute, second))
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'passdown-backup-'))
  backupDir = join(dir, 'backups')

  db = new Sqlite(join(dir, 'passdown.sqlite3'))
  db.exec(`
    create table users (
      id integer primary key,
      name text not null
    )
  `)
})

afterEach(() => {
  vi.useRealTimers()
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

function backupFiles(): string[] {
  try {
    return readdirSync(backupDir).sort()
  } catch {
    return []
  }
}

describe('createBackup', () => {
  it('指定したディレクトリに日時を含むバックアップを作成する', async () => {
    const now = jstDate(2026, 8, 23, 12, 34, 56)

    await createBackup(db, backupDir, now)

    expect(backupFiles()).toEqual([
      'passdown-20260923-123456.sqlite3',
    ])
  })

  it('バックアップには実行時点のDB内容が含まれる', async () => {
    db.prepare('insert into users (name) values (?)').run('Alice')

    const now = jstDate(2026, 8, 23, 12, 0, 0)

    await createBackup(db, backupDir, now)

    const backupPath = join(
      backupDir,
      'passdown-20260923-120000.sqlite3',
    )

    const backup = new Sqlite(backupPath, { readonly: true })

    try {
      const users = backup
        .prepare('select name from users order by id')
        .pluck()
        .all()

      expect(users).toEqual(['Alice'])
    } finally {
      backup.close()
    }
  })
})

describe('listBackups', () => {
  it('バックアップディレクトリが存在しなければ空配列を返す', async () => {
    expect(await listBackups(backupDir)).toEqual([])
  })

  it('バックアップファイルだけを新しい順で返す', async () => {
    await createBackup(
      db,
      backupDir,
      jstDate(2026, 8, 21, 12, 0, 0),
    )
    await createBackup(
      db,
      backupDir,
      jstDate(2026, 8, 23, 12, 0, 0),
    )
    await createBackup(
      db,
      backupDir,
      jstDate(2026, 8, 22, 12, 0, 0),
    )

    writeFileSync(join(backupDir, 'other.txt'), '')
    writeFileSync(join(backupDir, 'passdown-invalid.sqlite3'), '')

    const backups = await listBackups(backupDir)

    expect(backups.map((backup) => backup.filename)).toEqual([
      'passdown-20260923-120000.sqlite3',
      'passdown-20260922-120000.sqlite3',
      'passdown-20260921-120000.sqlite3',
    ])
  })
})

describe('shouldBackup', () => {
  it('バックアップが1件もなければtrueを返す', async () => {
    const result = await shouldBackup(
      backupDir,
      24 * 60 * 60 * 1000,
      jstDate(2026, 8, 23, 12, 0, 0),
    )

    expect(result).toBe(true)
  })

  it('マイグレーション前のコピーだけでは日次バックアップを取得済みとみなさない', async () => {
    mkdirSync(backupDir, { recursive: true })
    writeFileSync(join(backupDir, 'before-migration-20260923T120000.000.sqlite3'), '')

    expect(await shouldBackup(backupDir, 24 * 60 * 60 * 1000, jstDate(2026, 8, 23, 13, 0, 0))).toBe(true)
  })

  it('前回バックアップから指定時間未満ならfalseを返す', async () => {
    await createBackup(
      db,
      backupDir,
      jstDate(2026, 8, 23, 0, 0, 0),
    )

    const result = await shouldBackup(
      backupDir,
      24 * 60 * 60 * 1000,
      jstDate(2026, 8, 23, 12, 0, 0),
    )

    expect(result).toBe(false)
  })

  it('前回バックアップから指定時間以上経過していればtrueを返す', async () => {
    await createBackup(
      db,
      backupDir,
      jstDate(2026, 8, 22, 12, 0, 0),
    )

    const result = await shouldBackup(
      backupDir,
      24 * 60 * 60 * 1000,
      jstDate(2026, 8, 23, 12, 0, 0),
    )

    expect(result).toBe(true)
  })
})

describe('runBackupIfNeeded', () => {
  it('バックアップがなければ作成する', async () => {
    const now = jstDate(2026, 8, 23, 12, 0, 0)

    await runBackupIfNeeded(
      db,
      {
        directory: backupDir,
        intervalMs: 24 * 60 * 60 * 1000,
        keep: 14,
      },
      now,
    )

    expect(backupFiles()).toEqual([
      'passdown-20260923-120000.sqlite3',
    ])
  })

  it('指定時間が経過していなければ作成しない', async () => {
    await createBackup(
      db,
      backupDir,
      jstDate(2026, 8, 23, 0, 0, 0),
    )

    await runBackupIfNeeded(
      db,
      {
        directory: backupDir,
        intervalMs: 24 * 60 * 60 * 1000,
        keep: 14,
      },
      jstDate(2026, 8, 23, 12, 0, 0),
    )

    expect(backupFiles()).toEqual([
      'passdown-20260923-000000.sqlite3',
    ])
  })

  it('指定時間が経過していれば新しいバックアップを作成する', async () => {
    await createBackup(
      db,
      backupDir,
      jstDate(2026, 8, 22, 12, 0, 0),
    )

    await runBackupIfNeeded(
      db,
      {
        directory: backupDir,
        intervalMs: 24 * 60 * 60 * 1000,
        keep: 14,
      },
      jstDate(2026, 8, 23, 12, 0, 0),
    )

    expect(backupFiles()).toEqual([
      'passdown-20260922-120000.sqlite3',
      'passdown-20260923-120000.sqlite3',
    ])
  })

  it('作成成功後に日次バックアップだけを指定世代数まで減らす', async () => {
    await createBackup(db, backupDir, jstDate(2026, 8, 20, 12, 0, 0))
    await createBackup(db, backupDir, jstDate(2026, 8, 21, 12, 0, 0))
    await createBackup(db, backupDir, jstDate(2026, 8, 22, 12, 0, 0))
    writeFileSync(join(backupDir, 'before-migration-20260920T120000.000.sqlite3'), '')
    writeFileSync(join(backupDir, 'unrelated.txt'), '')

    await runBackupIfNeeded(
      db,
      { directory: backupDir, intervalMs: 24 * 60 * 60 * 1000, keep: 2 },
      jstDate(2026, 8, 23, 12, 0, 0),
    )

    expect(backupFiles()).toEqual([
      'before-migration-20260920T120000.000.sqlite3',
      'passdown-20260922-120000.sqlite3',
      'passdown-20260923-120000.sqlite3',
      'unrelated.txt',
    ])
  })
})

describe('backupMiddleware', () => {
  it('チェック間隔ごとにバックアップ要否を確認する', async () => {
    vi.useFakeTimers({
      toFake: ['Date'],
    })

    vi.setSystemTime(jstDate(2026, 8, 23, 12, 0, 0))

    const middleware = backupMiddleware(
      db,
      backupDir,
      24 * 60 * 60 * 1000,
      60 * 60 * 1000,
      14,
    )

    const next = vi.fn(async () => {})

    // 初回リクエストなのでバックアップされる
    await middleware({} as never, next)

    expect(backupFiles()).toEqual([
      'passdown-20260923-120000.sqlite3',
    ])

    // 30分後。チェック間隔の1時間に達していない
    vi.setSystemTime(jstDate(2026, 8, 23, 12, 30, 0))

    await middleware({} as never, next)

    expect(backupFiles()).toHaveLength(1)

    // 1時間後。チェックは行われるが、
    // バックアップ間隔24時間には達していない
    vi.setSystemTime(jstDate(2026, 8, 23, 13, 0, 0))

    await middleware({} as never, next)

    expect(backupFiles()).toHaveLength(1)

    // 最初のバックアップから24時間経過
    vi.setSystemTime(jstDate(2026, 8, 24, 12, 0, 0))

    await middleware({} as never, next)

    expect(backupFiles()).toEqual([
      'passdown-20260923-120000.sqlite3',
      'passdown-20260924-120000.sqlite3',
    ])

    expect(next).toHaveBeenCalledTimes(4)
  })
})

describe('restoreBackup', () => {
  it('指定したバックアップファイルからDBを復元する', async () => {
    const databasePath = join(dir, 'passdown.sqlite3')

    db.prepare('insert into users (name) values (?)').run('before backup')

    const backupTime = jstDate(2026, 8, 23, 12, 0, 0)
    await createBackup(db, backupDir, backupTime)

    const backupPath = join(
      backupDir,
      'passdown-20260923-120000.sqlite3',
    )

    // バックアップ取得後にDBを変更する
    db.prepare('insert into users (name) values (?)').run('after backup')

    db.close()

    await restoreBackup(backupPath, databasePath)

    const restored = new Sqlite(databasePath)

    try {
      const users = restored
        .prepare('select name from users order by id')
        .pluck()
        .all()

      expect(users).toEqual(['before backup'])
    } finally {
      restored.close()
    }
  })

  it('存在しないバックアップを指定した場合は例外を投げる', async () => {
    const databasePath = join(dir, 'passdown.sqlite3')
    const backupPath = join(backupDir, 'not-found.sqlite')

    db.close()

    await expect(
      restoreBackup(backupPath, databasePath),
    ).rejects.toThrow()
  })

  it('リストアに失敗した場合は一時ファイルを残さない', async () => {
    const databasePath = join(dir, 'passdown.sqlite3')
    const backupPath = join(backupDir, 'not-found.sqlite')

    db.close()

    await expect(
      restoreBackup(backupPath, databasePath),
    ).rejects.toThrow()

    expect(
      existsSync(`${databasePath}.restore`),
    ).toBe(false)
  })

  it('壊れたバックアップは現行 DB を退避せずに拒否する', async () => {
    const databasePath = join(dir, 'passdown.sqlite3')
    const invalidBackup = join(backupDir, 'passdown-20260923-120000.sqlite3')
    mkdirSync(backupDir, { recursive: true })
    writeFileSync(invalidBackup, 'not a sqlite database')
    db.close()

    await expect(restoreBackup(invalidBackup, databasePath)).rejects.toThrow()
    const current = new Sqlite(databasePath, { readonly: true })
    try {
      expect(current.prepare('select name from sqlite_master where name = ?').get('users')).toBeDefined()
    } finally {
      current.close()
    }
    expect(readdirSync(dir).filter((name) => name.includes('before-restore') || name.includes('.restore-'))).toEqual([])
  })
})
