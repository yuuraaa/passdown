import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { hc } from 'hono/client'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { ConflictError } from '../core/errors.js'
import type { Actor } from '../core/operation.js'
import { formatDatetime } from '../core/time.js'
import type { Database } from '../db/connection.js'
import { recordActivities } from '../modules/activity/index.js'
import { activities } from '../modules/activity/schema.js'
import { createProject, updateProject } from '../modules/project/index.js'
import { humanCredentials, sessions } from '../modules/auth/schema.js'
import {
  createHumanAccount,
  hashPassword,
  hashSecret,
  resetHumanPassword,
} from '../modules/auth/index.js'
import { createTask, updateTask } from '../modules/task/index.js'
import { createTestDatabase } from '../testing/db.js'
import { ctxFor, FIXED_NOW, insertActor, insertSession, insertToken } from '../testing/fixtures.js'
import type { ApiType } from './app.js'
import { handleError } from './errors.js'

const DAY = 86_400_000

let database: Database
let app: ReturnType<typeof createApp>
let cookie: string
let owner: Actor

beforeEach(async () => {
  database = await createTestDatabase()
  app = createApp({ db: database.db, now: () => FIXED_NOW, mcpAllowedHosts: ['localhost'] })
  owner = insertActor(database, { actorType: 'human' })
  cookie = `passdown_session=${insertSession(database, owner, new Date(FIXED_NOW.getTime() + 13 * DAY))}`
})

/** Web UI と同じく Hono RPC で呼ぶ（設計書 2.4） */
function client(headers: Record<string, string> = { Cookie: cookie }) {
  return hc<ApiType>('http://localhost/api', {
    headers,
    fetch: (input: string | URL | Request, init?: RequestInit) => app.request(input, init),
  })
}

async function errorOf(res: Response) {
  return ((await res.json()) as { error: { type: string; message: string } }).error
}

describe('認証', () => {
  it('human はログインするとセッション Cookie を受け取り、ログアウトできる', async () => {
    const password = 'correct horse battery staple'
    database.db
      .insert(humanCredentials)
      .values({
        actorId: owner.id,
        loginName: 'owner',
        passwordHash: await hashPassword(password),
      })
      .run()

    const login = await app.request('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginName: 'owner', password }),
    })
    expect(login.status).toBe(200)
    const setCookie = login.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).not.toContain('Secure')
    expect(setCookie).toContain('SameSite=Lax')
    const loggedInCookie = setCookie.split(';')[0]
    expect(
      (await app.request('/api/session', { headers: { Cookie: loggedInCookie } })).status,
    ).toBe(200)
    expect(
      (await app.request('/api/session', { method: 'DELETE', headers: { Cookie: loggedInCookie } }))
        .status,
    ).toBe(200)
    expect(
      (await app.request('/api/session', { headers: { Cookie: loggedInCookie } })).status,
    ).toBe(401)
  })

  it('CLI 作成後にログインでき、再設定後は古い Cookie とパスワードを使えない', async () => {
    await createHumanAccount(database.db, {
      loginName: 'cli-owner',
      name: 'CLI owner',
      password: 'old-password',
    })
    const firstLogin = await app.request('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginName: 'cli-owner', password: 'old-password' }),
    })
    expect(firstLogin.status).toBe(200)
    const oldCookie = (firstLogin.headers.get('set-cookie') ?? '').split(';')[0] ?? ''

    await resetHumanPassword(database.db, { loginName: 'cli-owner', password: 'new-password' })
    expect((await app.request('/api/session', { headers: { Cookie: oldCookie } })).status).toBe(401)
    const oldPassword = await app.request('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginName: 'cli-owner', password: 'old-password' }),
    })
    expect(oldPassword.status).toBe(401)
    const newPassword = await app.request('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginName: 'cli-owner', password: 'new-password' }),
    })
    expect(newPassword.status).toBe(200)
  })

  it('ログイン失敗はアカウントの有無を示さない', async () => {
    const expired = insertSession(database, owner, new Date(FIXED_NOW.getTime() - 1))
    const res = await app.request('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginName: 'missing', password: 'wrong password' }),
    })
    expect(res.status).toBe(401)
    expect(await errorOf(res)).toEqual({
      type: 'unauthorized',
      message: 'ログイン名またはパスワードが違います',
    })
    expect(
      database.db
        .select()
        .from(sessions)
        .where(eq(sessions.sessionHash, hashSecret(expired)))
        .get(),
    ).toBeUndefined()
  })

  it('human Actor の Token 一覧は取得できない', async () => {
    const res = await app.request(`/api/actors/${owner.id}/tokens`, { headers: { Cookie: cookie } })
    expect(res.status).toBe(409)
    expect(await errorOf(res)).toMatchObject({ type: 'not_allowed' })
  })

  it('ログインしていなければ 401', async () => {
    const res = await client({}).tasks.$post({ json: { title: 't' } })
    expect(res.status).toBe(401)
    expect((await errorOf(res)).type).toBe('unauthorized')
  })

  it('エージェントのトークンは REST API に使えない', async () => {
    const token = insertToken(database, insertActor(database))
    const res = await client({ Authorization: `Bearer ${token}` }).tasks.$post({
      json: { title: 't' },
    })
    expect(res.status).toBe(401)
  })

  it('agent のセッションは REST API に使えず、期限も延長しない', async () => {
    const agent = insertActor(database)
    const expiresAt = new Date(FIXED_NOW.getTime() + 6 * DAY)
    const sessionId = insertSession(database, agent, expiresAt)

    const res = await client({ Cookie: `passdown_session=${sessionId}` }).tasks.$post({
      json: { title: 't' },
    })

    expect(res.status).toBe(401)
    const row = database.db.select().from(sessions).where(eq(sessions.actorId, agent.id)).get()
    expect(row?.expiresAt).toBe(formatDatetime(expiresAt))
  })

  it('期限の切れたセッションは使えない', async () => {
    const actor = insertActor(database, { actorType: 'human' })
    const expired = insertSession(database, actor, FIXED_NOW)
    const res = await client({ Cookie: `passdown_session=${expired}` }).tasks.$post({
      json: { title: 't' },
    })
    expect(res.status).toBe(401)
  })

  it('残りが半分を切ったセッションは、期限を14日後に延ばす', async () => {
    const actor = insertActor(database, { actorType: 'human' })
    const sessionId = insertSession(database, actor, new Date(FIXED_NOW.getTime() + 6 * DAY))

    await client({ Cookie: `passdown_session=${sessionId}` }).tasks.$post({ json: { title: 't' } })

    const row = database.db.select().from(sessions).where(eq(sessions.actorId, actor.id)).get()
    expect(row?.expiresAt).toBe(formatDatetime(new Date(FIXED_NOW.getTime() + 14 * DAY)))
  })
})

describe('Task', () => {
  it('作成して着手でき、経路を web として記録する', async () => {
    const created = await client().tasks.$post({ json: { title: 'やること' } })
    expect(created.status).toBe(200)
    const task = await created.json()
    expect(task).toMatchObject({ id: 1, title: 'やること', status: 'todo' })

    const started = await client().tasks[':id'].start.$post({ param: { id: String(task.id) } })
    expect(started.status).toBe(200)
    expect(await started.json()).toMatchObject({ id: 1, status: 'in_progress', version: 2 })

    const sources = database.db.select({ source: activities.source }).from(activities).all()
    expect(sources).toEqual([{ source: 'web' }, { source: 'web' }])
  })
})

describe('Search', () => {
  it('認証済みの GET /api/search でTaskとDocumentを別の配列として返す', async () => {
    await client().tasks.$post({ json: { title: '検索対象のTask' } })
    await client().documents.$post({ json: { title: '検索対象のDocument' } })

    const response = await app.request('/api/search?query=%E6%A4%9C%E7%B4%A2%E5%AF%BE%E8%B1%A1', {
      headers: { Cookie: cookie },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      tasks: { total: 1, items: [{ title: '検索対象のTask', matchedFields: ['title'] }] },
      documents: { total: 1, items: [{ title: '検索対象のDocument', matchedFields: ['title'] }] },
    })
  })
})

describe('Project', () => {
  it('作成・詳細・更新・文脈・完了・archive を REST API で利用できる', async () => {
    const created = await app.request('/api/projects', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '実装', description: '概要', instructions: '指示' }),
    })
    expect(created.status).toBe(200)
    const project = (await created.json()) as { id: number; version: number }

    const listed = await app.request('/api/projects?limit=1&offset=0', {
      headers: { Cookie: cookie },
    })
    expect(await listed.json()).toMatchObject({
      total: 1,
      items: [{ id: project.id, name: '実装' }],
    })
    expect(
      await (
        await app.request(`/api/projects/${project.id}`, { headers: { Cookie: cookie } })
      ).json(),
    ).toMatchObject({ id: project.id, documents: [] })

    const updated = await app.request(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '更新後',
        description: '',
        instructions: '',
        repositories: [],
        documentIds: [],
        version: project.version,
      }),
    })
    expect(updated.status).toBe(200)
    expect(
      await (
        await app.request(`/api/projects/${project.id}/context`, { headers: { Cookie: cookie } })
      ).json(),
    ).toMatchObject({ id: project.id, taskRemaining: 0, documentRemaining: 0 })
    expect(
      (
        await app.request(`/api/projects/${project.id}/complete`, {
          method: 'POST',
          headers: { Cookie: cookie },
        })
      ).status,
    ).toBe(200)

    const archived = await app.request('/api/projects', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '取りやめ' }),
    })
    const cancelled = (await archived.json()) as { id: number }
    expect(
      (
        await app.request(`/api/projects/${cancelled.id}/archive`, {
          method: 'POST',
          headers: { Cookie: cookie },
        })
      ).status,
    ).toBe(200)

    const invalid = await app.request('/api/projects', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    })
    expect(invalid.status).toBe(400)
  })
})

describe('Document', () => {
  it('作成・更新・archive と既存タグ一覧を REST API で利用できる', async () => {
    const created = await app.request('/api/documents', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '運用資料', content: '本文', tags: [' K8S '] }),
    })
    expect(created.status).toBe(200)
    const document = (await created.json()) as { id: number; version: number; tags: string[] }
    expect(document.tags).toEqual(['k8s'])

    const listed = await app.request('/api/documents?limit=1&offset=0', {
      headers: { Cookie: cookie },
    })
    expect(await listed.json()).toMatchObject({
      total: 1,
      items: [{ id: document.id, title: '運用資料' }],
    })
    const detail = await app.request(`/api/documents/${document.id}`, {
      headers: { Cookie: cookie },
    })
    expect(await detail.json()).toMatchObject({ id: document.id, content: '本文', tags: ['k8s'] })

    const task = createTask(ctxFor(database, owner), { title: '参照する Task' })
    updateTask(ctxFor(database, owner), {
      id: task.id,
      title: task.title,
      description: task.description,
      acceptanceCriteria: task.acceptanceCriteria,
      priority: task.priority,
      links: task.links,
      assigneeId: task.assigneeId,
      parentId: task.parentId,
      projectId: task.projectId,
      documentIds: [document.id],
      version: task.version,
    })
    const project = createProject(ctxFor(database, owner), { name: '参照する Project' })
    updateProject(ctxFor(database, owner), {
      id: project.id,
      name: project.name,
      description: project.description,
      instructions: project.instructions,
      repositories: project.repositories,
      documentIds: [document.id],
      version: project.version,
    })
    const references = await app.request(`/api/documents/${document.id}/references`, {
      headers: { Cookie: cookie },
    })
    expect(references.status).toBe(200)
    expect(await references.json()).toEqual({
      tasks: [{ id: task.id, title: task.title, status: 'todo', projectId: null }],
      projects: [{ id: project.id, name: project.name, status: 'active' }],
    })

    const updated = await app.request(`/api/documents/${document.id}`, {
      method: 'PATCH',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '更新資料',
        content: '更新本文',
        tags: ['設計'],
        version: document.version,
      }),
    })
    expect(updated.status).toBe(200)

    const tags = await app.request('/api/document-tags', { headers: { Cookie: cookie } })
    expect(await tags.json()).toEqual(['設計'])

    const archived = await app.request(`/api/documents/${document.id}/archive`, {
      method: 'POST',
      headers: { Cookie: cookie },
    })
    expect(archived.status).toBe(200)
    expect(await archived.json()).toMatchObject({ status: 'archived', version: 3 })

    const archivedReferences = await app.request(`/api/documents/${document.id}/references`, {
      headers: { Cookie: cookie },
    })
    expect(await archivedReferences.json()).toMatchObject({
      tasks: [{ id: task.id }],
      projects: [{ id: project.id }],
    })

    const invalid = await app.request('/api/documents', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '', tags: ['　'] }),
    })
    expect(invalid.status).toBe(400)
    expect((await errorOf(invalid)).type).toBe('invalid_input')
  })
})

describe('Inbox', () => {
  it('取り込み・一覧・更新・変換・archive を REST API で利用できる', async () => {
    const captured = await app.request('/api/inbox-items', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '思いつき' }),
    })
    const item = (await captured.json()) as { id: number; version: number }

    expect(
      await (await app.request('/api/inbox-items', { headers: { Cookie: cookie } })).json(),
    ).toMatchObject({ total: 1, items: [{ id: item.id, status: 'untriaged' }] })
    expect(
      await (
        await app.request(`/api/inbox-items/${item.id}`, { headers: { Cookie: cookie } })
      ).json(),
    ).toMatchObject({ id: item.id, content: '思いつき', status: 'untriaged' })
    const updated = await app.request(`/api/inbox-items/${item.id}`, {
      method: 'PATCH',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '更新後', version: item.version }),
    })
    expect(updated.status).toBe(200)
    expect(
      (
        await app.request(`/api/inbox-items/${item.id}/convert`, {
          method: 'POST',
          headers: { Cookie: cookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: { targetType: 'task', target: { title: '変換先' } } }),
        })
      ).status,
    ).toBe(200)

    const missing = await app.request('/api/inbox-items/999', { headers: { Cookie: cookie } })
    expect(missing.status).toBe(404)
    expect((await errorOf(missing)).type).toBe('not_found')

    const archived = await app.request('/api/inbox-items', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '不要なメモ' }),
    })
    const archivedItem = (await archived.json()) as { id: number }
    expect(
      (
        await app.request(`/api/inbox-items/${archivedItem.id}/archive`, {
          method: 'POST',
          headers: { Cookie: cookie },
        })
      ).status,
    ).toBe(200)
  })
})

describe('Activity', () => {
  it('ログインした人間が Task の Activity を取得できる', async () => {
    const created = await client().tasks.$post({ json: { title: '履歴を確認する Task' } })
    const task = await created.json()

    const res = await app.request(`/api/tasks/${task.id}/activities?limit=1&offset=0`, {
      headers: { Cookie: cookie },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      total: 1,
      items: [{ eventType: 'task.created', entityId: task.id, source: 'web' }],
    })
  })

  it('Activity の取得にもログインが必要', async () => {
    const res = await app.request('/api/tasks/1/activities')
    expect(res.status).toBe(401)
  })

  it.each([
    ['/api/documents/1/activities', 'document.created', 'document'],
    ['/api/inbox-items/1/activities', 'inbox_item.captured', 'inbox_item'],
  ] as const)('%s を Web UI 専用ルートとして公開する', async (path, eventType, entityType) => {
    recordActivities(ctxFor(database, owner), [
      {
        eventType,
        entityType,
        entityId: 1,
        projectId: null,
        before: {},
        after: {},
      },
    ])

    const res = await app.request(path, { headers: { Cookie: cookie } })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      total: 1,
      items: [{ eventType, entityType, entityId: 1 }],
    })
  })

  it.each([
    '/api/actors/999/activities',
    '/api/projects/999/activities',
    '/api/tasks/999/activities',
    '/api/documents/999/activities',
    '/api/inbox-items/999/activities',
  ])('存在しない対象の %s は 404', async (path) => {
    const res = await app.request(path, { headers: { Cookie: cookie } })
    expect(res.status).toBe(404)
    expect((await errorOf(res)).type).toBe('not_found')
  })
})

describe('エラーの応答（設計書 7.6）', () => {
  it('入力が不正なら 400 invalid_input', async () => {
    const res = await client().tasks.$post({ json: { title: '' } })
    expect(res.status).toBe(400)
    expect(await errorOf(res)).toMatchObject({ type: 'invalid_input' })
  })

  it('パスの id が数値でなければ 400 invalid_input', async () => {
    const res = await client().tasks[':id'].start.$post({ param: { id: 'abc' } })
    expect(res.status).toBe(400)
    expect(await errorOf(res)).toMatchObject({ type: 'invalid_input' })
  })

  it('見つからなければ 404 not_found', async () => {
    const res = await client().tasks[':id'].start.$post({ param: { id: '999' } })
    expect(res.status).toBe(404)
    expect(await errorOf(res)).toEqual({ type: 'not_found', message: 'task:999 が見つかりません' })
  })

  it('操作できなければ 409 not_allowed', async () => {
    await client().tasks.$post({ json: { title: 't' } })
    await client().tasks[':id'].start.$post({ param: { id: '1' } })
    const res = await client().tasks[':id'].start.$post({ param: { id: '1' } })
    expect(res.status).toBe(409)
    expect(await errorOf(res)).toMatchObject({ type: 'not_allowed' })
  })

  it('権限がなければ 403 forbidden', async () => {
    const reader = insertActor(database, { actorType: 'human', permissions: { task: 'read' } })
    const sessionId = insertSession(database, reader, new Date(FIXED_NOW.getTime() + 13 * DAY))
    const res = await client({ Cookie: `passdown_session=${sessionId}` }).tasks.$post({
      json: { title: 't' },
    })
    expect(res.status).toBe(403)
    expect(await errorOf(res)).toMatchObject({ type: 'forbidden' })
  })

  it('競合は 409 conflict、想定外は 500 internal で詳細を返さない', async () => {
    const errors = new Hono()
      .onError(handleError)
      .get('/conflict', () => {
        throw new ConflictError('読み直してください')
      })
      .get('/internal', () => {
        throw new Error('SQLITE_CORRUPT: 秘密の詳細')
      })

    const conflict = await errors.request('/conflict')
    expect(conflict.status).toBe(409)
    expect(await errorOf(conflict)).toEqual({ type: 'conflict', message: '読み直してください' })

    const internal = await errors.request('/internal')
    expect(internal.status).toBe(500)
    const body = await errorOf(internal)
    expect(body.type).toBe('internal')
    expect(body.message).not.toContain('秘密')
  })
})
