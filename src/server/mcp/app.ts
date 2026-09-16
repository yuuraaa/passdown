import { createMcpHonoApp } from '@modelcontextprotocol/hono'
import { createMcpHandler } from '@modelcontextprotocol/server'
import type { Actor } from '../core/operation.js'
import { authenticateToken } from '../modules/auth/index.js'
import { buildMcpServer, type McpDeps } from './server.js'

// createMcpHonoApp は JSON の本文を解析して parsedBody に入れるが、その型を宣言していない
declare module 'hono' {
  interface ContextVariableMap {
    parsedBody?: unknown
  }
}

export type McpAppDeps = McpDeps & {
  /** Host・Origin で許可するホスト名（設計書 2.9） */
  allowedHosts: string[]
}

function bearerToken(header: string | undefined): string | null {
  const match = header?.match(/^Bearer\s+(\S+)$/i)
  return match?.[1] ?? null
}

/**
 * MCP（/mcp）。Bearer トークンだけを受け付け、Cookie を読まない（設計書 4.9）。
 * SDK はトークンを検証しないため、手前で検証して Actor を authInfo として渡す（設計書 2.3）。
 */
export function createMcpApp(deps: McpAppDeps) {
  const app = createMcpHonoApp({
    host: '0.0.0.0',
    allowedHosts: deps.allowedHosts,
    allowedOrigins: deps.allowedHosts,
  })
  const handler = createMcpHandler(({ authInfo }) => {
    const actor = authInfo?.extra?.actor as Actor | undefined
    if (!actor) {
      throw new Error('認証していないリクエストが MCP のサーバーに届きました')
    }
    return buildMcpServer(deps, actor)
  })

  app.all('/', async (c) => {
    const token = bearerToken(c.req.header('Authorization'))
    const actor = token ? authenticateToken(deps.db, token) : null
    if (!token || !actor) {
      c.header('WWW-Authenticate', 'Bearer')
      return c.json({ error: { type: 'unauthorized', message: 'トークンが無効です' } }, 401)
    }
    return handler.fetch(c.req.raw, {
      authInfo: { token, clientId: `actor:${actor.id}`, scopes: [], extra: { actor } },
      parsedBody: c.get('parsedBody'),
    })
  })
  return app
}
