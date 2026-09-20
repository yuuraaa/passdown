import { describe, expect, it } from 'vitest'
import { searchInput } from './inputs.js'

describe('searchInput', () => {
  it('既定で全状態を対象にし、空のキーワードを受け付ける', () => {
    expect(searchInput.parse({})).toMatchObject({
      query: '',
      limit: 50,
      taskStatuses: ['todo', 'in_progress', 'blocked', 'review', 'done', 'cancelled'],
      documentStatuses: ['active', 'archived'],
    })
  })

  it('タグを既存のDocument入力と同じ規則で正規化する', () => {
    expect(searchInput.parse({ tag: ' K８S ' }).tag).toBe('k8s')
  })

  it('空の状態指定と上限を超えた件数を拒否する', () => {
    expect(searchInput.safeParse({ taskStatuses: [] }).success).toBe(false)
    expect(searchInput.safeParse({ limit: 201 }).success).toBe(false)
    expect(searchInput.safeParse({ tag: '  ' }).success).toBe(false)
  })
})
