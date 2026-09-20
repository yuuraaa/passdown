import { describe, expect, it } from 'vitest'
import {
  captureInboxItemInput,
  convertInboxItemInput,
  getInboxItemInput,
  listInboxItemsInput,
  updateInboxItemInput,
} from './inputs.js'

describe('Inbox Item の入力', () => {
  it.each(['', '  '])('取り込み本文は空にできない: %j', (content) => {
    expect(captureInboxItemInput.safeParse({ content }).success).toBe(false)
  })

  it('一覧は untriaged を既定にし、ページングを検証する', () => {
    expect(listInboxItemsInput.parse({})).toEqual({ status: 'untriaged', limit: 50, offset: 0 })
    expect(listInboxItemsInput.safeParse({ status: 'unknown' }).success).toBe(false)
    expect(listInboxItemsInput.safeParse({ offset: -1 }).success).toBe(false)
  })

  it('ID 指定の取得入力を検証する', () => {
    expect(getInboxItemInput.parse({ id: 1 })).toEqual({ id: 1 })
    expect(getInboxItemInput.safeParse({ id: 0 }).success).toBe(false)
  })

  it('更新には version を必要とする', () => {
    expect(updateInboxItemInput.safeParse({ id: 1, content: '本文' }).success).toBe(false)
  })

  it('変換先の種類ごとに作成入力を検証する', () => {
    expect(
      convertInboxItemInput.parse({
        id: 1,
        target: { targetType: 'task', target: { title: 'Task' } },
      }),
    ).toMatchObject({ target: { targetType: 'task', target: { title: 'Task' } } })
    expect(
      convertInboxItemInput.safeParse({
        id: 1,
        target: { targetType: 'document', target: { title: '' } },
      }).success,
    ).toBe(false)
  })
})
