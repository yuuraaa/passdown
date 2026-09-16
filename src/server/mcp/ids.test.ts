import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { createTaskInput } from '../modules/task/index.js'
import { toMcpIds, toMcpInputSchema } from './ids.js'

describe('toMcpInputSchema', () => {
  const schema = toMcpInputSchema(createTaskInput)

  it('`<種類>:<id>` を数値に変える', () => {
    expect(schema.parse({ title: 't', parentId: 'task:12', assigneeId: 'actor:3' })).toMatchObject({
      parentId: 12,
      assigneeId: 3,
    })
  })

  it.each(['12', 'project:12', 'task:0', 'task:01', 'task:1a', 12])(
    '種類・形の違う id は受け付けない: %j',
    (parentId) => {
      expect(schema.safeParse({ title: 't', parentId }).success).toBe(false)
    },
  )

  it('id 以外の項目と説明はそのまま', () => {
    expect(schema.parse({ title: 't' })).toEqual(createTaskInput.parse({ title: 't' }))
    expect((schema.shape.parentId as z.ZodType).description).toBe(
      createTaskInput.shape.parentId.description,
    )
  })
})

describe('toMcpIds', () => {
  it('id は操作の種類で、ほかの id は項目名で変える', () => {
    expect(
      toMcpIds({ id: 1, parentId: 2, projectId: null, createdBy: 3, title: 'id: 4' }, 'task'),
    ).toEqual({
      id: 'task:1',
      parentId: 'task:2',
      projectId: null,
      createdBy: 'actor:3',
      title: 'id: 4',
    })
  })

  it('一覧の items も変える', () => {
    expect(toMcpIds({ items: [{ id: 1 }], total: 1 }, 'task')).toEqual({
      items: [{ id: 'task:1' }],
      total: 1,
    })
  })
})
