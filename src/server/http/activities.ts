import { Hono } from 'hono'
import {
  activityPageInput,
  getActorActivities,
  getDocumentActivities,
  getProjectActivities,
} from '../modules/activity/index.js'
import { getInboxItemActivities } from '../modules/inbox/index.js'
import { type ApiEnv, type RouteDeps, webCtx } from './context.js'
import { expose } from './registry.js'
import { idParam, zValidator } from './validator.js'

export function actorActivityRoutes(deps: RouteDeps) {
  const getActivities = expose(getActorActivities)

  return new Hono<ApiEnv>().get(
    '/:id/activities',
    zValidator('param', idParam),
    zValidator('query', activityPageInput),
    (c) =>
      c.json(
        getActivities(webCtx(deps, c), {
          actorId: c.req.valid('param').id,
          ...c.req.valid('query'),
        }),
        200,
      ),
  )
}

export function projectActivityRoutes(deps: RouteDeps) {
  const getActivities = expose(getProjectActivities)

  return new Hono<ApiEnv>().get(
    '/:id/activities',
    zValidator('param', idParam),
    zValidator('query', activityPageInput),
    (c) =>
      c.json(
        getActivities(webCtx(deps, c), {
          projectId: c.req.valid('param').id,
          ...c.req.valid('query'),
        }),
        200,
      ),
  )
}

export function documentActivityRoutes(deps: RouteDeps) {
  const getActivities = expose(getDocumentActivities)

  return new Hono<ApiEnv>().get(
    '/:id/activities',
    zValidator('param', idParam),
    zValidator('query', activityPageInput),
    (c) =>
      c.json(
        getActivities(webCtx(deps, c), {
          documentId: c.req.valid('param').id,
          ...c.req.valid('query'),
        }),
        200,
      ),
  )
}

export function inboxItemActivityRoutes(deps: RouteDeps) {
  const getActivities = expose(getInboxItemActivities)

  return new Hono<ApiEnv>().get(
    '/:id/activities',
    zValidator('param', idParam),
    zValidator('query', activityPageInput),
    (c) =>
      c.json(
        getActivities(webCtx(deps, c), {
          inboxItemId: c.req.valid('param').id,
          ...c.req.valid('query'),
        }),
        200,
      ),
  )
}
