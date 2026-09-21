import type { InferResponseType } from 'hono/client'
import type { z } from 'zod'
import type { documentStatuses } from '../../server/modules/document/inputs.js'
import { searchInput } from '../../server/modules/search/inputs.js'
import type { taskStatuses } from '../../server/modules/task/inputs.js'
import { api } from '../lib/api.js'

export type SearchResponse = InferResponseType<typeof api.search.$get>
export type SearchInput = z.output<typeof searchInput>
export type TaskStatus = (typeof taskStatuses)[number]
export type DocumentStatus = (typeof documentStatuses)[number]
