import type { Db } from '../server/core/operation.js'
import { type CliIo } from './types.js'
import { runAccountCommand } from './account/command.js'

export type CliDeps = {
  readonly db: Db
  readonly io: CliIo
}

export const usage = '使い方: passdown <account | backup>\n'

export async function runCli(args: readonly string[], deps: CliDeps): Promise<number>
{
  switch (args[0]) {
    case 'account':
      return runAccountCommand(args.slice(1), deps)
    case 'backup':
      deps.io.write('backup コマンドは現在実装中です。\n')
      return 1
    default:
      deps.io.write(usage)
      return 1
  }
}
