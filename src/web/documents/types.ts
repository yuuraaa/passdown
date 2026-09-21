import type { InferResponseType } from 'hono/client'
import type { z } from 'zod'
import type { documentPageInput } from '../../server/modules/document/inputs.js'
import { api } from '../lib/api.js'

export type Actor = InferResponseType<typeof api.actors.$get>[number]
export type Document = InferResponseType<(typeof api.documents)[':id']['$get']>
export type DocumentReferences = InferResponseType<
  (typeof api.documents)[':id']['references']['$get']
>
export type Activity = InferResponseType<
  (typeof api.documents)[':id']['activities']['$get']
>['items'][number]
export type DocumentStatus = z.output<typeof documentPageInput>['status']
