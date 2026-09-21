import { Hono } from 'hono'
import { z } from 'zod'
import { activityPageInput, getTaskActivities } from '../modules/activity/index.js'
import {
  addTaskComment,
  addTaskCommentInput,
  approveTask,
  blockTask,
  blockTaskInput,
  cancelTask,
  cancelTaskInput,
  createTask,
  createTaskInput,
  getTaskOperation,
  listActionableTasks,
  listTasks,
  listTasksInput,
  requestTaskReview,
  requestTaskReviewInput,
  returnTaskToTodo,
  returnTaskToTodoInput,
  startTask,
  updateTask,
  updateTaskInput,
} from '../modules/task/index.js'
import { type ApiEnv, type RouteDeps, webCtx } from './context.js'
import { expose } from './registry.js'
import { idParam, zValidator } from './validator.js'

// URL の query は常に文字列で届く。業務入力の schema（MCP・JSON 用）は数値のまま保ち、
// REST の query 境界だけで数値に直す。
const listTasksQueryInput = listTasksInput.extend({
  projectId: z.coerce.number().int().positive().optional(),
  assigneeId: z.coerce.number().int().positive().optional(),
})

export function taskRoutes(deps: RouteDeps) {
  const create = expose(createTask)
  const list = expose(listTasks)
  const actionable = expose(listActionableTasks)
  const get = expose(getTaskOperation)
  const update = expose(updateTask)
  const comment = expose(addTaskComment)
  const start = expose(startTask)
  const block = expose(blockTask)
  const review = expose(requestTaskReview)
  const returnToTodo = expose(returnTaskToTodo)
  const approve = expose(approveTask)
  const cancel = expose(cancelTask)
  const getActivities = expose(getTaskActivities)

  return new Hono<ApiEnv>()
    .get('/', zValidator('query', listTasksQueryInput), (c) =>
      c.json(list(webCtx(deps, c), c.req.valid('query')), 200),
    )
    .get('/actionable', (c) => c.json(actionable(webCtx(deps, c), {}), 200))
    .post('/', zValidator('json', createTaskInput), (c) =>
      c.json(create(webCtx(deps, c), c.req.valid('json')), 200),
    )
    .get('/:id', zValidator('param', idParam), (c) =>
      c.json(get(webCtx(deps, c), c.req.valid('param')), 200),
    )
    .patch(
      '/:id',
      zValidator('param', idParam),
      zValidator('json', updateTaskInput.omit({ id: true })),
      (c) =>
        c.json(
          update(webCtx(deps, c), { id: c.req.valid('param').id, ...c.req.valid('json') }),
          200,
        ),
    )
    .post(
      '/:id/comments',
      zValidator('param', idParam),
      zValidator('json', addTaskCommentInput.omit({ id: true })),
      (c) =>
        c.json(
          comment(webCtx(deps, c), { id: c.req.valid('param').id, ...c.req.valid('json') }),
          200,
        ),
    )
    .post('/:id/start', zValidator('param', idParam), (c) =>
      c.json(start(webCtx(deps, c), c.req.valid('param')), 200),
    )
    .post(
      '/:id/block',
      zValidator('param', idParam),
      zValidator('json', blockTaskInput.omit({ id: true })),
      (c) =>
        c.json(
          block(webCtx(deps, c), { id: c.req.valid('param').id, ...c.req.valid('json') }),
          200,
        ),
    )
    .post(
      '/:id/request-review',
      zValidator('param', idParam),
      zValidator('json', requestTaskReviewInput.omit({ id: true })),
      (c) =>
        c.json(
          review(webCtx(deps, c), { id: c.req.valid('param').id, ...c.req.valid('json') }),
          200,
        ),
    )
    .post(
      '/:id/return-to-todo',
      zValidator('param', idParam),
      zValidator('json', returnTaskToTodoInput.omit({ id: true })),
      (c) =>
        c.json(
          returnToTodo(webCtx(deps, c), { id: c.req.valid('param').id, ...c.req.valid('json') }),
          200,
        ),
    )
    .post('/:id/approve', zValidator('param', idParam), (c) =>
      c.json(approve(webCtx(deps, c), c.req.valid('param')), 200),
    )
    .post(
      '/:id/cancel',
      zValidator('param', idParam),
      zValidator('json', cancelTaskInput.omit({ id: true })),
      (c) =>
        c.json(
          cancel(webCtx(deps, c), { id: c.req.valid('param').id, ...c.req.valid('json') }),
          200,
        ),
    )
    .get(
      '/:id/activities',
      zValidator('param', idParam),
      zValidator('query', activityPageInput),
      (c) =>
        c.json(
          getActivities(webCtx(deps, c), {
            taskId: c.req.valid('param').id,
            ...c.req.valid('query'),
          }),
          200,
        ),
    )
}
