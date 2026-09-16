/**
 * 業務のエラー（設計書 4.6）。種類はこの5つと「想定外」（これら以外の例外）に限る。
 * 種類を足すときは、経路の層の変換（http/errors.ts・mcp/errors.ts）もあわせて直す。
 */
export type AppErrorType = 'invalid_input' | 'forbidden' | 'not_found' | 'not_allowed' | 'conflict'

export abstract class AppError extends Error {
  abstract readonly type: AppErrorType
}

/** 入力が不正（必須の項目がない、形式が違う） */
export class InvalidInputError extends AppError {
  readonly type = 'invalid_input'
}

/** 権限がない（起点の操作の権限の確認で投げる） */
export class ForbiddenError extends AppError {
  readonly type = 'forbidden'
}

/** 見つからない（読んだ結果が無い） */
export class NotFoundError extends AppError {
  readonly type = 'not_found'
}

/** 操作できない（判定の関数で弾かれた）。次に何をすべきか分かる理由を付ける */
export class NotAllowedError extends AppError {
  readonly type = 'not_allowed'
}

/** 競合（楽観ロックで更新した行が0件） */
export class ConflictError extends AppError {
  readonly type = 'conflict'
}
