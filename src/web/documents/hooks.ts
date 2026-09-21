import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, readJson } from '../lib/api.js'
import type { Activity, Actor, Document, DocumentReferences, DocumentStatus } from './types.js'

export const documentQueryKeys = {
  actors: ['actors'] as const,
  list: (status: DocumentStatus) => ['documents', 'list', status] as const,
  detail: (id: number) => ['documents', id] as const,
  tags: ['documents', 'tags'] as const,
  references: (id: number) => ['documents', id, 'references'] as const,
  activities: (id: number) => ['documents', id, 'activities'] as const,
}

export function useActors() {
  return useQuery({
    queryKey: documentQueryKeys.actors,
    queryFn: async () => readJson<Actor[]>(await api.actors.$get()),
  })
}
export function useDocuments(status: DocumentStatus) {
  return useQuery({
    queryKey: documentQueryKeys.list(status),
    queryFn: async () =>
      readJson<{ items: Document[]; total: number }>(
        await api.documents.$get({ query: { status, limit: '50', offset: '0' } }),
      ),
  })
}
export function useDocument(id: number) {
  return useQuery({
    queryKey: documentQueryKeys.detail(id),
    queryFn: async () =>
      readJson<Document>(await api.documents[':id'].$get({ param: { id: String(id) } })),
  })
}
export function useDocumentTags() {
  return useQuery({
    queryKey: documentQueryKeys.tags,
    queryFn: async () => readJson<string[]>(await api['document-tags'].$get()),
  })
}
export function useDocumentReferences(id: number) {
  return useQuery({
    queryKey: documentQueryKeys.references(id),
    queryFn: async () =>
      readJson<DocumentReferences>(
        await api.documents[':id'].references.$get({ param: { id: String(id) } }),
      ),
  })
}
export function useDocumentActivities(id: number) {
  return useQuery({
    queryKey: documentQueryKeys.activities(id),
    queryFn: async () =>
      readJson<{ items: Activity[]; total: number }>(
        await api.documents[':id'].activities.$get({
          param: { id: String(id) },
          query: { limit: '50', offset: '0' },
        }),
      ),
  })
}
function invalidate(queryClient: ReturnType<typeof useQueryClient>, id?: number) {
  void queryClient.invalidateQueries({ queryKey: ['documents'] })
  void queryClient.invalidateQueries({ queryKey: documentQueryKeys.tags })
  if (id) {
    void queryClient.invalidateQueries({ queryKey: documentQueryKeys.references(id) })
    void queryClient.invalidateQueries({ queryKey: documentQueryKeys.activities(id) })
  }
}
export function useCreateDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { title: string; content: string; tags: string[] }) =>
      readJson<Document>(await api.documents.$post({ json: input })),
    onSuccess: (document) => {
      queryClient.setQueryData(documentQueryKeys.detail(document.id), document)
      invalidate(queryClient, document.id)
    },
  })
}
export function useUpdateDocument(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      title: string
      content: string
      tags: string[]
      version: number
    }) =>
      readJson<Document>(
        await api.documents[':id'].$patch({ param: { id: String(id) }, json: input }),
      ),
    onSuccess: (document) => {
      queryClient.setQueryData(documentQueryKeys.detail(id), document)
      invalidate(queryClient, id)
    },
  })
}
export function useArchiveDocument(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      readJson<Document>(await api.documents[':id'].archive.$post({ param: { id: String(id) } })),
    onSuccess: (document) => {
      queryClient.setQueryData(documentQueryKeys.detail(id), document)
      invalidate(queryClient, id)
    },
  })
}
