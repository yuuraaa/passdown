import { z } from 'zod'
import { entityId } from '../activity/inputs.js'
import { documentStatuses, normalizeTag } from '../document/inputs.js'
import { taskStatuses } from '../task/inputs.js'

const datetime = z.iso.datetime({ offset: true })

export const searchInput = z.object({
  query: z
    .string()
    .default('')
    .describe(
      'Task・コメント・Document から部分一致で探すキーワード。空白区切りのすべての語を含むものに当てる',
    ),
  projectId: entityId('project')
    .optional()
    .describe('所属する Task と、その Project が参照する Document に絞り込む'),
  tag: z
    .string()
    .transform(normalizeTag)
    .refine((value) => value !== '', '空にできません')
    .optional()
    .describe('このタグを持つ Document に絞り込む'),
  actorId: entityId('actor')
    .optional()
    .describe('担当者または作成者がこの Actor の Task に絞り込む'),
  taskStatuses: z
    .array(z.enum(taskStatuses))
    .min(1)
    .default([...taskStatuses]),
  documentStatuses: z
    .array(z.enum(documentStatuses))
    .min(1)
    .default([...documentStatuses]),
  createdFrom: datetime.optional().describe('作成日時の下限（JST のISO 8601）'),
  createdTo: datetime.optional().describe('作成日時の上限（JST のISO 8601）'),
  updatedFrom: datetime.optional().describe('更新日時の下限（JST のISO 8601）'),
  updatedTo: datetime.optional().describe('更新日時の上限（JST のISO 8601）'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})
