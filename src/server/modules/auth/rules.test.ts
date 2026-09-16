import { describe, expect, it } from 'vitest'
import { isSessionExpired, planSessionExtension } from './rules.js'

const now = '2026-09-16T12:00:00.000+09:00'

describe('isSessionExpired', () => {
  it('期限の時刻ちょうどで切れる', () => {
    expect(isSessionExpired('2026-09-16T12:00:00.001+09:00', now)).toBe(false)
    expect(isSessionExpired(now, now)).toBe(true)
  })
})

describe('planSessionExtension', () => {
  it('残りが7日以上なら延ばさない', () => {
    expect(planSessionExtension('2026-09-23T12:00:00.000+09:00', now)).toBeNull()
  })

  it('残りが7日を切ったら、今から14日後に延ばす', () => {
    expect(planSessionExtension('2026-09-23T11:59:59.999+09:00', now)).toBe(
      '2026-09-30T12:00:00.000+09:00',
    )
  })
})
