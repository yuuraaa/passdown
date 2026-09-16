export const projectStatuses = ['active', 'done', 'archived'] as const
export type ProjectStatus = (typeof projectStatuses)[number]
