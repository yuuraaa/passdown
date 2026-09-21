import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, readJson } from '../lib/api.js'
import type { Activity, Actor, Agent, Token } from './types.js'

export const settingsQueryKeys = {
  actors: ['actors'] as const,
  agent: (id: number) => ['actors', id] as const,
  tokens: (id: number) => ['actors', id, 'tokens'] as const,
  activities: (id: number) => ['actors', id, 'activities'] as const,
}

export function useActors() {
  return useQuery({
    queryKey: settingsQueryKeys.actors,
    queryFn: async () => readJson<Actor[]>(await api.actors.$get()),
  })
}

export function useAgent(id: number) {
  return useQuery({
    queryKey: settingsQueryKeys.agent(id),
    queryFn: async () =>
      readJson<Agent>(await api.actors[':id'].$get({ param: { id: String(id) } })),
    enabled: Number.isInteger(id) && id > 0,
  })
}

export function useTokens(id: number) {
  return useQuery({
    queryKey: settingsQueryKeys.tokens(id),
    queryFn: async () =>
      readJson<Token[]>(await api.actors[':id'].tokens.$get({ param: { id: String(id) } })),
    enabled: Number.isInteger(id) && id > 0,
  })
}

export function useActivities(id: number) {
  return useQuery({
    queryKey: settingsQueryKeys.activities(id),
    queryFn: async () =>
      readJson<{ items: Activity[]; total: number }>(
        await api.actors[':id'].activities.$get({
          param: { id: String(id) },
          query: { limit: '50', offset: '0' },
        }),
      ),
    enabled: Number.isInteger(id) && id > 0,
  })
}

/** 一覧の最終 Activity 用。Actor 数は少数というv1の利用規模を前提にする。 */
export function useLatestActivities(agents: Actor[]) {
  return useQueries({
    queries: agents.map((agent) => ({
      queryKey: settingsQueryKeys.activities(agent.id),
      queryFn: async () =>
        readJson<{ items: Activity[]; total: number }>(
          await api.actors[':id'].activities.$get({
            param: { id: String(agent.id) },
            query: { limit: '1', offset: '0' },
          }),
        ),
    })),
  })
}

export function useTokensForAgents(agents: Actor[]) {
  return useQueries({
    queries: agents.map((agent) => ({
      queryKey: settingsQueryKeys.tokens(agent.id),
      queryFn: async () =>
        readJson<Token[]>(await api.actors[':id'].tokens.$get({ param: { id: String(agent.id) } })),
    })),
  })
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, actorId?: number) {
  void queryClient.invalidateQueries({ queryKey: settingsQueryKeys.actors })
  if (actorId) {
    void queryClient.invalidateQueries({ queryKey: settingsQueryKeys.agent(actorId) })
    void queryClient.invalidateQueries({ queryKey: settingsQueryKeys.tokens(actorId) })
    void queryClient.invalidateQueries({ queryKey: settingsQueryKeys.activities(actorId) })
  }
}

export function useCreateAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; permissions: Agent['permissions'] }) =>
      readJson<Agent>(await api.actors.$post({ json: input })),
    onSuccess: (agent) => invalidate(queryClient, agent.id),
  })
}

export function useUpdatePermissions(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (permissions: Agent['permissions']) =>
      readJson<Agent>(
        await api.actors[':id'].permissions.$patch({
          param: { id: String(id) },
          json: { permissions },
        }),
      ),
    onSuccess: () => {
      invalidate(queryClient, id)
    },
  })
}

export function useIssueToken(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      readJson<Token & { token: string }>(
        await api.actors[':id'].tokens.$post({ param: { id: String(id) } }),
      ),
    onSuccess: () => invalidate(queryClient, id),
  })
}

export function useRevokeToken(actorId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (tokenId: number) =>
      readJson<Token>(await api.tokens[':id'].revoke.$post({ param: { id: String(tokenId) } })),
    onSuccess: () => invalidate(queryClient, actorId),
  })
}
