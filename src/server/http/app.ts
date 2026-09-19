import { Hono } from 'hono'
import {
  actorActivityRoutes,
  documentActivityRoutes,
  inboxItemActivityRoutes,
  projectActivityRoutes,
} from './activities.js'
import { actorRoutes, tokenRoutes } from './actors.js'
import { sessionAuth } from './auth.js'
import type { ApiEnv, RouteDeps } from './context.js'
import { handleError } from './errors.js'
import { taskRoutes } from './tasks.js'
import { documentRoutes, documentTagRoutes } from './documents.js'
import { sessionRoutes } from './sessions.js'
import { projectRoutes } from './projects.js'
import { inboxItemRoutes } from './inbox.js'
import { searchRoutes } from './search.js'

/** REST API（/api）。Web UI 専用で、ログインのセッションだけを受け付ける（設計書 7章） */
export function createApi(deps: RouteDeps) {
  return new Hono<ApiEnv>()
    .onError(handleError)
    .route('/session', sessionRoutes(deps))
    .use(sessionAuth(deps))
    .route('/actors', actorRoutes(deps).route('/', actorActivityRoutes(deps)))
    .route('/tokens', tokenRoutes(deps))
    .route('/document-tags', documentTagRoutes(deps))
    .route('/documents', documentRoutes(deps).route('/', documentActivityRoutes(deps)))
    .route('/inbox-items', inboxItemRoutes(deps).route('/', inboxItemActivityRoutes(deps)))
    .route('/projects', projectRoutes(deps).route('/', projectActivityRoutes(deps)))
    .route('/tasks', taskRoutes(deps))
    .route('/search', searchRoutes(deps))
}

/** Web UI が Hono RPC で使う型（設計書 4.8） */
export type ApiType = ReturnType<typeof createApi>
