import type { InferResponseType } from 'hono/client'
import type { projectStatuses } from '../../server/modules/project/inputs.js'
import type { taskStatuses } from '../../server/modules/task/inputs.js'
import { api } from '../lib/api.js'

export type Project = InferResponseType<(typeof api.projects)[':id']['$get']>
export type ProjectList = InferResponseType<typeof api.projects.$get>
export type ProjectTaskList = InferResponseType<typeof api.tasks.$get>
export type ProjectActivity =
  InferResponseType<(typeof api.projects)[':id']['activities']['$get']> extends {
    items: Array<infer Item>
  }
    ? Item
    : never
export type Actor = InferResponseType<typeof api.actors.$get>[number]
export type ProjectStatus = (typeof projectStatuses)[number]
export type TaskStatus = (typeof taskStatuses)[number]
