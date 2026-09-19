import { describe, expect, it } from 'vitest'
import { createDocumentInput, documentPageInput, updateDocumentInput } from './inputs.js'

describe('Document の入力', () => {
  it('作成時は本文・タグを省略できる', () => {
    expect(createDocumentInput.parse({ title: '資料' })).toEqual({
      title: '資料',
      content: '',
      tags: [],
    })
  })

  it.each(['', '   '])('title は空にできない: %j', (title) => {
    expect(createDocumentInput.safeParse({ title }).success).toBe(false)
  })

  it('タグを正規化し、重複を除く', () => {
    expect(
      createDocumentInput.parse({ title: '資料', tags: [' K8S ', 'ｋ８ｓ', '設 計'] }).tags,
    ).toEqual(['k8s', '設 計'])
  })

  it('空になるタグは受け付けない', () => {
    expect(createDocumentInput.safeParse({ title: '資料', tags: ['　'] }).success).toBe(false)
  })

  it('一覧は active を既定にし、ページングを検証する', () => {
    expect(documentPageInput.parse({})).toEqual({ status: 'active', limit: 50, offset: 0 })
    expect(documentPageInput.safeParse({ limit: 201 }).success).toBe(false)
  })

  it('更新には version を必要とする', () => {
    expect(
      updateDocumentInput.safeParse({ id: 1, title: '資料', content: '', tags: [] }).success,
    ).toBe(false)
  })
})
