import { createInterface } from 'node:readline/promises'
import { loadConfig } from '../server/config.js'
import { openDatabase } from '../server/db/connection.js'
import { runCli, type CliIo } from './commands.js'

class InterruptedError extends Error {}

function createTerminalIo(): CliIo {
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
  }
}

try {
  const config = loadConfig(process.env)
  const database = openDatabase(config.PASSDOWN_DB_PATH)
  process.exitCode = await runCli(process.argv.slice(2), {
    db: database.db,
    io: createTerminalIo(),
  })
  database.sqlite.close()
} catch (error) {
  if (!(error instanceof InterruptedError))
    console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
