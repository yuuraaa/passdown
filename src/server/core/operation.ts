import type { RunResult } from 'better-sqlite3'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import { z } from 'zod'
import { ForbiddenError, InvalidInputError } from './errors.js'

/**
 * 操作の関数が使う DB。接続とトランザクションのどちらも入る（設計書 4.2）。
 * 業務ロジックの層は、DB の接続を import せず、必ず ctx.db を使う。
 */
export type Db = BaseSQLiteDatabase<'sync', RunResult>

export type Resource = 'project' | 'task' | 'document' | 'inbox'
export type PermissionLevel = 'read' | 'readwrite'
export type Permission = 'none' | PermissionLevel
export type Route = 'web' | 'mcp'
/** 操作を出す経路の組（設計書 4.9）。人間だけの操作は ['web'] */
export type Routes = readonly ['web'] | readonly ['web', 'mcp']

/** 操作した Actor。権限は Actor が持つ（設計書 5.2） */
export type Actor = {
  id: number
  name: string
  permissions: Record<Resource, Permission>
}

/**
 * 操作の関数が受け取る文脈（設計書 4.1）。
 * 他のモジュールの関数を呼ぶときも actor・source を差し替えない（設計書 4.9）。
 */
export type Ctx = {
  db: Db
  actor: Actor
  source: Route
  /** 現在の日時（formatDatetime で作った文字列）。関数の中で日時を取らない */
  now: string
}

/** 画面・MCP で `<種類>:<id>` の形で書く種類（設計書 5.1） */
export type EntityType = 'actor' | 'token' | 'project' | 'task' | 'document' | 'inbox_item'

type Input = z.ZodObject

export type OperationDef<N extends string, R extends Routes, I extends Input, O> = {
  /** 操作の名前。MCP のツール名に使う */
  name: N
  /** この操作を出す経路 */
  routes: R
  /** 必要な権限 */
  requires: readonly (readonly [Resource, PermissionLevel])[]
  /** 結果に含む、自分以外のリソースの種類（read 権限による絞り込みの対象） */
  returns: readonly Resource[]
  /** 結果が表すリソースの種類。MCP の層で結果の `id` を `<種類>:<id>` に変える */
  entity: EntityType
  /** 入力のスキーマ（設計書 4.7） */
  input: I
  /** 読む → 判定する → 書く（設計書 4.2）。ctx.db はトランザクション */
  run: (ctx: Ctx, input: z.output<I>) => O
}

type OperationFn<I extends Input, O> = (ctx: Ctx, input: z.input<I>) => O

export type Operation<N extends string, R extends Routes, I extends Input, O> = OperationFn<I, O> &
  Readonly<Omit<OperationDef<N, R, I, O>, 'run'>> & {
    /** 他のモジュールから呼ぶ呼び口。権限を確認しない。経路の層から呼ばない（lint で検査する） */
    withoutPermissionCheck: OperationFn<I, O>
  }

/** 一覧（レジストリ）で扱うための、入力・結果の型を問わない操作 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 入力の型は操作ごとに違い、関数の引数は可変のため any で受ける
export type AnyOperation = Operation<string, Routes, any, unknown>

/** MCP に出してよい操作。MCP への登録はこの型しか受け付けない（設計書 4.9） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AnyOperation と同じ
export type McpOperation = Operation<string, readonly ['web', 'mcp'], any, unknown>

const OPERATION = Symbol('operation')

export function isOperation(value: unknown): value is AnyOperation {
  return typeof value === 'function' && OPERATION in value
}

export function isMcpOperation(op: AnyOperation): op is McpOperation {
  return (op.routes as readonly Route[]).includes('mcp')
}

export function hasPermission(
  actor: Actor,
  [resource, level]: readonly [Resource, PermissionLevel],
) {
  const granted = actor.permissions[resource]
  return level === 'read' ? granted !== 'none' : granted === 'readwrite'
}

/** 操作の関数の先頭で、自分の入力のスキーマで検証する（設計書 4.7） */
export function parseInput<I extends Input>(schema: I, input: unknown): z.output<I> {
  const result = schema.safeParse(input)
  if (!result.success) {
    throw new InvalidInputError(`入力が不正です: ${z.prettifyError(result.error)}`)
  }
  return result.data
}

/**
 * 起点の操作を宣言する（設計書 4.9）。
 * 返す関数は、入力の検証 → 権限の確認 → トランザクションを張って run を実行、の順に行う。
 */
export function defineOperation<const N extends string, const R extends Routes, I extends Input, O>(
  def: OperationDef<N, R, I, O>,
): Operation<N, R, I, O> {
  const { run, name, ...meta } = def

  const execute = (ctx: Ctx, input: unknown, checkPermission: boolean): O => {
    const parsed = parseInput(def.input, input)
    if (checkPermission) {
      const missing = def.requires.filter((p) => !hasPermission(ctx.actor, p))
      if (missing.length > 0) {
        const list = missing.map(([r, l]) => `${r} の ${l}`).join('、')
        throw new ForbiddenError(`${def.name} には ${list} の権限が必要です`)
      }
    }
    return ctx.db.transaction((tx) => run({ ...ctx, db: tx }, parsed))
  }

  const op = (ctx: Ctx, input: z.input<I>) => execute(ctx, input, true)
  // 関数の name は書き換えられない（読み取り専用）ため、defineProperty で操作の名前にする
  Object.defineProperty(op, 'name', { value: name })
  return Object.assign(op as typeof op & { readonly name: N }, meta, {
    withoutPermissionCheck: (ctx: Ctx, input: z.input<I>) => execute(ctx, input, false),
    [OPERATION]: true,
  })
}
