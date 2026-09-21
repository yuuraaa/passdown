import type { InferResponseType } from 'hono/client'
import type { taskPriorities, taskStatuses } from '../../server/modules/task/inputs.js'
import { api } from '../lib/api.js'

export type Task = InferResponseType<(typeof api.tasks)[':id']['$get']>
export type TaskList = InferResponseType<typeof api.tasks.$get>
export type TaskListItem = TaskList['items'][number]
export type TaskActivity = InferResponseType<
  (typeof api.tasks)[':id']['activities']['$get']
>['items'][number]
export type Actor = InferResponseType<typeof api.actors.$get>[number]
export type ProjectList = InferResponseType<typeof api.projects.$get>
export type DocumentList = InferResponseType<typeof api.documents.$get>
export type TaskStatus = (typeof taskStatuses)[number]
export type TaskPriority = (typeof taskPriorities)[number]
