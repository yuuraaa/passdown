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
import { readActorSummaries } from '../modules/auth/index.js'
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
        const result = ctx.db.transaction((db) => {
          const transactionCtx = { ...ctx, db }
          const value = toMcpIds(op(transactionCtx, input), op.entity)
          if (op.name === 'list_actors') return value
          const ids = new Set<number>()
          const collect = (node: unknown): void => {
            if (Array.isArray(node)) {
              node.forEach(collect)
              return
            }
            if (!node || typeof node !== 'object') return
            for (const [key, entry] of Object.entries(node)) {
              if (
                ['id', 'assigneeId', 'createdBy', 'updatedBy', 'actorId'].includes(key) &&
                typeof entry === 'string' &&
                /^actor:[1-9][0-9]*$/.test(entry)
              )
                ids.add(Number(entry.slice(6)))
              if (typeof entry === 'object') collect(entry)
            }
          }
          collect(value)
          if (!ids.size || !value || typeof value !== 'object') return value
          const summaries = toMcpIds(readActorSummaries(transactionCtx, [...ids]), 'actor')
          return Array.isArray(value)
            ? { items: value, actors: summaries }
            : { ...value, actors: summaries }
        })
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
