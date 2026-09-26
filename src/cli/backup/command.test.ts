import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Sqlite from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBackup } from '../../server/db/backup.js'
import { runBackupCommand } from './command.js'
import type { CliIo } from '../types.js'

class FakeIo implements CliIo {
  isTTY = false
  readonly output: string[] = []
  ask(): Promise<string> { throw new Error('対話入力は不要です') }
  askPassword(): Promise<string> { throw new Error('対話入力は不要です') }
  write(message: string): void { this.output.push(message) }
}

let dir: string
let databasePath: string
let backupPath: string
let db: Sqlite.Database
let io: FakeIo

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'passdown-cli-backup-'))
  databasePath = join(dir, 'passdown.sqlite3')
  backupPath = join(dir, 'backups')
  db = new Sqlite(databasePath)
  db.exec('create table items (name text not null)')
  io = new FakeIo()
})

afterEach(() => {
  if (db.open) db.close()
  rmSync(dir, { recursive: true, force: true })
})

const deps = () => ({ io, db_path: databasePath, backup_path: backupPath })

describe('backup CLI', () => {
  it('日次とマイグレーション前のバックアップを日時順に表示する', async () => {
    await createBackup(db, backupPath, new Date('2026-09-23T10:15:30+09:00'))
    await db.backup(join(backupPath, 'before-migration-20260923T114512.123.sqlite3'))

    expect(await runBackupCommand(['list'], deps())).toBe(0)
    expect(io.output.join('')).toBe(
      '20260923-114512.123  before-migration\n20260923-101530  daily\n',
    )
  })

  it('日付だけで複数候補がある場合は DB を変更しない', async () => {
    await createBackup(db, backupPath, new Date('2026-09-23T10:15:30+09:00'))
    await db.backup(join(backupPath, 'before-migration-20260923T114512.123.sqlite3'))
    db.close()

    expect(await runBackupCommand(['restore', '20260923'], deps())).toBe(1)
    expect(io.output.join('')).toContain('複数のバックアップ')
    expect(readdirSync(dir).filter((name) => name.includes('before-restore'))).toEqual([])
  })

  it('日付だけで候補が一つなら復元する', async () => {
    db.prepare('insert into items (name) values (?)').run('before')
    await createBackup(db, backupPath, new Date('2026-09-23T10:15:30+09:00'))
    db.prepare('insert into items (name) values (?)').run('after')
    db.close()

    expect(await runBackupCommand(['restore', '20260923'], deps())).toBe(0)
    const restored = new Sqlite(databasePath)
    try {
      expect(restored.prepare('select name from items').pluck().all()).toEqual(['before'])
    } finally {
      restored.close()
    }
  })

  it('日次バックアップを選んで DB と WAL・SHM を退避して復元する', async () => {
    db.prepare('insert into items (name) values (?)').run('before')
    await createBackup(db, backupPath, new Date('2026-09-23T10:15:30+09:00'))
    db.prepare('insert into items (name) values (?)').run('after')
    db.close()
    writeFileSync(databasePath + '-wal', 'old wal')
    writeFileSync(databasePath + '-shm', 'old shm')

    expect(await runBackupCommand(['restore', '20260923-101530'], deps())).toBe(0)
    const restored = new Sqlite(databasePath)
    try {
      expect(restored.prepare('select name from items').pluck().all()).toEqual(['before'])
    } finally {
      restored.close()
    }
    expect(readdirSync(dir).filter((name) => name.includes('before-restore')).sort()).toHaveLength(3)
    expect(existsSync(join(backupPath, 'passdown-20260923-101530.sqlite3'))).toBe(true)
  })

  it('ミリ秒まで指定してマイグレーション前のバックアップを復元する', async () => {
    db.prepare('insert into items (name) values (?)').run('before')
    const migrationPath = join(backupPath, 'before-migration-20260923T114512.123.sqlite3')
    const dailyPath = join(backupPath, 'passdown-20260923-101530.sqlite3')
    await createBackup(db, backupPath, new Date('2026-09-23T10:15:30+09:00'))
    await db.backup(migrationPath)
    db.prepare('insert into items (name) values (?)').run('after')
    db.close()

    expect(await runBackupCommand(['restore', '20260923-114512.123'], deps())).toBe(0)
    const restored = new Sqlite(databasePath)
    try {
      expect(restored.prepare('select name from items').pluck().all()).toEqual(['before'])
    } finally {
      restored.close()
    }
    expect(existsSync(dailyPath)).toBe(true)
    expect(existsSync(migrationPath)).toBe(true)
  })

  it('存在しない日時や不正な日時では DB を変更しない', async () => {
    db.close()
    expect(await runBackupCommand(['restore', '20260924'], deps())).toBe(1)
    expect(await runBackupCommand(['restore', '../passdown.sqlite3'], deps())).toBe(1)
    expect(existsSync(databasePath)).toBe(true)
    expect(readdirSync(dir).filter((name) => name.includes('before-restore'))).toEqual([])
  })
})
