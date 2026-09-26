import type { Db } from '../server/core/operation.js'
import { type CliIo } from './types.js'
import { runAccountCommand } from './account/command.js'
import { runBackupCommand } from './backup/command.js'

export type CliDeps = {
  readonly db?: Db
  readonly io: CliIo
  readonly db_path: string
  readonly backup_path: string
}

export const usage = '使い方: passdown <account | backup>\n'

export async function runCli(args: readonly string[], deps: CliDeps): Promise<number>
{
  switch (args[0]) {
    case 'account':
      if (!deps.db) throw new Error('account コマンドには DB 接続が必要です。')
      return runAccountCommand(args.slice(1), { db: deps.db, io: deps.io })
    case 'backup':
      return runBackupCommand(args.slice(1), deps)
    default:
      deps.io.write(usage)
      return 1
  }
}
