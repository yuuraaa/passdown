import { constants } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, copyFile, rm, rename, stat } from 'node:fs/promises'
import { join } from "node:path";
import Sqlite from 'better-sqlite3'
import type { MiddlewareHandler } from "hono";
import { formatDatetime } from '../core/time.js'

const DAILY_PATTERN = /^passdown-(\d{8})-(\d{6})\.sqlite3$/
const MIGRATION_PATTERN = /^before-migration-(\d{8})T(\d{6})\.(\d{3})\.sqlite3$/

export type Backup = {
  path: string
  filename: string
  createdAt: Date
  id: string
  kind: 'daily' | 'before-migration'
}

export type BackupServiceOptions = {
  directory: string
  intervalMs: number
  keep: number
}

export async function createBackup(db: Sqlite.Database, directory: string, now: Date = new Date()): Promise<void> {
  await mkdir(directory, { recursive: true })

  const jst = formatDatetime(now)
  const day = jst.slice(0, 10).replaceAll('-', '')
  const time = jst.slice(11, 19).replaceAll(':', '')
  const filename = `passdown-${day}-${time}.sqlite3`
  const destination = join(directory, filename)

  await db.backup(destination)
}

export async function shouldBackup(backupDirectory: string, intervalMs: number, now: Date = new Date()): Promise<boolean> {
  const latestBackup = (await listBackups(backupDirectory)).find((backup) => backup.kind === 'daily')

  if (!latestBackup) {
    return true
  }

  const elapsedMs = now.getTime() - latestBackup.createdAt.getTime()

  return elapsedMs >= intervalMs
}

export async function runBackupIfNeeded(
  sqlite: Sqlite.Database,
  options: BackupServiceOptions,
  now: Date = new Date(),
): Promise<void> {
  const required = await shouldBackup(
    options.directory,
    options.intervalMs,
    now,
  )

  if (required) {
    await createBackup(sqlite, options.directory, now)
    const backups = (await listBackups(options.directory)).filter((backup) => backup.kind === 'daily')
    for (const backup of backups.slice(options.keep)) {
      await rm(backup.path)
    }
  }
}

export async function listBackups(directory: string): Promise<Backup[]> {
  let entries

  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return []
    }
    throw error
  }

  return entries
    .filter((entry) => entry.isFile())
    .flatMap((entry): Backup[] => {
      const daily = DAILY_PATTERN.exec(entry.name)
      const migration = MIGRATION_PATTERN.exec(entry.name)
      if (!daily && !migration) return []

      const [, day, time, milliseconds] = daily ?? migration ?? []
      const stamp = `${day?.slice(0, 4)}-${day?.slice(4, 6)}-${day?.slice(6, 8)}T${time?.slice(0, 2)}:${time?.slice(2, 4)}:${time?.slice(4, 6)}.${milliseconds ?? '000'}+09:00`
      const createdAt = new Date(stamp)
      if (Number.isNaN(createdAt.getTime())) return []
      const kind = daily ? 'daily' : 'before-migration'
      return [{
        path: join(directory, entry.name),
        filename: entry.name,
        createdAt,
        id: `${day}-${time}${migration ? `.${milliseconds}` : ''}`,
        kind,
      }]
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.filename.localeCompare(b.filename))
}

export async function restoreBackup(
  backupPath: string,
  databasePath: string,
  now: Date = new Date(),
): Promise<void> {
  const temporaryPath = `${databasePath}.restore-${randomUUID()}`
  const stamp = formatDatetime(now).replace(/[-:]/g, '').replace('+0900', '')
  const suffix = `.before-restore-${stamp}`
  const files = [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]
  const moved: { current: string; archived: string }[] = []

  try {
    await copyFile(backupPath, temporaryPath, constants.COPYFILE_EXCL)
    const verification = new Sqlite(temporaryPath, { readonly: true, fileMustExist: true })
    try {
      if (verification.pragma('quick_check', { simple: true }) !== 'ok') {
        throw new Error('バックアップファイルの検査に失敗しました。')
      }
    } finally {
      verification.close()
    }
    for (const current of files) {
      if (!(await exists(current))) continue
      const archived = `${current}${suffix}`
      if (await exists(archived)) {
        throw new Error(`退避先がすでに存在します: ${archived}`)
      }
      await rename(current, archived)
      moved.push({ current, archived })
    }
    await rename(temporaryPath, databasePath)
  } catch (error) {
    for (const { current, archived } of moved.reverse()) {
      await rename(archived, current)
    }
    await rm(temporaryPath, { force: true })
    throw error
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false
    throw error
  }
}

export function backupMiddleware(
  sqlite: Sqlite.Database,
  backupDirectory: string,
  backupIntervalMs: number,
  checkIntervalMs: number,
  keep: number,
): MiddlewareHandler {
  let lastCheckedAt = 0

  return async (_c, next) => {
    const now = Date.now()

    if (now - lastCheckedAt >= checkIntervalMs) {
      lastCheckedAt = now

      await runBackupIfNeeded(sqlite, {
        directory: backupDirectory,
        intervalMs: backupIntervalMs,
        keep,
      })
    }

    await next()
  }
}
