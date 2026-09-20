import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, readJson } from '../lib/api.js'
import type {
  Actor,
  Project,
  ProjectActivity,
  ProjectList,
  ProjectStatus,
  ProjectTaskList,
  TaskStatus,
} from './types.js'

export const projectQueryKeys = {
  actors: ['actors'] as const,
  list: (statuses: readonly ProjectStatus[]) => ['projects', 'list', ...statuses] as const,
  detail: (id: number) => ['projects', id] as const,
  tasks: (id: number, statuses: readonly TaskStatus[]) =>
    ['projects', id, 'tasks', ...statuses] as const,
  activities: (id: number) => ['projects', id, 'activities'] as const,
  documents: ['documents', 'list', 'active'] as const,
}

export function useProjects(statuses: readonly ProjectStatus[]) {
  return useQuery({
    queryKey: projectQueryKeys.list(statuses),
    queryFn: async () =>
      readJson<ProjectList>(
        await api.projects.$get({ query: { statuses: [...statuses], limit: '200', offset: '0' } }),
      ),
  })
}

export function useProject(id: number) {
  return useQuery({
    queryKey: projectQueryKeys.detail(id),
    queryFn: async () =>
      readJson<Project>(await api.projects[':id'].$get({ param: { id: String(id) } })),
  })
}

export function useProjectTasks(id: number, statuses: readonly TaskStatus[]) {
  return useQuery({
    queryKey: projectQueryKeys.tasks(id, statuses),
    queryFn: async () =>
      readJson<ProjectTaskList>(
        await api.tasks.$get({
          query: { projectId: String(id), statuses: [...statuses], limit: '200', offset: '0' },
        }),
      ),
  })
}

export function useProjectActivities(id: number) {
  return useQuery({
    queryKey: projectQueryKeys.activities(id),
    queryFn: async () =>
      readJson<{ items: ProjectActivity[]; total: number }>(
        await api.projects[':id'].activities.$get({
          param: { id: String(id) },
          query: { limit: '200', offset: '0' },
        }),
      ),
  })
}

export function useActors() {
  return useQuery({
    queryKey: projectQueryKeys.actors,
    queryFn: async () => readJson<Actor[]>(await api.actors.$get()),
  })
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, id?: number) {
  void queryClient.invalidateQueries({ queryKey: ['projects'] })
  void queryClient.invalidateQueries({ queryKey: ['tasks'] })
  if (id) {
    void queryClient.invalidateQueries({ queryKey: projectQueryKeys.detail(id) })
    void queryClient.invalidateQueries({ queryKey: projectQueryKeys.activities(id) })
  }
}

export function useCreateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      name: string
      description: string
      instructions: string
      repositories: string[]
      documentIds: number[]
    }) => readJson<Project>(await api.projects.$post({ json: input })),
    onSuccess: (project) => {
      queryClient.setQueryData(projectQueryKeys.detail(project.id), project)
      invalidate(queryClient, project.id)
    },
  })
}

export function useUpdateProject(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      name: string
      description: string
      instructions: string
      repositories: string[]
      documentIds: number[]
      version: number
    }) =>
      readJson<Project>(
        await api.projects[':id'].$patch({ param: { id: String(id) }, json: input }),
      ),
    onSuccess: (project) => {
      queryClient.setQueryData(projectQueryKeys.detail(id), project)
      invalidate(queryClient, id)
    },
  })
}

function useProjectStatusMutation(id: number, action: 'complete' | 'archive') {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      readJson<Project>(await api.projects[':id'][action].$post({ param: { id: String(id) } })),
    onSuccess: (project) => {
      queryClient.setQueryData(projectQueryKeys.detail(id), project)
      invalidate(queryClient, id)
    },
  })
}

export const useCompleteProject = (id: number) => useProjectStatusMutation(id, 'complete')
export const useArchiveProject = (id: number) => useProjectStatusMutation(id, 'archive')
