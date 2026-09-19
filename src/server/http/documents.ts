import { Hono } from 'hono'
import {
  archiveDocument,
  createDocument,
  createDocumentInput,
  documentPageInput,
  getDocumentOperation,
  listDocumentTags,
  listDocuments,
  updateDocument,
  updateDocumentInput,
} from '../modules/document/index.js'
import { type ApiEnv, type RouteDeps, webCtx } from './context.js'
import { expose } from './registry.js'
import { idParam, zValidator } from './validator.js'

export function documentRoutes(deps: RouteDeps) {
  const list = expose(listDocuments)
  const get = expose(getDocumentOperation)
  const create = expose(createDocument)
  const update = expose(updateDocument)
  const archive = expose(archiveDocument)

  return new Hono<ApiEnv>()
    .get('/', zValidator('query', documentPageInput), (c) =>
      c.json(list(webCtx(deps, c), c.req.valid('query')), 200),
    )
    .post('/', zValidator('json', createDocumentInput), (c) =>
      c.json(create(webCtx(deps, c), c.req.valid('json')), 200),
    )
    .get('/:id', zValidator('param', idParam), (c) =>
      c.json(get(webCtx(deps, c), c.req.valid('param')), 200),
    )
    .patch(
      '/:id',
      zValidator('param', idParam),
      zValidator('json', updateDocumentInput.omit({ id: true })),
      (c) =>
        c.json(
          update(webCtx(deps, c), { id: c.req.valid('param').id, ...c.req.valid('json') }),
          200,
        ),
    )
    .post('/:id/archive', zValidator('param', idParam), (c) =>
      c.json(archive(webCtx(deps, c), c.req.valid('param')), 200),
    )
}

export function documentTagRoutes(deps: RouteDeps) {
  const listTags = expose(listDocumentTags)
  return new Hono<ApiEnv>().get('/', (c) => c.json(listTags(webCtx(deps, c), {}), 200))
}
