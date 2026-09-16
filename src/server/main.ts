import { resolve } from 'node:path'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { openDatabase } from './db/connection.js'
import { applyMigrations } from './db/migrate.js'

const root = resolve(import.meta.dirname, '../..')

// 起動 → DB のコピーを残す → 未適用のマイグレーションを適用 → サーバーを開始（設計書 2.6）。
// 途中で失敗したら、サーバーを開始せずに異常終了する
try {
  const config = loadConfig(process.env)
  const database = openDatabase(config.PASSDOWN_DB_PATH)
  const migration = applyMigrations(database, {
    migrationsFolder: resolve(root, 'drizzle'),
    backupDir: config.PASSDOWN_BACKUP_DIR,
    keep: config.PASSDOWN_BACKUP_KEEP_MIGRATION,
    now: new Date(),
  })
  console.log(`マイグレーション: ${JSON.stringify(migration)}`)

  const app = createApp({
    db: database.db,
    now: () => new Date(),
    mcpAllowedHosts: config.PASSDOWN_MCP_ALLOWED_HOSTS,
    webRoot: resolve(root, 'dist/web'),
  })
  serve({ fetch: app.fetch, hostname: config.PASSDOWN_HOST, port: config.PASSDOWN_PORT }, (info) =>
    console.log(`passdown: http://${info.address}:${info.port}`),
  )
} catch (err) {
  console.error('起動に失敗しました', err)
  process.exit(1)
}
