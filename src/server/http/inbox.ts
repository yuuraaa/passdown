import { Hono } from 'hono'
import {
  archiveInboxItem,
  captureInboxItem,
  captureInboxItemInput,
  convertInboxItem,
  convertInboxItemInput,
  getInboxItemOperation,
  listInboxItems,
  listInboxItemsInput,
  updateInboxItem,
  updateInboxItemInput,
} from '../modules/inbox/index.js'
import { type ApiEnv, type RouteDeps, webCtx } from './context.js'
import { expose } from './registry.js'
import { idParam, zValidator } from './validator.js'

export function inboxItemRoutes(deps: RouteDeps) {
  const list = expose(listInboxItems)
  const get = expose(getInboxItemOperation)
  const capture = expose(captureInboxItem)
  const update = expose(updateInboxItem)
  const convert = expose(convertInboxItem)
  const archive = expose(archiveInboxItem)

  return new Hono<ApiEnv>()
    .get('/', zValidator('query', listInboxItemsInput), (c) =>
      c.json(list(webCtx(deps, c), c.req.valid('query')), 200),
    )
    .post('/', zValidator('json', captureInboxItemInput), (c) =>
      c.json(capture(webCtx(deps, c), c.req.valid('json')), 200),
    )
    .get('/:id', zValidator('param', idParam), (c) =>
      c.json(get(webCtx(deps, c), c.req.valid('param')), 200),
    )
    .patch(
      '/:id',
      zValidator('param', idParam),
      zValidator('json', updateInboxItemInput.omit({ id: true })),
      (c) =>
        c.json(
          update(webCtx(deps, c), { id: c.req.valid('param').id, ...c.req.valid('json') }),
          200,
        ),
    )
    .post(
      '/:id/convert',
      zValidator('param', idParam),
      zValidator('json', convertInboxItemInput.omit({ id: true })),
      (c) =>
        c.json(
          convert(webCtx(deps, c), { id: c.req.valid('param').id, ...c.req.valid('json') }),
          200,
        ),
    )
    .post('/:id/archive', zValidator('param', idParam), (c) =>
      c.json(archive(webCtx(deps, c), c.req.valid('param')), 200),
    )
}
