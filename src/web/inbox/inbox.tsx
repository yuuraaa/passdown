import { useState } from 'react'
import { Link, useParams } from 'react-router'
import {
  captureInboxItemInput,
  convertInboxItemInput,
  updateInboxItemInput,
} from '../../server/modules/inbox/inputs.js'
import {
  ActorDisplay,
  Button,
  Card,
  Dialog,
  FilterChip,
  Input,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
} from '../components/ui.js'
import { ApiError } from '../lib/api.js'
import { activityLabels } from '../lib/activityLabels.js'
import {
  type InboxConversion,
  useActors,
  useArchiveInboxItem,
  useCaptureInboxItem,
  useConvertInboxItem,
  useInboxActivities,
  useInboxItem,
  useInboxItems,
  useUpdateInboxItem,
} from './hooks.js'
import type { Actor, InboxItemStatus } from './types.js'

const statuses: readonly { value: InboxItemStatus; label: string }[] = [
  { value: 'untriaged', label: '未整理' },
  { value: 'triaged', label: '整理済み' },
  { value: 'archived', label: 'アーカイブ済み' },
]

const message = (error: unknown) => (error instanceof Error ? error.message : '通信に失敗しました')
const actor = (actors: Actor[] | undefined, id: number): Actor =>
  actors?.find((item) => item.id === id) ?? { id, actorType: 'human', name: `Actor #${id}` }
const lines = (value: string) =>
  value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
const tags = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

function CaptureDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const capture = useCaptureInboxItem()
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = () => {
    const parsed = captureInboxItemInput.safeParse({ content })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '入力を確認してください')
      return
    }
    capture.mutate(parsed.data, {
      onSuccess: () => {
        setContent('')
        setError(null)
        onClose()
      },
    })
  }
  return (
    <Dialog onClose={onClose} open={open} title="Inboxに取り込む">
      <div className="grid gap-5">
        <Textarea
          disabled={capture.isPending}
          label="本文"
          onChange={(event) => setContent(event.target.value)}
          placeholder="整理すればProject・Task・Documentになる内容を入力"
          value={content}
        />
        <p className="text-sm text-muted">
          ただのメモではなく、後で整理できる思いつきを取り込みます。
        </p>
        {(error || capture.isError) && (
          <p className="text-sm text-danger">{error ?? message(capture.error)}</p>
        )}
        <div className="flex gap-3">
          <Button disabled={capture.isPending} onClick={onClose}>
            キャンセル
          </Button>
          <Button disabled={capture.isPending} onClick={submit} variant="primary">
            {capture.isPending ? '取り込み中…' : '取り込む'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function ConvertForm({
  content,
  pending,
  submit,
  cancel,
}: {
  content: string
  pending: boolean
  submit: (input: InboxConversion) => void
  cancel: () => void
}) {
  const [targetType, setTargetType] = useState<InboxConversion['targetType']>('task')
  const [projectName, setProjectName] = useState(content)
  const [projectDescription, setProjectDescription] = useState(content)
  const [instructions, setInstructions] = useState('')
  const [repositories, setRepositories] = useState('')
  const [taskTitle, setTaskTitle] = useState(content)
  const [taskDescription, setTaskDescription] = useState(content)
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('')
  const [priority, setPriority] = useState<'high' | 'normal' | 'low'>('normal')
  const [links, setLinks] = useState('')
  const [documentTitle, setDocumentTitle] = useState('')
  const [documentContent, setDocumentContent] = useState(content)
  const [documentTags, setDocumentTags] = useState('')
  const [error, setError] = useState<string | null>(null)

  const onSubmit = () => {
    const target =
      targetType === 'project'
        ? {
            targetType,
            target: {
              name: projectName,
              description: projectDescription,
              instructions,
              repositories: lines(repositories),
              documentIds: [],
            },
          }
        : targetType === 'task'
          ? {
              targetType,
              target: {
                title: taskTitle,
                description: taskDescription,
                acceptanceCriteria,
                priority,
                links: lines(links),
              },
            }
          : {
              targetType,
              target: { title: documentTitle, content: documentContent, tags: tags(documentTags) },
            }
    const parsed = convertInboxItemInput.safeParse({ id: 1, target })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '入力を確認してください')
      return
    }
    submit(parsed.data.target)
  }

  return (
    <div className="grid gap-5">
      <Select
        label="変換先"
        onChange={(event) => setTargetType(event.target.value as InboxConversion['targetType'])}
        value={targetType}
      >
        <option value="task">Task</option>
        <option value="project">Project</option>
        <option value="document">Document</option>
      </Select>
      {targetType === 'project' && (
        <div className="grid gap-4">
          <Input
            label="Project名"
            onChange={(event) => setProjectName(event.target.value)}
            value={projectName}
          />
          <Textarea
            label="概要"
            onChange={(event) => setProjectDescription(event.target.value)}
            value={projectDescription}
          />
          <Textarea
            label="instructions"
            onChange={(event) => setInstructions(event.target.value)}
            value={instructions}
          />
          <Textarea
            label="関連リポジトリ（1行に1件）"
            onChange={(event) => setRepositories(event.target.value)}
            value={repositories}
          />
        </div>
      )}
      {targetType === 'task' && (
        <div className="grid gap-4">
          <Input
            label="タイトル"
            onChange={(event) => setTaskTitle(event.target.value)}
            value={taskTitle}
          />
          <Textarea
            label="説明"
            onChange={(event) => setTaskDescription(event.target.value)}
            value={taskDescription}
          />
          <Textarea
            label="完了条件"
            onChange={(event) => setAcceptanceCriteria(event.target.value)}
            value={acceptanceCriteria}
          />
          <Select
            label="優先度"
            onChange={(event) => setPriority(event.target.value as typeof priority)}
            value={priority}
          >
            <option value="high">高</option>
            <option value="normal">通常</option>
            <option value="low">低</option>
          </Select>
          <Textarea
            label="URL（1行に1件）"
            onChange={(event) => setLinks(event.target.value)}
            value={links}
          />
        </div>
      )}
      {targetType === 'document' && (
        <div className="grid gap-4">
          <Input
            label="タイトル"
            onChange={(event) => setDocumentTitle(event.target.value)}
            value={documentTitle}
          />
          <Textarea
            label="本文（Markdown）"
            onChange={(event) => setDocumentContent(event.target.value)}
            rows={12}
            value={documentContent}
          />
          <Input
            label="タグ（カンマ区切り）"
            onChange={(event) => setDocumentTags(event.target.value)}
            value={documentTags}
          />
        </div>
      )}
      <p className="text-sm text-muted">変換後の Inbox Item は整理済みになり、元に戻せません。</p>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-3">
        <Button disabled={pending} onClick={cancel}>
          キャンセル
        </Button>
        <Button disabled={pending} onClick={onSubmit} variant="primary">
          {pending ? '変換中…' : '変換する'}
        </Button>
      </div>
    </div>
  )
}

export function InboxPage() {
  const [status, setStatus] = useState<InboxItemStatus>('untriaged')
  const [captureOpen, setCaptureOpen] = useState(false)
  const inbox = useInboxItems(status)
  const actors = useActors()
  return (
    <>
      <PageHeader
        action={
          <Button onClick={() => setCaptureOpen(true)} variant="primary">
            取り込む
          </Button>
        }
        lead="未整理の思いつきを取り込み、Project・Task・Documentへ変換します。"
        title="Inbox"
      />
      <nav aria-label="Inboxの状態" className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {statuses.map((item) => (
          <FilterChip
            key={item.value}
            onClick={() => setStatus(item.value)}
            selected={status === item.value}
          >
            {item.label}
            {inbox.data ? ` ${status === item.value ? inbox.data.total : ''}` : ''}
          </FilterChip>
        ))}
      </nav>
      {inbox.isPending && <p className="text-muted">読み込み中…</p>}
      {inbox.isError && <p className="text-danger">{message(inbox.error)}</p>}
      {inbox.data &&
        (inbox.data.items.length ? (
          <div className="grid gap-3">
            {inbox.data.items.map((item) => (
              <Card className="p-4" key={item.id}>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_13rem_auto] md:items-center">
                  <Link
                    className="line-clamp-2 font-semibold hover:underline"
                    to={`/inbox/${item.id}`}
                  >
                    {item.content}
                  </Link>
                  <ActorDisplay actor={actor(actors.data, item.createdBy)} />
                  <StatusBadge status={item.status} />
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-6 text-muted">この状態の Inbox Item はありません。</Card>
        ))}
      <CaptureDialog onClose={() => setCaptureOpen(false)} open={captureOpen} />
    </>
  )
}

function conversionLink(activity: { convertedTo?: { entityType: string; entityId: number } }) {
  const target = activity.convertedTo
  if (!target) return null
  const to =
    target.entityType === 'project'
      ? `/projects/${target.entityId}/overview`
      : target.entityType === 'task'
        ? `/tasks/${target.entityId}`
        : `/documents/${target.entityId}`
  const label =
    target.entityType === 'project' ? 'Project' : target.entityType === 'task' ? 'Task' : 'Document'
  return (
    <Link className="underline" to={to}>
      {label} #{target.entityId} を開く
    </Link>
  )
}

export function InboxDetailPage() {
  const id = Number(useParams().id)
  const inbox = useInboxItem(id)
  const activities = useInboxActivities(id)
  const actors = useActors()
  const update = useUpdateInboxItem(id)
  const archive = useArchiveInboxItem(id)
  const convert = useConvertInboxItem(id)
  const [editOpen, setEditOpen] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [content, setContent] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  if (!Number.isInteger(id) || id < 1)
    return <p className="text-danger">Inbox Item の ID が不正です。</p>
  if (inbox.isPending) return <p className="text-muted">読み込み中…</p>
  if (inbox.isError || !inbox.data) return <p className="text-danger">{message(inbox.error)}</p>
  const item = inbox.data
  const editable = item.status === 'untriaged'
  const save = () => {
    const parsed = updateInboxItemInput.safeParse({ id, content, version: item.version })
    if (!parsed.success) {
      setEditError(parsed.error.issues[0]?.message ?? '入力を確認してください')
      return
    }
    update.mutate(
      { content: parsed.data.content, version: parsed.data.version },
      { onSuccess: () => setEditOpen(false) },
    )
  }
  return (
    <>
      <PageHeader
        action={
          editable ? (
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => {
                  setContent(item.content)
                  setEditError(null)
                  setEditOpen(true)
                }}
              >
                編集
              </Button>
              <Button onClick={() => setConvertOpen(true)}>変換する</Button>
              <Button onClick={() => setArchiveOpen(true)} variant="danger">
                アーカイブ
              </Button>
            </div>
          ) : undefined
        }
        lead={
          editable
            ? '未整理の Item は編集・変換・アーカイブできます。'
            : '整理済み・アーカイブ済みの Item は読み取り専用です。'
        }
        title="Inbox Item"
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card className="p-5 md:p-7">
          <div className="mb-4 flex justify-between gap-3">
            <h2 className="font-semibold">本文</h2>
            <StatusBadge status={item.status} />
          </div>
          <p className="whitespace-pre-wrap">{item.content}</p>
        </Card>
        <Card className="p-5">
          <dl className="grid gap-4 text-sm">
            <div>
              <dt className="text-muted">取り込み者</dt>
              <dd>
                <ActorDisplay actor={actor(actors.data, item.createdBy)} />
              </dd>
            </div>
            <div>
              <dt className="text-muted">状態</dt>
              <dd>
                <StatusBadge status={item.status} />
              </dd>
            </div>
            <div>
              <dt className="text-muted">版数</dt>
              <dd>{item.version}</dd>
            </div>
          </dl>
        </Card>
      </div>
      <Card className="mt-5 p-5">
        <h2 className="mb-3 font-semibold">Activity</h2>
        {activities.isError && <p className="text-danger">{message(activities.error)}</p>}
        <ol className="divide-y divide-line">
          {activities.data?.items.map((activity) => (
            <li className="grid gap-1 py-3 text-sm" key={activity.id}>
              <span>
                <ActorDisplay actor={actor(actors.data, activity.actorId)} /> が{' '}
                {activityLabels[activity.eventType] ?? activity.eventType}{' '}
                <StatusBadge status={activity.source}>
                  {activity.source === 'web' ? 'Web' : 'MCP'}
                </StatusBadge>
              </span>
              {conversionLink(activity)}
              <time className="text-muted">
                {new Intl.DateTimeFormat('ja-JP', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'Asia/Tokyo',
                }).format(new Date(activity.occurredAt))}
              </time>
            </li>
          ))}
        </ol>
        {activities.data && !activities.data.items.length && (
          <p className="text-muted">Activity はありません。</p>
        )}
      </Card>
      <Dialog onClose={() => setEditOpen(false)} open={editOpen} title="Inbox Itemを編集">
        <div className="grid gap-5">
          <Textarea
            label="本文"
            onChange={(event) => setContent(event.target.value)}
            value={content}
          />
          {(editError || update.isError) && (
            <p className="text-sm text-danger">
              {editError ??
                (update.error instanceof ApiError && update.error.type === 'conflict'
                  ? `${update.error.message} 画面を再読み込みしてからやり直してください。`
                  : message(update.error))}
            </p>
          )}
          <div className="flex gap-3">
            <Button disabled={update.isPending} onClick={() => setEditOpen(false)}>
              キャンセル
            </Button>
            <Button disabled={update.isPending} onClick={save} variant="primary">
              {update.isPending ? '保存中…' : '変更を保存'}
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog onClose={() => setConvertOpen(false)} open={convertOpen} title="Inbox Itemを変換">
        <ConvertForm
          key={`${item.id}-${convertOpen}`}
          cancel={() => setConvertOpen(false)}
          content={item.content}
          pending={convert.isPending}
          submit={(input) => convert.mutate(input, { onSuccess: () => setConvertOpen(false) })}
        />
        {convert.isError && <p className="mt-4 text-sm text-danger">{message(convert.error)}</p>}
      </Dialog>
      <Dialog
        onClose={() => setArchiveOpen(false)}
        open={archiveOpen}
        title="Inbox Itemをアーカイブ"
      >
        <p>アーカイブを取り消す操作はありません。内容は読み取り・絞り込みで確認できます。</p>
        <div className="mt-5 flex gap-3">
          <Button
            disabled={archive.isPending}
            onClick={() => archive.mutate(undefined, { onSuccess: () => setArchiveOpen(false) })}
            variant="danger"
          >
            {archive.isPending ? 'アーカイブ中…' : 'アーカイブする'}
          </Button>
          <Button disabled={archive.isPending} onClick={() => setArchiveOpen(false)}>
            キャンセル
          </Button>
        </div>
        {archive.isError && <p className="mt-4 text-sm text-danger">{message(archive.error)}</p>}
      </Dialog>
    </>
  )
}
