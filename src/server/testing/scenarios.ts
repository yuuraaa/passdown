import type { Actor, Ctx, Resource } from '../core/operation.js'
import type { Database } from '../db/connection.js'
import { createTask } from '../modules/task/index.js'
import { ctxFor, insertActor } from './fixtures.js'

export type Harness = {
  database: Database
  /** すべての権限を持つ Actor。データの用意に使う */
  owner: Actor
  ownerCtx: Ctx
}

export type Scenario = {
  /** データを用意し、成功する入力を返す */
  arrange: (h: Harness) => unknown
  /**
   * returns に宣言したリソースごとに、read を持たない Actor で呼んだ結果に
   * そのリソースが含まれていないかを確かめる（設計書 4.9）
   */
  excludes?: Partial<Record<Resource, (result: unknown) => boolean>>
}

/**
 * 起点の操作ごとの、成功する入力とデータの用意（設計書 4.9 の表駆動のテスト）。
 * 操作を足したらここにも足す。足し忘れると表駆動のテストが失敗する。
 */
export const scenarios: Record<string, Scenario> = {
  create_task: {
    arrange: () => ({ title: 'テストの Task' }),
  },
  start_task: {
    arrange: ({ ownerCtx }) => {
      const task = createTask.withoutPermissionCheck(ownerCtx, { title: '着手する Task' })
      return { id: task.id }
    },
  },
}

export function createHarness(database: Database): Harness {
  const owner = insertActor(database, { name: 'オーナー', actorType: 'human' })
  return { database, owner, ownerCtx: ctxFor(database, owner) }
}
