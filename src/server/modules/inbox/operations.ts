import { and, asc, count, eq, sql } from 'drizzle-orm'
import { ConflictError, ForbiddenError, NotAllowedError, NotFoundError } from '../../core/errors.js'
import { hasPermission, type Ctx, defineOperation, type Resource } from '../../core/operation.js'
import {
  readInboxItemActivities,
  recordActivities,
  type Activity,
  type ActivityPage,
  type ActivityRecord,
  inboxItemActivitiesInput,
} from '../activity/index.js'
import { createDocument } from '../document/index.js'
import { createProject } from '../project/index.js'
import { createTask } from '../task/index.js'
import {
  archiveInboxItemInput,
  captureInboxItemInput,
  convertInboxItemInput,
  getInboxItemInput,
  listInboxItemsInput,
  updateInboxItemInput,
} from './inputs.js'
import { inboxItems } from './schema.js'

export type InboxItem = typeof inboxItems.$inferSelect
export type InboxItemPage = { items: InboxItem[]; total: number }
export type ConvertedTo = { entityType: 'project' | 'task' | 'document'; entityId: number }
export type InboxItemActivity = Activity & { convertedTo?: ConvertedTo }
export type InboxItemActivityPage = { items: InboxItemActivity[]; total: number }

function readInboxItem(ctx: Ctx, id: number): InboxItem {
  const item = ctx.db.select().from(inboxItems).where(eq(inboxItems.id, id)).get()
  if (!item) throw new NotFoundError(`inbox_item:${id} が見つかりません`)
  return item
}

function ensureUntriaged(item: InboxItem): void {
  if (item.status !== 'untriaged') {
    throw new NotAllowedError(`inbox_item:${item.id} は ${item.status} のため操作できません`)
  }
}

function activity(
  eventType: ActivityRecord['eventType'],
  item: InboxItem,
  before: ActivityRecord['before'],
  after: ActivityRecord['after'],
): ActivityRecord {
  return { eventType, entityType: 'inbox_item', entityId: item.id, projectId: null, before, after }
}

function ensureTargetWritePermission(ctx: Ctx, targetType: 'project' | 'task' | 'document'): void {
  const resource = targetType as Resource
  if (!hasPermission(ctx.actor, [resource, 'readwrite'])) {
    throw new ForbiddenError(`convert_inbox_item には ${resource} の readwrite の権限が必要です`)
  }
}

function convertedTo(activity: Activity): ConvertedTo | undefined {
  const value = activity.after.convertedTo
  if (
    typeof value !== 'object' ||
    value === null ||
    !('entityType' in value) ||
    !('entityId' in value) ||
    (value.entityType !== 'project' &&
      value.entityType !== 'task' &&
      value.entityType !== 'document') ||
    typeof value.entityId !== 'number'
  ) {
    return undefined
  }
  return { entityType: value.entityType, entityId: value.entityId }
}

export const listInboxItems = defineOperation({
  name: 'list_inbox_items',
  routes: ['web', 'mcp'],
  requires: [['inbox', 'read']],
  returns: [],
  entity: 'inbox_item',
  input: listInboxItemsInput,
  run: (ctx, input): InboxItemPage => {
    const where = eq(inboxItems.status, input.status)
    const items = ctx.db
      .select()
      .from(inboxItems)
      .where(where)
      .orderBy(asc(inboxItems.id))
      .limit(input.limit)
      .offset(input.offset)
      .all()
    const total = ctx.db.select({ value: count() }).from(inboxItems).where(where).get()?.value ?? 0
    return { items, total }
  },
})

/** Inbox Item 詳細画面で、状態に関係なく1件を返す。 */
export const getInboxItemOperation = defineOperation({
  name: 'get_inbox_item',
  routes: ['web'],
  requires: [['inbox', 'read']],
  returns: [],
  entity: 'inbox_item',
  input: getInboxItemInput,
  run: (ctx, input) => readInboxItem(ctx, input.id),
})

export const captureInboxItem = defineOperation({
  name: 'capture_inbox_item',
  routes: ['web', 'mcp'],
  requires: [['inbox', 'readwrite']],
  returns: [],
  entity: 'inbox_item',
  input: captureInboxItemInput,
  run: (ctx, input) => {
    const item = ctx.db
      .insert(inboxItems)
      .values({ content: input.content, status: 'untriaged', createdBy: ctx.actor.id })
      .returning()
      .get()
    recordActivities(ctx, [
      activity('inbox_item.captured', item, {}, { content: item.content, status: item.status }),
    ])
    return item
  },
})

export const updateInboxItem = defineOperation({
  name: 'update_inbox_item',
  routes: ['web', 'mcp'],
  requires: [['inbox', 'readwrite']],
  returns: [],
  entity: 'inbox_item',
  input: updateInboxItemInput,
  run: (ctx, input) => {
    const before = readInboxItem(ctx, input.id)
    ensureUntriaged(before)
    const item = ctx.db
      .update(inboxItems)
      .set({ content: input.content, version: sql`${inboxItems.version} + 1` })
      .where(and(eq(inboxItems.id, input.id), eq(inboxItems.version, input.version)))
      .returning()
      .get()
    if (!item) {
      throw new ConflictError(
        `inbox_item:${input.id} はほかの操作で更新されました。読み直してからやり直してください`,
      )
    }
    recordActivities(ctx, [
      activity('inbox_item.updated', item, { content: before.content }, { content: item.content }),
    ])
    return item
  },
})

export const archiveInboxItem = defineOperation({
  name: 'archive_inbox_item',
  routes: ['web', 'mcp'],
  requires: [['inbox', 'readwrite']],
  returns: [],
  entity: 'inbox_item',
  input: archiveInboxItemInput,
  run: (ctx, input) => {
    const before = readInboxItem(ctx, input.id)
    ensureUntriaged(before)
    const item = ctx.db
      .update(inboxItems)
      .set({ status: 'archived', version: sql`${inboxItems.version} + 1` })
      .where(and(eq(inboxItems.id, input.id), eq(inboxItems.status, 'untriaged')))
      .returning()
      .get()
    if (!item) {
      throw new NotAllowedError(`inbox_item:${input.id} はすでに操作できない状態です`)
    }
    recordActivities(ctx, [
      activity('inbox_item.archived', item, { status: before.status }, { status: item.status }),
    ])
    return item
  },
})

export const convertInboxItem = defineOperation({
  name: 'convert_inbox_item',
  routes: ['web', 'mcp'],
  requires: [['inbox', 'readwrite']],
  returns: [],
  entity: 'inbox_item',
  input: convertInboxItemInput,
  run: (ctx, input) => {
    const before = readInboxItem(ctx, input.id)
    ensureUntriaged(before)
    ensureTargetWritePermission(ctx, input.target.targetType)
    const target =
      input.target.targetType === 'project'
        ? createProject.withoutPermissionCheck(ctx, input.target.target)
        : input.target.targetType === 'task'
          ? createTask.withoutPermissionCheck(ctx, input.target.target)
          : createDocument.withoutPermissionCheck(ctx, input.target.target)
    const converted: ConvertedTo = { entityType: input.target.targetType, entityId: target.id }
    const item = ctx.db
      .update(inboxItems)
      .set({ status: 'triaged', version: sql`${inboxItems.version} + 1` })
      .where(and(eq(inboxItems.id, input.id), eq(inboxItems.status, 'untriaged')))
      .returning()
      .get()
    if (!item) {
      throw new NotAllowedError(`inbox_item:${input.id} はすでに操作できない状態です`)
    }
    recordActivities(ctx, [
      activity(
        'inbox_item.converted',
        item,
        { status: before.status },
        { status: item.status, convertedTo: converted },
      ),
    ])
    return item
  },
})

export const getInboxItemActivities = defineOperation({
  name: 'get_inbox_item_activities',
  routes: ['web'],
  requires: [],
  returns: [],
  entity: 'inbox_item',
  input: inboxItemActivitiesInput,
  run: (ctx, input): InboxItemActivityPage => {
    const page: ActivityPage = readInboxItemActivities(ctx, input)
    return {
      items: page.items.map((item) => ({ ...item, convertedTo: convertedTo(item) })),
      total: page.total,
    }
  },
})
