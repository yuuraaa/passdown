export const actorTypes = ['human', 'agent'] as const

/** リソースごとの権限（設計書 5.2） */
export const permissions = ['none', 'read', 'readwrite'] as const
