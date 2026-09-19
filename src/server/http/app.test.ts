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
import { sessions } from '../modules/auth/schema.js'
import { humanCredentials } from '../modules/auth/schema.js'
import { hashPassword, hashSecret } from '../modules/auth/index.js'
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
