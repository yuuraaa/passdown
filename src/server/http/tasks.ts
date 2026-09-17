import { Hono } from 'hono'
import { activityPageInput, getEntityActivities } from '../modules/activity/index.js'
import { createTask, createTaskInput, startTask } from '../modules/task/index.js'
import { type ApiEnv, type RouteDeps, webCtx } from './context.js'
import { expose } from './registry.js'
import { idParam, zValidator } from './validator.js'

export function taskRoutes(deps: RouteDeps) {
  const create = expose(createTask)
  const start = expose(startTask)
  const getActivities = expose(getEntityActivities)

  return new Hono<ApiEnv>()
    .post('/', zValidator('json', createTaskInput), (c) =>
      c.json(create(webCtx(deps, c), c.req.valid('json')), 200),
    )
    .post('/:id/start', zValidator('param', idParam), (c) =>
      c.json(start(webCtx(deps, c), c.req.valid('param')), 200),
    )
    .get(
      '/:id/activities',
      zValidator('param', idParam),
      zValidator('query', activityPageInput),
      (c) =>
        c.json(
          getActivities(webCtx(deps, c), {
            entityType: 'task',
            entityId: c.req.valid('param').id,
            ...c.req.valid('query'),
          }),
          200,
        ),
    )
}
