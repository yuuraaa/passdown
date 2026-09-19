import { describe, expect, it } from 'vitest'
import {
  addTaskCommentInput,
  approveTaskInput,
  blockTaskInput,
  cancelTaskInput,
  createTaskInput,
  getTaskInput,
  listActionableTasksInput,
  listTasksInput,
  requestTaskReviewInput,
  returnTaskToTodoInput,
  startTaskInput,
  updateTaskInput,
} from './inputs.js'

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

describe('Task の追加入力', () => {
  it('一覧は全状態・標準ページングを既定にする', () => {
    expect(listTasksInput.parse({})).toEqual({
      statuses: ['todo', 'in_progress', 'blocked', 'review', 'done', 'cancelled'],
      limit: 50,
      offset: 0,
    })
    expect(listTasksInput.safeParse({ statuses: [], limit: 0, offset: -1 }).success).toBe(false)
    expect(listTasksInput.safeParse({ projectId: 1, assigneeId: 2, limit: 200 }).success).toBe(true)
  })

  it('着手対象一覧は入力を取らず、Task 取得・承認には Task ID が必要', () => {
    expect(listActionableTasksInput.parse({})).toEqual({})
    for (const schema of [getTaskInput, approveTaskInput]) {
      expect(schema.safeParse({}).success).toBe(false)
      expect(schema.safeParse({ id: 1 }).success).toBe(true)
    }
  })

  it('更新は version と全更新項目を必要とし、関連 ID の null を許可する', () => {
    const valid = {
      id: 1,
      title: '更新後',
      description: '',
      acceptanceCriteria: '',
      priority: 'normal',
      links: [],
      assigneeId: null,
      parentId: null,
      projectId: null,
      documentIds: [2],
      version: 1,
    }
    expect(updateTaskInput.safeParse(valid).success).toBe(true)
    expect(updateTaskInput.safeParse({ ...valid, version: undefined }).success).toBe(false)
    expect(updateTaskInput.safeParse({ ...valid, title: '　' }).success).toBe(false)
    expect(updateTaskInput.safeParse({ ...valid, links: [' '] }).success).toBe(false)
    expect(updateTaskInput.safeParse({ ...valid, documentIds: [0] }).success).toBe(false)
  })

  it.each([
    [addTaskCommentInput, 'body'],
    [blockTaskInput, 'blockedReason'],
    [requestTaskReviewInput, 'result'],
    [returnTaskToTodoInput, 'body'],
    [cancelTaskInput, 'result'],
  ] as const)('%s は空白だけの必須文章を受け付けない', (schema, field) => {
    expect(schema.safeParse({ id: 1, [field]: '　' }).success).toBe(false)
    expect(schema.safeParse({ id: 1, [field]: '内容' }).success).toBe(true)
  })
})
