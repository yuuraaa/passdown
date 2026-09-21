import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, readJson } from '../lib/api.js'
import type {
  Actor,
  DocumentList,
  ProjectList,
  Task,
  TaskActivity,
  TaskList,
  TaskStatus,
} from './types.js'

export const taskQueryKeys = {
  list: (statuses: readonly TaskStatus[], projectId?: number, assigneeId?: number) =>
    ['tasks', 'list', ...statuses, projectId ?? null, assigneeId ?? null] as const,
  detail: (id: number) => ['tasks', id] as const,
  activities: (id: number) => ['tasks', id, 'activities'] as const,
  actors: ['actors'] as const,
  projects: ['projects', 'task-options'] as const,
  documents: ['documents', 'task-options'] as const,
}

export function useTasks(statuses: readonly TaskStatus[], projectId?: number, assigneeId?: number) {
  return useQuery({
    queryKey: taskQueryKeys.list(statuses, projectId, assigneeId),
    queryFn: async () =>
      readJson<TaskList>(
        await api.tasks.$get({
          query: {
            statuses: [...statuses],
            projectId: projectId === undefined ? undefined : String(projectId),
            assigneeId: assigneeId === undefined ? undefined : String(assigneeId),
            limit: '200',
            offset: '0',
          },
        }),
      ),
  })
}

export function useTask(id: number) {
  return useQuery({
    queryKey: taskQueryKeys.detail(id),
    queryFn: async () => readJson<Task>(await api.tasks[':id'].$get({ param: { id: String(id) } })),
  })
}

export function useTaskActivities(id: number) {
  return useQuery({
    queryKey: taskQueryKeys.activities(id),
    queryFn: async () =>
      readJson<{ items: TaskActivity[]; total: number }>(
        await api.tasks[':id'].activities.$get({
          param: { id: String(id) },
          query: { limit: '200', offset: '0' },
        }),
      ),
  })
}

export function useActors() {
  return useQuery({
    queryKey: taskQueryKeys.actors,
    queryFn: async () => readJson<Actor[]>(await api.actors.$get()),
  })
}

export function useTaskProjects() {
  return useQuery({
    queryKey: taskQueryKeys.projects,
    queryFn: async () =>
      readJson<ProjectList>(
        await api.projects.$get({
          query: { statuses: ['active', 'done', 'archived'], limit: '200', offset: '0' },
        }),
      ),
  })
}

export function useTaskDocuments() {
  return useQuery({
    queryKey: taskQueryKeys.documents,
    queryFn: async () =>
      readJson<DocumentList>(
        await api.documents.$get({ query: { status: 'active', limit: '200', offset: '0' } }),
      ),
  })
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, id?: number) {
  void queryClient.invalidateQueries({ queryKey: ['tasks'] })
  void queryClient.invalidateQueries({ queryKey: ['projects'] })
  if (id) {
    void queryClient.invalidateQueries({ queryKey: taskQueryKeys.detail(id) })
    void queryClient.invalidateQueries({ queryKey: taskQueryKeys.activities(id) })
  }
}

export function useCreateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      title: string
      description: string
      acceptanceCriteria: string
      priority: 'high' | 'normal' | 'low'
      links: string[]
      assigneeId?: number
      parentId?: number
      projectId?: number
    }) => readJson<{ id: number }>(await api.tasks.$post({ json: input })),
    onSuccess: (task) => {
      invalidate(queryClient, task.id)
    },
  })
}

export function useUpdateTask(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      title: string
      description: string
      acceptanceCriteria: string
      priority: 'high' | 'normal' | 'low'
      links: string[]
      assigneeId: number | null
      parentId: number | null
      projectId: number | null
      documentIds: number[]
      version: number
    }) => readJson<Task>(await api.tasks[':id'].$patch({ param: { id: String(id) }, json: input })),
    onSuccess: (task) => {
      queryClient.setQueryData(taskQueryKeys.detail(id), task)
      invalidate(queryClient, id)
    },
  })
}

function useTaskAction<T>(id: number, mutationFn: (input: T) => Promise<Task>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => invalidate(queryClient, id),
  })
}

export function useStartTask(id: number) {
  return useTaskAction(id, async () =>
    readJson<Task>(await api.tasks[':id'].start.$post({ param: { id: String(id) } })),
  )
}
export function useBlockTask(id: number) {
  return useTaskAction(id, async (input: { blockedReason: string }) =>
    readJson<Task>(await api.tasks[':id'].block.$post({ param: { id: String(id) }, json: input })),
  )
}
export function useRequestTaskReview(id: number) {
  return useTaskAction(id, async (input: { result: string }) =>
    readJson<Task>(
      await api.tasks[':id']['request-review'].$post({ param: { id: String(id) }, json: input }),
    ),
  )
}
export function useReturnTaskToTodo(id: number) {
  return useTaskAction(id, async (input: { body: string }) =>
    readJson<Task>(
      await api.tasks[':id']['return-to-todo'].$post({ param: { id: String(id) }, json: input }),
    ),
  )
}
export function useApproveTask(id: number) {
  return useTaskAction(id, async () =>
    readJson<Task>(await api.tasks[':id'].approve.$post({ param: { id: String(id) } })),
  )
}
export function useCancelTask(id: number) {
  return useTaskAction(id, async (input: { result: string }) =>
    readJson<Task>(await api.tasks[':id'].cancel.$post({ param: { id: String(id) }, json: input })),
  )
}
export function useAddTaskComment(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { body: string }) =>
      readJson(await api.tasks[':id'].comments.$post({ param: { id: String(id) }, json: input })),
    onSuccess: () => invalidate(queryClient, id),
  })
}
