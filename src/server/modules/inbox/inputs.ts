import { z } from 'zod'
import { entityId } from '../activity/inputs.js'
import { createDocumentInput } from '../document/inputs.js'
import { createProjectInput } from '../project/inputs.js'
import { createTaskInput } from '../task/inputs.js'

export const inboxItemStatuses = ['untriaged', 'triaged', 'archived'] as const
export type InboxItemStatus = (typeof inboxItemStatuses)[number]

const notBlank = (value: string) => value.trim() !== ''
const page = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export const listInboxItemsInput = page.extend({
  status: z.enum(inboxItemStatuses).default('untriaged').describe('表示する状態。既定は untriaged'),
})

export const getInboxItemInput = z.object({
  id: entityId('inbox_item').describe('取得する Inbox Item'),
})

export const captureInboxItemInput = z.object({
  content: z
    .string()
    .refine(notBlank, '空にできません')
    .describe('整理すると Project / Task / Document になりうる思いつき'),
})

export const updateInboxItemInput = z.object({
  id: entityId('inbox_item').describe('更新する untriaged の Inbox Item'),
  content: z.string().refine(notBlank, '空にできません'),
  version: z.number().int().positive().describe('読み取った Inbox Item の version'),
})

export const archiveInboxItemInput = z.object({
  id: entityId('inbox_item').describe('archive する untriaged の Inbox Item'),
})

export const convertInboxItemInput = z.object({
  id: entityId('inbox_item').describe('変換する untriaged の Inbox Item'),
  target: z.discriminatedUnion('targetType', [
    z.object({ targetType: z.literal('project'), target: createProjectInput }),
    z.object({ targetType: z.literal('task'), target: createTaskInput }),
    z.object({ targetType: z.literal('document'), target: createDocumentInput }),
  ]),
})
