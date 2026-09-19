import { beforeEach, describe, expect, it } from 'vitest'
import { ForbiddenError } from './core/errors.js'
import {
  type AnyOperation,
  isMcpOperation,
  type Permission,
  type PermissionLevel,
} from './core/operation.js'
import type { Database } from './db/connection.js'
import { createApi } from './http/app.js'
import { exposedOperationNames } from './http/registry.js'
import { toolDescriptions } from './mcp/descriptions.js'
import { operations } from './operations.js'
import { createTestDatabase } from './testing/db.js'
import { ctxFor, FIXED_NOW, insertActor } from './testing/fixtures.js'
import { changedTables, expectRecorded, snapshotTables } from './testing/recorded.js'
import { createHarness, type Harness, scenarios } from './testing/scenarios.js'

/**
 * 起点の操作の一覧（レジストリ）から表駆動で回すテスト（設計書 4.9）。
 * 操作を足せば、ここのテストも自動で増える。
 */

const table = operations.map((op) => [op.name, op] as const)

/** 1段下げた権限。readwrite を求める操作には read を、read を求める操作には none を与える */
const lower: Record<PermissionLevel, Permission> = { readwrite: 'read', read: 'none' }

function scenarioOf(op: AnyOperation) {
  const scenario = scenarios[op.name]
  if (!scenario) {
    throw new Error(`testing/scenarios.ts に ${op.name} の用意がありません`)
  }
  return scenario
}

let database: Database
let h: Harness

beforeEach(async () => {
  database = await createTestDatabase()
  h = createHarness(database)
})

it('一覧に操作が集まっている', () => {
  expect(operations.map((op) => op.name).sort()).toEqual([
    'add_task_comment',
    'approve_task',
    'archive_document',
    'archive_project',
    'block_task',
    'cancel_task',
    'complete_project',
    'create_agent_actor',
    'create_document',
    'create_project',
    'create_task',
    'get_actor_activities',
    'get_document',
    'get_document_activities',
    'get_inbox_item_activities',
    'get_project',
    'get_project_activities',
    'get_project_context',
    'get_task',
    'get_task_activities',
    'issue_token',
    'list_actionable_tasks',
    'list_actor_tokens',
    'list_actors',
    'list_document_tags',
    'list_documents',
    'list_projects',
    'list_tasks',
    'request_task_review',
    'return_task_to_todo',
    'revoke_token',
    'start_task',
    'update_agent_permissions',
    'update_document',
    'update_project',
    'update_task',
  ])
})

describe.each(table)('%s', (_name, op) => {
  it('用意した入力で成功し、変更する操作なら Activity が記録される', () => {
    const input = scenarioOf(op).arrange(h)
    expectRecorded(database, () => op(h.ownerCtx, input))
  })

  it.each(op.requires.map((p) => [`${p[0]} の ${p[1]}`, p] as const))(
    '%s を欠くと権限がないエラーになり、何も書かれない',
    (_label, [resource, level]) => {
      const input = scenarioOf(op).arrange(h)
      const actor = insertActor(database, { permissions: { [resource]: lower[level] } })
      const before = snapshotTables(database)

      expect(() => op(ctxFor(database, actor), input)).toThrow(ForbiddenError)
      expect(changedTables(before, snapshotTables(database))).toEqual([])
    },
  )

  it.each(op.returns.map((r) => [r] as const))(
    '%s の read を持たない Actor には、結果にそのリソースを含めない',
    (resource) => {
      const scenario = scenarioOf(op)
      const excludes = scenario.excludes?.[resource]
      if (!excludes) {
        throw new Error(
          `testing/scenarios.ts の ${op.name} に ${resource} の excludes がありません`,
        )
      }
      const input = scenario.arrange(h)
      const actor = insertActor(database, { permissions: { [resource]: 'none' } })

      expect(excludes(op(ctxFor(database, actor), input))).toBe(true)
    },
  )

  it('経路の宣言に合わせて REST API・MCP に登録されている', () => {
    createApi({ db: database.db, now: () => FIXED_NOW })

    expect(exposedOperationNames().has(op.name)).toBe(op.routes.includes('web'))
    // MCP は routes に 'mcp' を含む操作だけを受け付け（型で落とす）、説明を必ず持つ
    expect(op.name in toolDescriptions).toBe(isMcpOperation(op))
  })
})
