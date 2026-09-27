import { listBackups, restoreBackup, type Backup } from '../../server/db/backup.js'
import type { CliIo } from '../types.js'

export type BackupCommandDeps = {
  readonly io: CliIo
  readonly db_path: string
  readonly backup_path: string
}

export const usage = '使い方: passdown backup <list | restore>\n'
const restoreUsage = '使い方: passdown backup restore <YYYYMMDD[-HHmmss[.SSS]]>\n'
const BACKUP_ID = /^\d{8}(?:-\d{6}(?:\.\d{3})?)?$/

function describeBackup(backup: Backup): string {
  return `${backup.id}  ${backup.kind}`
}

async function showListBackups({ io, backup_path }: BackupCommandDeps): Promise<number> {
  const backups = await listBackups(backup_path)
  io.write(backups.length === 0 ? 'バックアップはありません。\n' : `${backups.map(describeBackup).join('\n')}\n`)
  return 0
}

async function showRestoreBackup(id: string, { io, db_path, backup_path }: BackupCommandDeps): Promise<number> {
  if (!BACKUP_ID.test(id)) {
    io.write(restoreUsage)
    return 1
  }

  const backups = await listBackups(backup_path)
  const exact = backups.filter((backup) => backup.id === id)
  const matches = exact.length > 0
    ? exact
    : backups.filter((backup) => backup.id.startsWith(`${id}${id.length === 8 ? '-' : '.'}`))

  if (matches.length === 0) {
    io.write(`該当するバックアップがありません: ${id}\n`)
    return 1
  }
  if (matches.length > 1) {
    io.write(`複数のバックアップが該当します: ${id}\n${matches.map(describeBackup).join('\n')}\n日時を詳しく指定してください。\n`)
    return 1
  }

  const backup = matches[0]
  if (!backup) return 1
  await restoreBackup(backup.path, db_path)
  io.write(`復元しました: ${describeBackup(backup)}\n`)
  return 0
}

export async function runBackupCommand(args: readonly string[], deps: BackupCommandDeps): Promise<number> {
  switch (args[0]) {
    case 'list':
      if (args.length !== 1) {
        deps.io.write(usage)
        return 1
      }
      return showListBackups(deps)

    case 'restore': {
      const backupId = args[1]

      if (args.length !== 2 || backupId === undefined) {
        deps.io.write(restoreUsage)
        return 1
      }
      return showRestoreBackup(backupId, deps)
    }

    default:
      deps.io.write(usage)
      return 1
  }
}
