import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { defineOperation } from '../core/operation.js'
import type { Database } from '../db/connection.js'
import { activities } from '../modules/activity/schema.js'
import { createTask, createTaskInput } from '../modules/task/index.js'
import { archiveDocument, createDocument } from '../modules/document/index.js'
import { createTestDatabase } from '../testing/db.js'
import {
  FIXED_NOW,
  ctxFor,
  insertActor,
  insertProject,
  insertSession,
  insertToken,
} from '../testing/fixtures.js'
import { changedTables, snapshotTables } from '../testing/recorded.js'
import { createMcpApp } from './app.js'

type RpcResponse = {
  result?: {
    tools?: {
      name: string
      description: string
      inputSchema: { properties: Record<string, unknown> }
    }[]
    content?: { type: 'text'; text: string }[]
    isError?: boolean
  }
  error?: unknown
}

let database: Database
let app: ReturnType<typeof createApp>

beforeEach(async () => {
  database = await createTestDatabase()
  app = createApp({ db: database.db, now: () => FIXED_NOW, mcpAllowedHosts: ['passdown.local'] })
})

function post(body: unknown, headers: Record<string, string>) {
  return app.request('http://passdown.local/mcp', {
    method: 'POST',
    headers: {
      Host: 'passdown.local:3000',
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

async function rpc(token: string, method: string, params: unknown): Promise<RpcResponse> {
  const res = await post(
    { jsonrpc: '2.0', id: 1, method, params },
    {
      Authorization: `Bearer ${token}`,
    },
  )
  expect(res.status).toBe(200)
  // ステートレスの応答は SSE の1イベントで返る
  const data = (await res.text()).split('\n').find((line) => line.startsWith('data: '))
  return JSON.parse(data?.slice('data: '.length) ?? 'null') as RpcResponse
}

async function listTools(token: string) {
  const res = await rpc(token, 'tools/list', {})
  return res.result?.tools?.map((t) => t.name).sort()
}

async function callTool(token: string, name: string, args: unknown) {
  const res = await rpc(token, 'tools/call', { name, arguments: args })
  const text = res.result?.content?.[0]?.text ?? ''
  return { isError: res.result?.isError ?? false, text }
}

describe('認証', () => {
  it('トークンがなければ 401', async () => {
    const res = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, {})
    expect(res.status).toBe(401)
  })

  it('失効したトークンは使えない', async () => {
    const token = insertToken(database, insertActor(database), true)
    const res = await post(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      {
        Authorization: `Bearer ${token}`,
      },
    )
    expect(res.status).toBe(401)
  })

  it('human のトークンは MCP に使えない', async () => {
    const token = insertToken(database, insertActor(database, { actorType: 'human' }))
    const res = await post(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      {
        Authorization: `Bearer ${token}`,
      },
    )
    expect(res.status).toBe(401)
  })

  it('ログインのセッションは MCP に使えない', async () => {
    const actor = insertActor(database, { actorType: 'human' })
    const sessionId = insertSession(database, actor, new Date(FIXED_NOW.getTime() + 86_400_000))
    const res = await post(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      {
        Cookie: `passdown_session=${sessionId}`,
      },
    )
    expect(res.status).toBe(401)
  })

  it('許可していないホスト名は 403（DNS リバインディング対策）', async () => {
    const token = insertToken(database, insertActor(database))
    const res = await post(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      {
        Host: 'evil.example:3000',
        Authorization: `Bearer ${token}`,
      },
    )
    expect(res.status).toBe(403)
  })
})

describe('ツールの登録', () => {
  it('Document の作成・更新ツールには archived を含む既存タグを示す', async () => {
    const owner = insertActor(database)
    const document = createDocument(ctxFor(database, owner), { title: '資料', tags: [' K8S '] })
    archiveDocument(ctxFor(database, owner), { id: document.id })
    const token = insertToken(database, owner)

    const result = await rpc(token, 'tools/list', {})
    const tools = result.result?.tools ?? []
    for (const name of ['create_document', 'update_document']) {
      expect(tools.find((tool) => tool.name === name)?.description).toContain('既存のタグ: k8s')
    }
  })

  it('権限に合うツールだけを表示する', async () => {
    const full = insertToken(database, insertActor(database))
    const readOnly = insertToken(
      database,
      insertActor(database, { permissions: { task: 'read', document: 'none' } }),
    )

    expect(await listTools(full)).toEqual([
      'add_task_comment',
      'archive_document',
      'archive_inbox_item',
      'block_task',
      'capture_inbox_item',
      'convert_inbox_item',
      'create_document',
      'create_project',
      'create_task',
      'get_document',
      'get_project_context',
      'get_task',
      'list_actionable_tasks',
      'list_actors',
      'list_inbox_items',
      'list_projects',
      'list_tasks',
      'request_task_review',
      'return_task_to_todo',
      'start_task',
      'update_document',
      'update_inbox_item',
      'update_project',
      'update_task',
    ])
    // ツールが1つもなければ、SDK は tools の機能自体を宣言しない
    expect((await listTools(readOnly)) ?? []).toEqual([
      'archive_inbox_item',
      'capture_inbox_item',
      'convert_inbox_item',
      'create_project',
      'get_project_context',
      'get_task',
      'list_actionable_tasks',
      'list_actors',
      'list_inbox_items',
      'list_projects',
      'list_tasks',
      'update_inbox_item',
      'update_project',
    ])
  })

  it('id の入力は `<種類>:<id>` の文字列で受け取る', async () => {
    const token = insertToken(database, insertActor(database))
    const res = await rpc(token, 'tools/list', {})
    const createTool = res.result?.tools?.find((t) => t.name === 'create_task')
    expect(createTool?.inputSchema.properties.parentId).toMatchObject({
      type: 'string',
      pattern: '^task:[1-9][0-9]*$',
    })
  })

  it('人間だけの操作は MCP に登録できない（型で落とす）', () => {
    const approve = defineOperation({
      name: 'approve_task',
      routes: ['web'],
      requires: [],
      returns: [],
      entity: 'task',
      input: createTaskInput,
      run: () => null,
    })
    createMcpApp({
      db: database.db,
      now: () => FIXED_NOW,
      allowedHosts: ['localhost'],
      // @ts-expect-error routes に 'mcp' を含まない操作は渡せない
      operations: [approve],
    })
  })
})

describe('ツールの呼び出し', () => {
  it('Project を作成し、文脈を MCP 形式の id で返す', async () => {
    const actor = insertActor(database)
    const token = insertToken(database, actor)
    const project = await callTool(token, 'create_project', {
      name: '実装',
      description: '概要',
      instructions: '指示',
    })
    const created = JSON.parse(project.text) as { id: string }
    expect(created.id).toBe('project:1')
    createTask(ctxFor(database, actor), { title: '文脈の Task', projectId: 1 })
    const context: unknown = JSON.parse(
      (await callTool(token, 'get_project_context', { id: created.id })).text,
    )
    expect(context).toMatchObject({
      id: created.id,
      description: '概要',
      instructions: '指示',
      tasks: [{ id: 'task:1' }],
    })
  })

  it('Document を作成して MCP 形式の id とタグを返す', async () => {
    const token = insertToken(database, insertActor(database))

    const result = await callTool(token, 'create_document', {
      title: '運用資料',
      content: '本文',
      tags: [' K8S '],
    })

    expect(result.isError).toBe(false)
    expect(JSON.parse(result.text)).toMatchObject({ id: 'document:1', tags: ['k8s'] })
  })

  it('Inbox Item を Task に変換し、ネストした Project ID を MCP 形式で受け取る', async () => {
    const token = insertToken(database, insertActor(database))
    const project = JSON.parse(
      (await callTool(token, 'create_project', { name: 'Project' })).text,
    ) as {
      id: string
    }
    const item = JSON.parse(
      (await callTool(token, 'capture_inbox_item', { content: '思いつき' })).text,
    ) as {
      id: string
    }

    const converted = await callTool(token, 'convert_inbox_item', {
      id: item.id,
      target: { targetType: 'task', target: { title: 'Task', projectId: project.id } },
    })

    expect(converted.isError).toBe(false)
    expect(JSON.parse(converted.text)).toMatchObject({ id: item.id, status: 'triaged' })
  })

  it('Document を取得・更新・archive できる', async () => {
    const token = insertToken(database, insertActor(database))
    const created = await callTool(token, 'create_document', { title: '資料', content: '旧本文' })
    const document = JSON.parse(created.text) as { id: string; version: number }

    expect(
      JSON.parse((await callTool(token, 'get_document', { id: document.id })).text),
    ).toMatchObject({
      id: document.id,
      content: '旧本文',
    })
    const updated = await callTool(token, 'update_document', {
      id: document.id,
      title: '更新資料',
      content: '新本文',
      tags: [' K8S '],
      version: document.version,
    })
    expect(JSON.parse(updated.text)).toMatchObject({ version: 2, tags: ['k8s'] })
    expect(
      JSON.parse((await callTool(token, 'archive_document', { id: document.id })).text),
    ).toMatchObject({
      status: 'archived',
      version: 3,
    })
  })

  it('Task を作り、結果の id を `<種類>:<id>` で返し、経路を mcp として記録する', async () => {
    const actor = insertActor(database)
    const token = insertToken(database, actor)
    const projectId = insertProject(database)

    const parent = await callTool(token, 'create_task', {
      title: '親',
      projectId: `project:${projectId}`,
    })
    const parentTask = JSON.parse(parent.text) as { id: string }
    const child = await callTool(token, 'create_task', { title: '子', parentId: parentTask.id })

    expect(child.isError).toBe(false)
    expect(JSON.parse(child.text)).toMatchObject({
      id: 'task:2',
      parentId: 'task:1',
      projectId: `project:${projectId}`,
      createdBy: `actor:${actor.id}`,
      assigneeId: null,
      status: 'todo',
    })
    const recorded = database.db.select().from(activities).where(eq(activities.entityId, 2)).get()
    expect(recorded).toMatchObject({ eventType: 'task.created', source: 'mcp', actorId: actor.id })
  })

  it('種類の違う id は受け付けず、何も書かない', async () => {
    const token = insertToken(database, insertActor(database))
    const projectId = insertProject(database)
    const before = snapshotTables(database)

    const res = await callTool(token, 'create_task', {
      title: 't',
      parentId: `project:${projectId}`,
    })

    expect(res.isError).toBe(true)
    expect(res.text).toContain('task:<数値>')
    expect(changedTables(before, snapshotTables(database))).toEqual([])
  })

  it('操作できないときは、理由をツールのエラーで返す', async () => {
    const token = insertToken(database, insertActor(database))
    await callTool(token, 'create_task', { title: 't' })
    await callTool(token, 'start_task', { id: 'task:1' })

    const res = await callTool(token, 'start_task', { id: 'task:1' })

    expect(res).toEqual({
      isError: true,
      text: expect.stringContaining('着手できるのは todo の Task だけです') as string,
    })
  })
})
