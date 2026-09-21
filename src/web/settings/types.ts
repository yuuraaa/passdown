import type { InferResponseType } from 'hono/client'
import { api } from '../lib/api.js'

export type Actor = InferResponseType<typeof api.actors.$get>[number]
export type Agent = InferResponseType<(typeof api.actors)[':id']['$get']>
export type Token = InferResponseType<(typeof api.actors)[':id']['tokens']['$get']>[number]
export type Activity = InferResponseType<
  (typeof api.actors)[':id']['activities']['$get']
>['items'][number]

export type Permission = Agent['permissions'][keyof Agent['permissions']]
