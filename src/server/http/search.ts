import { Hono } from 'hono'
import { z } from 'zod'
import { search, searchInput } from '../modules/search/index.js'
import { type ApiEnv, type RouteDeps, webCtx } from './context.js'
import { expose } from './registry.js'
import { zValidator } from './validator.js'

// URL の query は常に文字列で届くため、REST 境界だけで数値へ直す。
const searchQueryInput = searchInput.extend({
  projectId: z.coerce.number().int().positive().optional(),
  actorId: z.coerce.number().int().positive().optional(),
})

export function searchRoutes(deps: RouteDeps) {
  const searchOperation = expose(search)
  return new Hono<ApiEnv>().get('/', zValidator('query', searchQueryInput), (c) =>
    c.json(searchOperation(webCtx(deps, c), c.req.valid('query')), 200),
  )
}
