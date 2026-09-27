import { beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../server/db/connection.js'
import { createTestDatabase } from '../../server/testing/db.js'
import { actors, humanCredentials } from '../../server/modules/auth/schema.js'
import { runAccountCommand } from './command.js'
import type { CliIo } from '../types.js'

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

    await expect(
      runAccountCommand(['create'], { db: database.db, io }),
    ).resolves.toBe(0)

    expect(database.db.select().from(humanCredentials).get()).toMatchObject({
      loginName: 'owner',
    })
    expect(database.db.select().from(actors).get()).toMatchObject({
      name: 'owner',
    })
    expect(io.output.join('')).not.toContain('secret-password')
  })

  it('確認不一致では書き込まない', async () => {
    const io = new FakeIo(['owner', '', 'one', 'two'])

    await expect(
      runAccountCommand(['create'], { db: database.db, io }),
    ).resolves.toBe(1)

    expect(database.db.select().from(humanCredentials).all()).toEqual([])
  })

  it('非 TTY では書き込まない', async () => {
    const io = new FakeIo([])
    io.isTTY = false

    await expect(
      runAccountCommand(['create'], { db: database.db, io }),
    ).resolves.toBe(1)

    expect(database.db.select().from(humanCredentials).all()).toEqual([])
  })

  it('不正な account コマンドでは書き込まない', async () => {
    const io = new FakeIo([])

    await expect(
      runAccountCommand(['unknown'], { db: database.db, io }),
    ).resolves.toBe(1)

    expect(database.db.select().from(humanCredentials).all()).toEqual([])
  })
})
