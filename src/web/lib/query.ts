export const queryKeys = {
  session: ['session'] as const,
  tasks: ['tasks'] as const,
  task: (id: number) => ['tasks', id] as const,
  taskActivities: (id: number) => ['tasks', id, 'activities'] as const,
}
