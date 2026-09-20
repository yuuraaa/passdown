import { beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../server/db/connection.js'
import { createTestDatabase } from '../server/testing/db.js'
import { actors, humanCredentials } from '../server/modules/auth/schema.js'
import { runCli, type CliIo } from './commands.js'

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

describe('account CLI', () => {
  it('表示名が空ならログイン名で作成し、パスワードを出力しない', async () => {
    const io = new FakeIo(['owner', '', 'secret-password', 'secret-password'])
    await expect(runCli(['account', 'create'], { db: database.db, io })).resolves.toBe(0)
    expect(database.db.select().from(humanCredentials).get()).toMatchObject({ loginName: 'owner' })
    expect(database.db.select().from(actors).get()).toMatchObject({ name: 'owner' })
    expect(io.output.join('')).not.toContain('secret-password')
  })

  it('確認不一致・非 TTY・不正コマンドでは書き込まない', async () => {
    const mismatch = new FakeIo(['owner', '', 'one', 'two'])
    await expect(runCli(['account', 'create'], { db: database.db, io: mismatch })).resolves.toBe(1)
    const nonTty = new FakeIo([])
    nonTty.isTTY = false
    await expect(runCli(['account', 'create'], { db: database.db, io: nonTty })).resolves.toBe(1)
    const invalid = new FakeIo([])
    await expect(runCli(['account', 'unknown'], { db: database.db, io: invalid })).resolves.toBe(1)
    expect(database.db.select().from(humanCredentials).all()).toEqual([])
  })
})
