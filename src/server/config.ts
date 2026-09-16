import { z } from 'zod'

const hostList = z
  .string()
  .transform((s) =>
    s
      .split(',')
      .map((h) => h.trim())
      .filter((h) => h !== ''),
  )
  .pipe(z.array(z.string()).min(1))

const envSchema = z.object({
  PASSDOWN_DB_PATH: z.string().min(1).default('/data/passdown.sqlite3'),
  PASSDOWN_BACKUP_DIR: z.string().min(1).default('/data/backups'),
  PASSDOWN_HOST: z.string().min(1).default('0.0.0.0'),
  PASSDOWN_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  // 既定値を持たせると検証が緩いまま気づかず運用できてしまうため、必須にする（設計書 2.9）
  PASSDOWN_MCP_ALLOWED_HOSTS: hostList,
  PASSDOWN_BACKUP_KEEP_DAILY: z.coerce.number().int().min(1).default(14),
  PASSDOWN_BACKUP_KEEP_MIGRATION: z.coerce.number().int().min(1).default(5),
  PASSDOWN_BACKUP_AT: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .default('03:00'),
})

export type Config = z.output<typeof envSchema>

/** 環境変数を起動時に1か所で読んで検証する。足りなければ例外を投げる（設計書 2.9） */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const result = envSchema.safeParse(env)
  if (!result.success) {
    throw new Error(`環境変数が不正です:\n${z.prettifyError(result.error)}`)
  }
  return result.data
}
