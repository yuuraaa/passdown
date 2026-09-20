import { describe, expect, it } from 'vitest'
import { escapeLikePattern } from './like.js'

describe('escapeLikePattern', () => {
  it('LIKE のメタ文字をエスケープして部分一致パターンにする', () => {
    expect(escapeLikePattern('100%_\\')).toBe('%100\\%\\_\\\\%')
  })
})
