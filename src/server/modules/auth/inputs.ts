import { z } from 'zod'
import { entityId } from '../activity/inputs.js'

export const actorTypes = ['human', 'agent'] as const

/** リソースごとの権限（設計書 5.2） */
export const permissions = ['none', 'read', 'readwrite'] as const
export type Permission = (typeof permissions)[number]

export const actorName = z.string().trim().min(1, '空にできません').max(100)
const permissionSet = z.object({
  project: z.enum(permissions),
  task: z.enum(permissions),
  document: z.enum(permissions),
  inbox: z.enum(permissions),
})

export const listActorsInput = z.object({})
export const createAgentActorInput = z.object({
  name: actorName.describe('agent Actor の表示名'),
  permissions: permissionSet.describe('リソースごとの権限'),
})
export const updateAgentPermissionsInput = z.object({
  id: entityId('actor'),
  permissions: permissionSet,
})
export const actorIdInput = z.object({ id: entityId('actor') })
export const tokenIdInput = z.object({ id: entityId('token') })

export const loginInput = z.object({
  loginName: z.string().trim().min(1, '空にできません').max(100),
  password: z.string().min(1, '空にできません').max(1024),
})
