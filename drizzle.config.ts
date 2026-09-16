import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  // 全モジュールの schema.ts を渡す（4.4）
  schema: './src/server/modules/*/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.PASSDOWN_DB_PATH ?? '/data/passdown.sqlite3',
  },
})
