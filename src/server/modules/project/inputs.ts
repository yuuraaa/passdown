import { z } from 'zod'
import { entityId } from '../activity/inputs.js'

export const projectStatuses = ['active', 'done', 'archived'] as const
export type ProjectStatus = (typeof projectStatuses)[number]

const notBlank = (s: string) => s.trim() !== ''
const page = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
export const listProjectsInput = page.extend({
  statuses: z
    .array(z.enum(projectStatuses))
    .min(1)
    .default([...projectStatuses]),
})
export const getProjectInput = z.object({ id: entityId('project') })
export const createProjectInput = z.object({
  name: z.string().refine(notBlank, '空にできません').describe('Project 名'),
  description: z.string().default('').describe('何の Project か・どうなったら完了か'),
  instructions: z.string().default('').describe('エージェント向けの作業指示'),
  repositories: z.array(z.string().refine(notBlank, '空にできません')).default([]),
  documentIds: z.array(entityId('document')).default([]),
})
export const updateProjectInput = createProjectInput.extend({
  id: entityId('project'),
  version: z.number().int().positive(),
})
export const completeProjectInput = getProjectInput
export const archiveProjectInput = getProjectInput
