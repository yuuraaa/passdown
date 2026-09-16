import type { AnyOperation } from '../core/operation.js'

const exposed = new Set<string>()

/**
 * REST API に出す起点の操作を記録する。routes に 'web' を含む操作が
 * すべて登録されていることを、テストでこの記録と照らし合わせる（設計書 4.9・7.2）。
 */
export function expose<T extends AnyOperation>(op: T): T {
  exposed.add(op.name)
  return op
}

export function exposedOperationNames(): ReadonlySet<string> {
  return exposed
}
