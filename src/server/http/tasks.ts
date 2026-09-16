import { Hono } from 'hono'
import { createTask, createTaskInput, startTask } from '../modules/task/index.js'
import { type ApiEnv, type RouteDeps, webCtx } from './context.js'
import { expose } from './registry.js'
import { idParam, zValidator } from './validator.js'

export function taskRoutes(deps: RouteDeps) {
  const create = expose(createTask)
  const start = expose(startTask)

  return new Hono<ApiEnv>()
    .post('/', zValidator('json', createTaskInput), (c) =>
      c.json(create(webCtx(deps, c), c.req.valid('json')), 200),
    )
    .post('/:id/start', zValidator('param', idParam), (c) =>
      c.json(start(webCtx(deps, c), c.req.valid('param')), 200),
    )
}
