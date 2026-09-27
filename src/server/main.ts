import { resolve } from 'node:path'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { createApp } from './app.js'
import { loadConfig, loadStartMode } from './config.js'
import { openDatabase } from './db/connection.js'
import { applyMigrations } from './db/migrate.js'
import { backupMiddleware } from './db/backup.js'

const root = resolve(import.meta.dirname, '../..')

// 起動モードを DB 初期化前に選ぶ。復元待機中は CLI の実行を待つだけにする。
try {
  const mode = loadStartMode(process.env)
  if (mode === 'restore_wait') {
    console.log('passdown: 復元待機中です。CLI でバックアップを確認・復元してください。')
    const keepAlive = setInterval(() => {}, 60 * 60 * 1000)
    await new Promise<void>((resolve) => {
      process.once('SIGINT', () => resolve())
      process.once('SIGTERM', () => resolve())
    })
    clearInterval(keepAlive)
    console.log('passdown: 復元待機を終了します。')
  } else {
    const config = loadConfig(process.env)
    const database = openDatabase(config.PASSDOWN_DB_PATH)
    const migration = await applyMigrations(database, {
      migrationsFolder: resolve(root, 'drizzle'),
      backupDir: config.PASSDOWN_BACKUP_DIR,
      keep: config.PASSDOWN_BACKUP_KEEP_MIGRATION,
      now: new Date(),
    })
    console.log(`マイグレーション: ${JSON.stringify(migration)}`)

    const app = new Hono()
    app.use(
      '*',
      backupMiddleware(
        database.sqlite,
        config.PASSDOWN_BACKUP_DIR,
        config.PASSDOWN_BACKUP_INTERVAL_MS,
        config.PASSDOWN_CHECK_INTERVAL_MS,
        config.PASSDOWN_BACKUP_KEEP_DAILY,
      ),
    )
    app.route(
      '/',
      createApp({
        db: database.db,
        now: () => new Date(),
        mcpAllowedHosts: config.PASSDOWN_MCP_ALLOWED_HOSTS,
        webRoot: resolve(root, 'dist/web'),
      }),
    )

    serve(
      { fetch: app.fetch, hostname: config.PASSDOWN_HOST, port: config.PASSDOWN_PORT },
      (info) => console.log(`passdown: http://${info.address}:${info.port}`),
    )
  }
} catch (err) {
  console.error('起動に失敗しました', err)
  process.exit(1)
}
