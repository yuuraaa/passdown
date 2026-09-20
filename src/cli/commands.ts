import type { Db } from '../server/core/operation.js'
import { createHumanAccount, resetHumanPassword } from '../server/modules/auth/index.js'

export type CliIo = {
  readonly isTTY: boolean
  ask(question: string): Promise<string>
  askPassword(question: string): Promise<string>
  write(message: string): void
}

export type CliDeps = {
  readonly db: Db
  readonly io: CliIo
}

export const usage = '使い方: passdown account <create|reset-password>\n'

/** 対話入力がすべて成功するまで DB を変更しない。 */
export async function runCli(args: readonly string[], { db, io }: CliDeps): Promise<number> {
  if (!io.isTTY) {
    io.write('このコマンドは TTY で対話的に実行してください。\n')
    return 1
  }
  if (args.length !== 2 || args[0] !== 'account') {
    io.write(usage)
    return 1
  }

  switch (args[1]) {
    case 'create': {
      const loginName = await io.ask('ログイン名: ')
      const displayName = await io.ask('表示名（空ならログイン名）: ')
      const password = await io.askPassword('パスワード: ')
      const confirmation = await io.askPassword('パスワード（確認）: ')
      if (password !== confirmation) {
        io.write('パスワードが一致しません。\n')
        return 1
      }
      await createHumanAccount(db, { loginName, name: displayName.trim() || loginName, password })
      io.write('human アカウントを作成しました。\n')
      return 0
    }
    case 'reset-password': {
      const loginName = await io.ask('ログイン名: ')
      const password = await io.askPassword('新しいパスワード: ')
      const confirmation = await io.askPassword('新しいパスワード（確認）: ')
      if (password !== confirmation) {
        io.write('パスワードが一致しません。\n')
        return 1
      }
      await resetHumanPassword(db, { loginName, password })
      io.write('パスワードを再設定しました。既存のセッションは無効になりました。\n')
      return 0
    }
    default:
      io.write(usage)
      return 1
  }
}
