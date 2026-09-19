import { McpServer } from '@modelcontextprotocol/server'
import type { z } from 'zod'
import { AppError } from '../core/errors.js'
import {
  type Actor,
  type Ctx,
  type Db,
  hasPermission,
  type McpOperation,
} from '../core/operation.js'
import { formatDatetime } from '../core/time.js'
import { getExistingDocumentTags } from '../modules/document/index.js'
import { descriptionWithDocumentTags, toolDescriptions } from './descriptions.js'
import { toMcpIds, toMcpInputSchema } from './ids.js'

export type McpDeps = {
  db: Db
  now: () => Date
  /** MCP に出す操作。routes に 'mcp' を含むものしか受け付けない（設計書 4.9） */
  operations: readonly McpOperation[]
}

function toolError(err: unknown) {
  let message: string
  if (err instanceof AppError) {
    message = err.message
  } else {
    // 想定外のエラーの詳細は返さず、ログに残す（設計書 4.6）
    console.error(err)
    message = 'サーバーで想定外のエラーが起きました'
  }
  return { isError: true, content: [{ type: 'text' as const, text: message }] }
}

/** 操作を MCP のツールとして登録する。MCP に出してよい操作しか受け付けない */
function registerOperation(server: McpServer, deps: McpDeps, actor: Actor, op: McpOperation) {
  const description = toolDescriptions[op.name]
  if (!description) {
    throw new Error(`MCP のツールの説明がありません: ${op.name}`)
  }
  const described =
    op.name === 'create_document' || op.name === 'update_document'
      ? descriptionWithDocumentTags(
          op.name,
          getExistingDocumentTags({
            db: deps.db,
            actor,
            source: 'mcp',
            now: formatDatetime(deps.now()),
          }),
        )
      : description
  server.registerTool(
    op.name,
    { description: described, inputSchema: toMcpInputSchema(op.input as z.ZodObject) },
    (input: unknown) => {
      const ctx: Ctx = { db: deps.db, actor, source: 'mcp', now: formatDatetime(deps.now()) }
      try {
        const result = toMcpIds(op(ctx, input), op.entity)
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
      } catch (err) {
        return toolError(err)
      }
    },
  )
}

/**
 * リクエストのたびに、Actor の権限に合うツールだけを登録したサーバーを作る（設計書 2.3）。
 * 権限外のツールは表示しない（要件定義書 F-AUTH-04）。
 */
export function buildMcpServer(deps: McpDeps, actor: Actor): McpServer {
  const server = new McpServer({ name: 'passdown', version: '0.0.0' })
  for (const op of deps.operations) {
    if (op.requires.every((p) => hasPermission(actor, p))) {
      registerOperation(server, deps, actor, op)
    }
  }
  return server
}
