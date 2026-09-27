import { createInterface } from 'node:readline/promises'
import { loadBackupPaths, loadConfig } from '../server/config.js'
import { openDatabase } from '../server/db/connection.js'
import { runCli } from './commands.js'
import type { CliIo } from './types.js'

class InterruptedError extends Error {}

function createTerminalIo(): CliIo & { close(): void } {
  const readline = createInterface({ input: process.stdin, output: process.stdout })
  return {
    isTTY: process.stdin.isTTY === true && process.stdout.isTTY === true,
    ask: (question) => readline.question(question),
    askPassword: (question) =>
      new Promise((resolve, reject) => {
        const stdin = process.stdin
        const done = (error?: Error, value?: string) => {
          stdin.off('data', onData)
          stdin.setRawMode(false)
          process.stdout.write('\n')
          if (error) reject(error)
          else resolve(value ?? '')
        }
        let value = ''
        const onData = (chunk: Buffer) => {
          for (const byte of chunk) {
            if (byte === 3) return done(new InterruptedError())
            if (byte === 13 || byte === 10) return done(undefined, value)
            if (byte === 8 || byte === 127) value = value.slice(0, -1)
            else value += String.fromCharCode(byte)
          }
        }
        process.stdout.write(question)
        stdin.setRawMode(true)
        stdin.resume()
        stdin.on('data', onData)
      }),
    write: (message) => process.stdout.write(message),
    close: () => readline.close(),
  }
}

try {
  const args = process.argv.slice(2)
  const config = args[0] === 'account' ? loadConfig(process.env) : loadBackupPaths(process.env)
  const database = args[0] === 'account' ? openDatabase(config.PASSDOWN_DB_PATH) : undefined
  const io = createTerminalIo()
  try {
    process.exitCode = await runCli(args, {
      db: database?.db,
      io,
      db_path: config.PASSDOWN_DB_PATH,
      backup_path: config.PASSDOWN_BACKUP_DIR,
    })
  } finally {
    io.close()
    database?.sqlite.close()
  }
} catch (error) {
  if (!(error instanceof InterruptedError))
    console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
