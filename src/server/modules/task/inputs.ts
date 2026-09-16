import { z } from 'zod'
import { entityId } from '../activity/inputs.js'

export const taskStatuses = [
  'todo',
  'in_progress',
  'blocked',
  'review',
  'done',
  'cancelled',
] as const
export type TaskStatus = (typeof taskStatuses)[number]

export const taskPriorities = ['high', 'normal', 'low'] as const

const notBlank = (s: string) => s.trim() !== ''

export const createTaskInput = z.object({
  title: z.string().refine(notBlank, '空にできません').describe('タイトル'),
  description: z.string().default('').describe('何をするか'),
  acceptanceCriteria: z.string().default('').describe('何を満たせば完了か'),
  priority: z
    .enum(taskPriorities)
    .default('normal')
    .describe('優先度。担当の todo が複数あるとき、高いものから着手する'),
  links: z
    .array(z.string().refine(notBlank, '空にできません'))
    .default([])
    .describe('GitHub issue / PR 等の URL（記録のみ）'),
  assigneeId: entityId('actor')
    .optional()
    .describe('担当の Actor。省略すると担当なし（どのエージェントの着手対象にもならない）'),
  parentId: entityId('task')
    .optional()
    .describe('親 Task。親は todo / in_progress / blocked の Task に限る'),
  projectId: entityId('project')
    .optional()
    .describe(
      '所属する Project（active のものに限る）。省略すると、親があれば親の Project、なければ Project に属さない。親があるときは親と同じ Project しか指定できない',
    ),
})

export const startTaskInput = z.object({
  id: entityId('task').describe('着手する Task（todo のものに限る）'),
})
