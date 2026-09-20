import { Hono } from 'hono'
import {
  createAgentActor,
  createAgentActorInput,
  getAgentActor,
  issueToken,
  listActorTokens,
  listActors,
  revokeToken,
  updateAgentPermissions,
  updateAgentPermissionsInput,
} from '../modules/auth/index.js'
import { type ApiEnv, type RouteDeps, webCtx } from './context.js'
import { expose } from './registry.js'
import { idParam, zValidator } from './validator.js'

export function actorRoutes(deps: RouteDeps) {
  const list = expose(listActors)
  const get = expose(getAgentActor)
  const create = expose(createAgentActor)
  const updatePermissions = expose(updateAgentPermissions)
  const listTokens = expose(listActorTokens)
  const issue = expose(issueToken)
  return new Hono<ApiEnv>()
    .get('/', (c) => c.json(list(webCtx(deps, c), {}), 200))
    .get('/:id', zValidator('param', idParam), (c) =>
      c.json(get(webCtx(deps, c), c.req.valid('param')), 200),
    )
    .post('/', zValidator('json', createAgentActorInput), (c) =>
      c.json(create(webCtx(deps, c), c.req.valid('json')), 200),
    )
    .patch(
      '/:id/permissions',
      zValidator('param', idParam),
      zValidator('json', updateAgentPermissionsInput.omit({ id: true })),
      (c) =>
        c.json(
          updatePermissions(webCtx(deps, c), {
            id: c.req.valid('param').id,
            ...c.req.valid('json'),
          }),
          200,
        ),
    )
    .get('/:id/tokens', zValidator('param', idParam), (c) =>
      c.json(listTokens(webCtx(deps, c), { id: c.req.valid('param').id }), 200),
    )
    .post('/:id/tokens', zValidator('param', idParam), (c) =>
      c.json(issue(webCtx(deps, c), { id: c.req.valid('param').id }), 200),
    )
}

export function tokenRoutes(deps: RouteDeps) {
  const revoke = expose(revokeToken)
  return new Hono<ApiEnv>().post('/:id/revoke', zValidator('param', idParam), (c) =>
    c.json(revoke(webCtx(deps, c), { id: c.req.valid('param').id }), 200),
  )
}
