import { describe, expect, it } from 'vitest'
import { createTaskInput, startTaskInput } from './inputs.js'

describe('createTaskInput', () => {
  it('title だけで作れ、ほかは既定の値になる', () => {
    expect(createTaskInput.parse({ title: 'やること' })).toEqual({
      title: 'やること',
      description: '',
      acceptanceCriteria: '',
      priority: 'normal',
      links: [],
    })
  })

  it.each(['', '   '])('title は空にできない: %j', (title) => {
    expect(createTaskInput.safeParse({ title }).success).toBe(false)
  })

  it('priority は high / normal / low だけ', () => {
    expect(createTaskInput.safeParse({ title: 't', priority: 'high' }).success).toBe(true)
    expect(createTaskInput.safeParse({ title: 't', priority: 'urgent' }).success).toBe(false)
  })

  it('id は正の整数だけ', () => {
    expect(createTaskInput.safeParse({ title: 't', parentId: 1 }).success).toBe(true)
    for (const parentId of [0, -1, 1.5, '1', 'task:1', null]) {
      expect(createTaskInput.safeParse({ title: 't', parentId }).success).toBe(false)
    }
  })

  it('links に空の文字列を入れられない', () => {
    expect(createTaskInput.safeParse({ title: 't', links: [''] }).success).toBe(false)
  })
})

describe('startTaskInput', () => {
  it('id が必須', () => {
    expect(startTaskInput.safeParse({}).success).toBe(false)
    expect(startTaskInput.safeParse({ id: 1 }).success).toBe(true)
  })
})
