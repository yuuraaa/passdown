import { type AnyColumn, type SQL, sql } from 'drizzle-orm'
import { customType } from 'drizzle-orm/sqlite-core'
import { DATETIME_PATTERN } from './time.js'

/**
 * 日時の列（設計書 5.1）。TEXT で保存し、決まった形式でない値は書かせない。
 * 値は ctx.now（formatDatetime で作った文字列）を渡す。
 */
export const datetime = customType<{ data: string; driverData: string }>({
  dataType: () => 'text',
  toDriver: (value) => {
    if (!DATETIME_PATTERN.test(value)) {
      throw new Error(`日時の形式が違います: ${value}`)
    }
    return value
  },
})

/**
 * 列挙値の CHECK 制約の式（設計書 5.1）。CHECK にはパラメータを使えないため、
 * inputs.ts に置いた定数の値を SQL のリテラルとして埋め込む。
 */
export function inValues(column: AnyColumn, values: readonly string[]): SQL {
  const literals = values.map((v) => `'${v.replaceAll("'", "''")}'`).join(', ')
  return sql`${column} in (${sql.raw(literals)})`
}
