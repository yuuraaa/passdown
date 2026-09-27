import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Sqlite from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

const directories: string[] = []
const children: ChildProcess[] = []

function start(env: Record<string, string>): {
  child: ChildProcess
  ready: Promise<void>
  output: () => string
} {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server/main.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.push(child)
  let output = ''
  let settle: ((error?: Error) => void) | undefined
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`起動待ちがタイムアウトしました: ${output}`)),
      10000,
    )
    settle = (error?: Error) => {
      clearTimeout(timer)
      if (error) reject(error)
      else resolve()
    }
  })
  const onData = (chunk: Buffer) => {
    output += chunk.toString()
    if (output.includes('passdown: http://') || output.includes('passdown: 復元待機中')) {
      settle?.()
      settle = undefined
    }
  }
  child.stdout?.on('data', onData)
  child.stderr?.on('data', onData)
  child.once('exit', (code) => {
    if (settle) settle(new Error(`起動前に終了しました (${code}): ${output}`))
    settle = undefined
  })
  return { child, ready, output: () => output }
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  child.kill('SIGTERM')
  await exited
}

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('ポートを取得できません')
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return address.port
}

function temporaryDirectory(): string {
  const dir = mkdtempSync(join(tmpdir(), 'passdown-start-mode-'))
  directories.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(children.map(stop))
  children.length = 0
  for (const dir of directories) rmSync(dir, { recursive: true, force: true })
  directories.length = 0
})

describe('起動モード', () => {
  it('不正な値は DB を作成せずに起動失敗する', async () => {
    const dir = temporaryDirectory()
    const dbPath = join(dir, 'passdown.sqlite3')
    const { child, ready, output } = start({
      PASSDOWN_START_MODE: 'invalid',
      PASSDOWN_DB_PATH: dbPath,
    })
    await expect(ready).rejects.toThrow('起動前に終了')
    expect(child.exitCode).toBe(1)
    expect(output()).toContain('PASSDOWN_START_MODE が不正です')
    expect(existsSync(dbPath)).toBe(false)
  })

  it('待機中は DB と HTTP を起動せず、SIGTERM で終了する', async () => {
    const dir = temporaryDirectory()
    const dbPath = join(dir, 'passdown.sqlite3')
    const port = await freePort()
    const { child, ready } = start({
      PASSDOWN_START_MODE: 'restore_wait',
      PASSDOWN_DB_PATH: dbPath,
      PASSDOWN_BACKUP_DIR: join(dir, 'backups'),
      PASSDOWN_PORT: String(port),
      PASSDOWN_MCP_ALLOWED_HOSTS: '',
    })
    await ready
    expect(existsSync(dbPath)).toBe(false)
    expect(existsSync(join(dir, 'backups'))).toBe(false)
    await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow()
    await stop(child)
    expect(child.exitCode).toBe(0)
  })

  it('通常起動からバックアップを作り、待機中に CLI で復元して通常起動へ戻せる', async () => {
    const dir = temporaryDirectory()
    const dbPath = join(dir, 'passdown.sqlite3')
    const backupDir = join(dir, 'backups')
    const sqlite = new Sqlite(dbPath)
    sqlite.exec(
      "create table restore_probe (value text not null); insert into restore_probe values ('before backup')",
    )
    sqlite.close()

    const port = await freePort()
    const env = {
      PASSDOWN_DB_PATH: dbPath,
      PASSDOWN_BACKUP_DIR: backupDir,
      PASSDOWN_HOST: '127.0.0.1',
      PASSDOWN_PORT: String(port),
      PASSDOWN_MCP_ALLOWED_HOSTS: 'localhost',
    }
    const server = start(env)
    await server.ready
    await fetch(`http://127.0.0.1:${port}/`)
    const backups = readdirSync(backupDir).filter((name) => name.startsWith('passdown-'))
    expect(backups).toHaveLength(1)
    await stop(server.child)

    const changed = new Sqlite(dbPath)
    changed.exec("insert into restore_probe values ('after backup')")
    changed.close()
    writeFileSync(`${dbPath}-wal`, 'saved wal')
    writeFileSync(`${dbPath}-shm`, 'saved shm')

    const waitPort = await freePort()
    const waiting = start({
      ...env,
      PASSDOWN_START_MODE: 'restore_wait',
      PASSDOWN_PORT: String(waitPort),
      PASSDOWN_MCP_ALLOWED_HOSTS: '',
    })
    await waiting.ready
    await expect(fetch(`http://127.0.0.1:${waitPort}/`)).rejects.toThrow()
    const id = backups[0]?.replace(/^passdown-/, '').replace(/\.sqlite3$/, '')
    expect(id).toBeDefined()
    const cliEnv = { ...process.env, ...env, PASSDOWN_MCP_ALLOWED_HOSTS: '' }
    const list = spawn(process.execPath, ['--import', 'tsx', 'src/cli/main.ts', 'backup', 'list'], {
      cwd: process.cwd(),
      env: cliEnv,
    })
    await new Promise<void>((resolve, reject) =>
      list.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`list: ${code}`)))),
    )
    const restore = spawn(
      process.execPath,
      ['--import', 'tsx', 'src/cli/main.ts', 'backup', 'restore', id ?? ''],
      { cwd: process.cwd(), env: cliEnv },
    )
    await new Promise<void>((resolve, reject) =>
      restore.once('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`restore: ${code}`)),
      ),
    )
    expect(readdirSync(dir).some((name) => name.includes('.before-restore-'))).toBe(true)
    const entries = readdirSync(dir)
    const wal = entries.find((name) => name.startsWith('passdown.sqlite3-wal.before-restore-'))
    const shm = entries.find((name) => name.startsWith('passdown.sqlite3-shm.before-restore-'))
    expect(wal).toBeDefined()
    expect(shm).toBeDefined()
    expect(readFileSync(join(dir, wal ?? ''), 'utf8')).toBe('saved wal')
    expect(readFileSync(join(dir, shm ?? ''), 'utf8')).toBe('saved shm')
    await stop(waiting.child)

    const restarted = start({ ...env, PASSDOWN_START_MODE: 'server' })
    await restarted.ready
    const restored = new Sqlite(dbPath, { readonly: true })
    try {
      expect(restored.prepare('select value from restore_probe').pluck().all()).toEqual([
        'before backup',
      ])
    } finally {
      restored.close()
    }
  }, 30000)
})
