import { eq } from 'drizzle-orm'
import { NotFoundError } from '../../core/errors.js'
import type { Ctx } from '../../core/operation.js'
import type { ProjectStatus } from './inputs.js'
import { projects } from './schema.js'

/** Project の状態を読む（Task の作成・Project の変更から呼ばれる。設計書 4.5）。無ければ「見つからない」 */
export function getProjectStatus(ctx: Ctx, projectId: number): ProjectStatus {
  return ctx.db.transaction((tx) => {
    const row = tx
      .select({ status: projects.status })
      .from(projects)
      .where(eq(projects.id, projectId))
      .get()
    if (!row) {
      throw new NotFoundError(`project:${projectId} が見つかりません`)
    }
    return row.status
  })
}
