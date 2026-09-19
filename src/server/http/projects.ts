import { Hono } from 'hono'
import {
  archiveProject,
  completeProject,
  createProject,
  createProjectInput,
  getProjectContext,
  getProjectOperation,
  listProjects,
  listProjectsInput,
  updateProject,
  updateProjectInput,
} from '../modules/project/index.js'
import { type ApiEnv, type RouteDeps, webCtx } from './context.js'
import { expose } from './registry.js'
import { idParam, zValidator } from './validator.js'

export function projectRoutes(deps: RouteDeps) {
  const list = expose(listProjects)
  const create = expose(createProject)
  const get = expose(getProjectOperation)
  const update = expose(updateProject)
  const context = expose(getProjectContext)
  const complete = expose(completeProject)
  const archive = expose(archiveProject)

  return new Hono<ApiEnv>()
    .get('/', zValidator('query', listProjectsInput), (c) =>
      c.json(list(webCtx(deps, c), c.req.valid('query')), 200),
    )
    .post('/', zValidator('json', createProjectInput), (c) =>
      c.json(create(webCtx(deps, c), c.req.valid('json')), 200),
    )
    .get('/:id', zValidator('param', idParam), (c) =>
      c.json(get(webCtx(deps, c), c.req.valid('param')), 200),
    )
    .patch(
      '/:id',
      zValidator('param', idParam),
      zValidator('json', updateProjectInput.omit({ id: true })),
      (c) =>
        c.json(
          update(webCtx(deps, c), { id: c.req.valid('param').id, ...c.req.valid('json') }),
          200,
        ),
    )
    .get('/:id/context', zValidator('param', idParam), (c) =>
      c.json(context(webCtx(deps, c), c.req.valid('param')), 200),
    )
    .post('/:id/complete', zValidator('param', idParam), (c) =>
      c.json(complete(webCtx(deps, c), c.req.valid('param')), 200),
    )
    .post('/:id/archive', zValidator('param', idParam), (c) =>
      c.json(archive(webCtx(deps, c), c.req.valid('param')), 200),
    )
}
