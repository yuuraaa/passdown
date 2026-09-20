import { type AnyOperation, isOperation } from './core/operation.js'
import * as activity from './modules/activity/index.js'
import * as auth from './modules/auth/index.js'
import * as document from './modules/document/index.js'
import * as inbox from './modules/inbox/index.js'
import * as project from './modules/project/index.js'
import * as search from './modules/search/index.js'
import * as task from './modules/task/index.js'

/**
 * 起点の操作の一覧（レジストリ）。各モジュールの index.ts に並べた操作を集める（設計書 4.5・4.9）。
 * 経路の層への登録と、表駆動のテストはこの一覧から作る。モジュールを足したらここに足す。
 */
export const operations: readonly AnyOperation[] = [
  activity,
  auth,
  document,
  inbox,
  project,
  search,
  task,
].flatMap((m) => Object.values(m as Record<string, unknown>).filter(isOperation))
