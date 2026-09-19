import { NotAllowedError } from '../../core/errors.js'
import { formatDatetime } from '../../core/time.js'

const DAY_MS = 24 * 60 * 60 * 1000

/** 無操作がこの期間続いたらログインが切れる（設計書 5.3） */
export const SESSION_TTL_MS = 14 * DAY_MS

export function isSessionExpired(expiresAt: string, now: string): boolean {
  return Date.parse(expiresAt) <= Date.parse(now)
}

/**
 * ログインの有効期限を延ばすか決める（設計書 5.3）。
 * 読み取りだけのリクエストでも書き込みが走らないよう、残りが半分を切ったときだけ延ばす。
 * 延ばすなら新しい期限、延ばさないなら null を返す。
 */
export function planSessionExtension(expiresAt: string, now: string): string | null {
  const remaining = Date.parse(expiresAt) - Date.parse(now)
  if (remaining >= SESSION_TTL_MS / 2) {
    return null
  }
  return formatDatetime(new Date(Date.parse(now) + SESSION_TTL_MS))
}

/** Token は agent Actor にだけ発行できる（設計書 5.3）。 */
export function checkAgentActor(actor: { id: number; actorType: 'human' | 'agent' }): void {
  if (actor.actorType !== 'agent') {
    throw new NotAllowedError(
      `actor:${actor.id} は human のため、agent Actor にだけ許可された操作はできません`,
    )
  }
}

export function checkCanIssueToken(actor: { id: number; actorType: 'human' | 'agent' }): void {
  checkAgentActor(actor)
}

export function checkCanChangeAgentPermissions(actor: {
  id: number
  actorType: 'human' | 'agent'
}): void {
  if (actor.actorType !== 'agent') {
    throw new NotAllowedError(`actor:${actor.id} は human のため、権限を変更できません`)
  }
}
