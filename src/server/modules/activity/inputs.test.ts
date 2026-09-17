import { describe, expect, expectTypeOf, it } from 'vitest'
import type { ActivityRecord } from './operations.js'
import { activityPageInput, activityRecordInput } from './inputs.js'

describe('activityRecordInput', () => {
  it('公開する記録型では before と after が必須', () => {
    expectTypeOf<ActivityRecord>().toMatchTypeOf<{ before: unknown; after: unknown }>()
  })

  it('対象と eventType、projectId の整合した入力を受け付ける', () => {
    expect(
      activityRecordInput.parse({
        eventType: 'task.started',
        entityType: 'task',
        entityId: 2,
        projectId: 1,
        before: { status: 'todo' },
        after: { status: 'in_progress' },
      }),
    ).toMatchObject({ entityType: 'task', entityId: 2 })
  })

  it.each([
    {
      eventType: 'project.created',
      entityType: 'task',
      entityId: 1,
      projectId: null,
    },
    {
      eventType: 'project.created',
      entityType: 'project',
      entityId: 1,
      projectId: 2,
    },
    {
      eventType: 'document.created',
      entityType: 'document',
      entityId: 1,
      projectId: 1,
    },
  ])('設計と食い違う組み合わせを拒否する', (input) => {
    expect(() => activityRecordInput.parse(input)).toThrow()
  })
})

describe('activityPageInput', () => {
  it('既定値と上限を適用する', () => {
    expect(activityPageInput.parse({})).toEqual({ limit: 50, offset: 0 })
    expect(() => activityPageInput.parse({ limit: 201 })).toThrow()
  })
})
