import type { InferResponseType } from 'hono/client'
import type { z } from 'zod'
import type { listInboxItemsInput } from '../../server/modules/inbox/inputs.js'
import { api } from '../lib/api.js'

export type InboxItem = InferResponseType<(typeof api)['inbox-items'][':id']['$get']>
export type InboxItemStatus = z.output<typeof listInboxItemsInput>['status']
export type Actor = InferResponseType<typeof api.actors.$get>[number]
export type InboxActivity = InferResponseType<
  (typeof api)['inbox-items'][':id']['activities']['$get']
>['items'][number]
