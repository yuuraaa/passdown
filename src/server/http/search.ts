import { Hono } from 'hono'
import { search, searchInput } from '../modules/search/index.js'
import { type ApiEnv, type RouteDeps, webCtx } from './context.js'
import { expose } from './registry.js'
import { zValidator } from './validator.js'

export function searchRoutes(deps: RouteDeps) {
  const searchOperation = expose(search)
  return new Hono<ApiEnv>().get('/', zValidator('query', searchInput), (c) =>
    c.json(searchOperation(webCtx(deps, c), c.req.valid('query')), 200),
  )
}
