import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, readJson } from '../lib/api.js'
import type { Actor, InboxActivity, InboxItem, InboxItemStatus } from './types.js'

export const inboxQueryKeys = {
  actors: ['actors'] as const,
  list: (status: InboxItemStatus) => ['inbox-items', 'list', status] as const,
  detail: (id: number) => ['inbox-items', id] as const,
  activities: (id: number) => ['inbox-items', id, 'activities'] as const,
}

export function useActors() {
  return useQuery({
    queryKey: inboxQueryKeys.actors,
    queryFn: async () => readJson<Actor[]>(await api.actors.$get()),
  })
}

export function useInboxItems(status: InboxItemStatus) {
  return useQuery({
    queryKey: inboxQueryKeys.list(status),
    queryFn: async () =>
      readJson<{ items: InboxItem[]; total: number }>(
        await api['inbox-items'].$get({ query: { status, limit: '50', offset: '0' } }),
      ),
  })
}

export function useInboxItem(id: number) {
  return useQuery({
    queryKey: inboxQueryKeys.detail(id),
    queryFn: async () =>
      readJson<InboxItem>(await api['inbox-items'][':id'].$get({ param: { id: String(id) } })),
  })
}

export function useInboxActivities(id: number) {
  return useQuery({
    queryKey: inboxQueryKeys.activities(id),
    queryFn: async () =>
      readJson<{ items: InboxActivity[]; total: number }>(
        await api['inbox-items'][':id'].activities.$get({
          param: { id: String(id) },
          query: { limit: '50', offset: '0' },
        }),
      ),
  })
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, id?: number) {
  void queryClient.invalidateQueries({ queryKey: ['inbox-items'] })
  if (id) void queryClient.invalidateQueries({ queryKey: inboxQueryKeys.activities(id) })
}

export function useCaptureInboxItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { content: string }) =>
      readJson<InboxItem>(await api['inbox-items'].$post({ json: input })),
    onSuccess: (item) => {
      queryClient.setQueryData(inboxQueryKeys.detail(item.id), item)
      invalidate(queryClient, item.id)
    },
  })
}

export function useUpdateInboxItem(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { content: string; version: number }) =>
      readJson<InboxItem>(
        await api['inbox-items'][':id'].$patch({ param: { id: String(id) }, json: input }),
      ),
    onSuccess: (item) => {
      queryClient.setQueryData(inboxQueryKeys.detail(id), item)
      invalidate(queryClient, id)
    },
  })
}

export function useArchiveInboxItem(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      readJson<InboxItem>(
        await api['inbox-items'][':id'].archive.$post({ param: { id: String(id) } }),
      ),
    onSuccess: (item) => {
      queryClient.setQueryData(inboxQueryKeys.detail(id), item)
      invalidate(queryClient, id)
    },
  })
}

export type InboxConversion =
  | {
      targetType: 'project'
      target: {
        name: string
        description: string
        instructions: string
        repositories: string[]
        documentIds: number[]
      }
    }
  | {
      targetType: 'task'
      target: {
        title: string
        description: string
        acceptanceCriteria: string
        priority: 'low' | 'normal' | 'high'
        links: string[]
      }
    }
  | { targetType: 'document'; target: { title: string; content: string; tags: string[] } }

export function useConvertInboxItem(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: InboxConversion) =>
      readJson<InboxItem>(
        await api['inbox-items'][':id'].convert.$post({
          param: { id: String(id) },
          json: { target: input },
        }),
      ),
    onSuccess: (item) => {
      queryClient.setQueryData(inboxQueryKeys.detail(id), item)
      invalidate(queryClient, id)
    },
  })
}
