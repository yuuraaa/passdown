import { useQuery } from '@tanstack/react-query'
import { api, readJson } from '../lib/api.js'
import type { SearchInput, SearchResponse } from './types.js'

export const searchQueryKeys = {
  result: (input: SearchInput | null) => ['search', input] as const,
}

export function useSearch(input: SearchInput | null) {
  return useQuery({
    queryKey: searchQueryKeys.result(input),
    enabled: input !== null,
    queryFn: async () => {
      if (!input) throw new Error('検索条件がありません')
      return readJson<SearchResponse>(
        await api.search.$get({
          query: {
            query: input.query,
            projectId: input.projectId === undefined ? undefined : String(input.projectId),
            tag: input.tag,
            actorId: input.actorId === undefined ? undefined : String(input.actorId),
            taskStatuses: input.taskStatuses,
            documentStatuses: input.documentStatuses,
            createdFrom: input.createdFrom,
            createdTo: input.createdTo,
            updatedFrom: input.updatedFrom,
            updatedTo: input.updatedTo,
            limit: String(input.limit),
          },
        }),
      )
    },
  })
}
