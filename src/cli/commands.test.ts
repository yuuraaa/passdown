import { beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../server/db/connection.js'
import { createTestDatabase } from '../server/testing/db.js'
import { humanCredentials } from '../server/modules/auth/schema.js'
import { runCli } from './commands.js'
import type { CliIo } from './types.js'

class FakeIo implements CliIo {
  isTTY = true
  readonly output: string[] = []

  constructor(private readonly answers: string[]) {}

  ask(question: string): Promise<string> {
    void question
    return Promise.resolve(this.answers.shift() ?? '')
  }

  askPassword(question: string): Promise<string> {
    void question
    return Promise.resolve(this.answers.shift() ?? '')
  }

  write(message: string): void {
    this.output.push(message)
  }
}

let database: Database

beforeEach(async () => {
  database = await createTestDatabase()
})

describe('CLI', () => {
  it('account コマンドを accout CLI に振り分ける', async () => {
    const io = new FakeIo(['owner', '', 'secret-password', 'secret-password'])

    await expect(runCli(['account', 'create'], { db: database.db, io })).resolves.toBe(0)

    expect(database.db.select().from(humanCredentials).get()).toMatchObject({ loginName: 'owner' })
  })

  it('不正なトップレベルコマンドでは usage を表示して失敗する', async () => {
    const io = new FakeIo([])

    await expect(runCli(['unknown'], { db: database.db, io })).resolves.toBe(1)
    
    expect(io.output.join('')).toContain('使い方: passdown')
  })
})
