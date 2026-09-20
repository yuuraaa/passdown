import { hasPermission, defineOperation } from '../../core/operation.js'
import { searchDocuments } from '../document/index.js'
import { getProjectDocumentIds } from '../project/index.js'
import { searchTasks } from '../task/index.js'
import { searchInput } from './inputs.js'

function words(query: string): string[] {
  return query.split(/[ \u3000]+/).filter((word) => word.length > 0)
}

/** Task と Document を横断する検索の入口（設計書 3章・4.5）。 */
export const search = defineOperation({
  name: 'search',
  routes: ['web', 'mcp'],
  requires: [],
  returns: ['task', 'document'],
  entity: 'task',
  input: searchInput,
  run: (ctx, input) => {
    const queryWords = words(input.query)
    const documentIds =
      input.projectId === undefined ? undefined : getProjectDocumentIds(ctx, input.projectId)
    const common = {
      words: queryWords,
      createdFrom: input.createdFrom,
      createdTo: input.createdTo,
      updatedFrom: input.updatedFrom,
      updatedTo: input.updatedTo,
      limit: input.limit,
    }
    const tasks = hasPermission(ctx.actor, ['task', 'read'])
      ? searchTasks(ctx, {
          ...common,
          projectId: input.projectId,
          actorId: input.actorId,
          statuses: input.taskStatuses,
        })
      : { items: [], total: 0 }
    const documents = hasPermission(ctx.actor, ['document', 'read'])
      ? searchDocuments(ctx, {
          ...common,
          documentIds,
          tag: input.tag,
          statuses: input.documentStatuses,
        })
      : { items: [], total: 0 }
    return { tasks, documents }
  },
})
