import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { isMcpOperation } from './core/operation.js'
import type { Db } from './core/operation.js'
import { createApi } from './http/app.js'
import { createMcpApp } from './mcp/app.js'
import { operations } from './operations.js'

export type AppDeps = {
  db: Db
  now: () => Date
  mcpAllowedHosts: string[]
  /** Web UI のビルドの置き場所。指定しなければ Web UI を配信しない */
  webRoot?: string
}

/** 1つのプロセスで Web UI・REST API・MCP を受け持つ（設計書 1章） */
export function createApp(deps: AppDeps) {
  const app = new Hono()
  app.route('/api', createApi(deps))
  app.route(
    '/mcp',
    createMcpApp({
      db: deps.db,
      now: deps.now,
      allowedHosts: deps.mcpAllowedHosts,
      operations: operations.filter(isMcpOperation),
    }),
  )
  if (deps.webRoot) {
    // /api・/mcp 以外は Web UI の静的ファイル、当たらなければ index.html（設計書 7.1）
    app.use('*', serveStatic({ root: deps.webRoot }))
    app.get('*', serveStatic({ root: deps.webRoot, path: 'index.html' }))
  }
  return app
}
