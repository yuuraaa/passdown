import type { Database } from '../db/connection.js'

type Snapshot = Map<string, string>

/** すべてのテーブルの中身を読む（テストの規模のデータでだけ使う） */
export function snapshotTables({ sqlite }: Database): Snapshot {
  const tables = sqlite
    .prepare(
      "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name",
    )
    .pluck()
    .all() as string[]
  return new Map(
    tables.map((t) => [
      t,
      JSON.stringify(sqlite.prepare(`select * from "${t}" order by rowid`).all()),
    ]),
  )
}

export function changedTables(before: Snapshot, after: Snapshot): string[] {
  return [...after.keys()].filter((t) => before.get(t) !== after.get(t))
}

/**
 * 操作を呼び、activities 以外のテーブルが変わったのに activities が増えていなければ失敗させる。
 * Activity の記録の呼び忘れを、操作の関数のテストで共通に捕まえる（設計書 4.9）。
 */
export function expectRecorded<T>(database: Database, call: () => T): T {
  const before = snapshotTables(database)
  const result = call()
  const changed = changedTables(before, snapshotTables(database))
  const others = changed.filter((t) => t !== 'activities')
  if (others.length > 0 && !changed.includes('activities')) {
    throw new Error(`${others.join('・')} が変わったのに、Activity が記録されていません`)
  }
  return result
}
