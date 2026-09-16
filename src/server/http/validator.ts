import { zValidator as baseValidator } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'
import { z } from 'zod'
import { InvalidInputError } from '../core/errors.js'

/**
 * 入力を検証する。失敗したら「入力が不正」のエラーにし、応答の形を揃える（設計書 4.7・7.6）。
 * zValidator の既定の 400 の応答は使わない。
 */
export function zValidator<T extends z.ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) {
  return baseValidator(target, schema, (result) => {
    if (!result.success) {
      throw new InvalidInputError(`入力が不正です: ${z.prettifyError(result.error)}`)
    }
  })
}

/** パスの :id。REST API は数値の id をそのまま使う（設計書 5.1） */
export const idParam = z.object({ id: z.coerce.number().int().positive() })
