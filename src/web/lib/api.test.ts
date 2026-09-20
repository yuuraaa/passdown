import { describe, expect, it } from 'vitest'
import { ApiError, readJson } from './api.js'

describe('readJson', () => {
  it('成功した JSON を返す', async () => {
    await expect(
      readJson<{ ok: boolean }>(new Response(JSON.stringify({ ok: true }))),
    ).resolves.toEqual({
      ok: true,
    })
  })

  it('API のエラー形式を ApiError に変換する', async () => {
    const response = new Response(
      JSON.stringify({ error: { type: 'conflict', message: '読み直してください' } }),
      { status: 409 },
    )
    await expect(readJson(response)).rejects.toEqual(new ApiError('conflict', '読み直してください'))
  })
})
