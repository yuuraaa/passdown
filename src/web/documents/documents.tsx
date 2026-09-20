import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { createDocumentInput, updateDocumentInput } from '../../server/modules/document/inputs.js'
import {
  ActorDisplay,
  Button,
  Card,
  Dialog,
  Input,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
} from '../components/ui.js'
import { ApiError } from '../lib/api.js'
import {
  useActors,
  useArchiveDocument,
  useCreateDocument,
  useDocument,
  useDocumentActivities,
  useDocumentReferences,
  useDocumentTags,
  useDocuments,
  useUpdateDocument,
} from './hooks.js'
import type { Actor, Document, DocumentStatus } from './types.js'

const message = (error: unknown) => (error instanceof Error ? error.message : '通信に失敗しました')
const actor = (actors: Actor[] | undefined, id: number): Actor =>
  actors?.find((item) => item.id === id) ?? { id, actorType: 'human', name: `Actor #${id}` }
const date = (value: string) =>
  new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Tokyo',
  }).format(new Date(value))

export function TagEditor({
  tags,
  onChange,
  suggestions,
  disabled = false,
}: {
  tags: string[]
  onChange: (value: string[]) => void
  suggestions: string[]
  disabled?: boolean
}) {
  const [value, setValue] = useState('')
  const add = () => {
    const tag = value.trim()
    if (tag && !tags.includes(tag)) onChange([...tags, tag])
    setValue('')
  }
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-1 text-sm"
            key={tag}
          >
            {tag}
            <button
              aria-label={`${tag}を削除`}
              className="min-h-6 px-1"
              disabled={disabled}
              onClick={() => onChange(tags.filter((item) => item !== tag))}
              type="button"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <label className="grid gap-1.5 text-sm text-muted">
        タグ
        <input
          className="min-h-11 rounded-ui border border-line bg-surface px-3 py-2 text-ink"
          disabled={disabled}
          list="document-tag-suggestions"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              add()
            }
          }}
          placeholder="既存のタグから選択、または入力"
          value={value}
        />
        <datalist id="document-tag-suggestions">
          {suggestions.map((tag) => (
            <option key={tag} value={tag} />
          ))}
        </datalist>
      </label>
      <Button className="justify-self-start" disabled={disabled || !value.trim()} onClick={add}>
        タグを追加
      </Button>
      <p className="text-xs text-muted">archived の Document を含む既存タグを候補表示します。</p>
    </div>
  )
}

function Form({
  initial,
  suggestions,
  pending,
  submit,
  cancel,
  label,
}: {
  initial?: Document
  suggestions: string[]
  pending: boolean
  submit: (value: { title: string; content: string; tags: string[]; version?: number }) => void
  cancel: () => void
  label: string
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [tags, setTags] = useState(initial?.tags ?? [])
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        const raw = initial
          ? { id: initial.id, title, content, tags, version: initial.version }
          : { title, content, tags }
        const parsed = initial
          ? updateDocumentInput.safeParse(raw)
          : createDocumentInput.safeParse(raw)
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? '入力を確認してください')
          return
        }
        submit(parsed.data)
      }}
    >
      <Input
        disabled={pending}
        label="タイトル"
        onChange={(event) => setTitle(event.target.value)}
        value={title}
      />
      <Textarea
        disabled={pending}
        label="本文（Markdown）"
        onChange={(event) => setContent(event.target.value)}
        rows={16}
        value={content}
      />
      <TagEditor disabled={pending} onChange={setTags} suggestions={suggestions} tags={tags} />
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-3">
        <Button disabled={pending} type="submit" variant="primary">
          {pending ? '保存中…' : label}
        </Button>
        <Button disabled={pending} onClick={cancel}>
          キャンセル
        </Button>
      </div>
    </form>
  )
}

export function DocumentsPage() {
  const [status, setStatus] = useState<DocumentStatus>('active')
  const documents = useDocuments(status)
  const actors = useActors()
  return (
    <>
      <PageHeader
        action={
          <Link to="/documents/new">
            <Button variant="primary">Documentを作成</Button>
          </Link>
        }
        lead="Task・Projectの作業文脈となるMarkdown資料です。"
        title="Documents"
      />
      <div className="mb-5 max-w-xs">
        <Select
          label="状態"
          onChange={(event) => setStatus(event.target.value as DocumentStatus)}
          value={status}
        >
          <option value="active">active</option>
          <option value="archived">archived</option>
        </Select>
      </div>
      {documents.isPending && <p className="text-muted">読み込み中…</p>}
      {documents.isError && <p className="text-danger">{message(documents.error)}</p>}
      {documents.data &&
        (documents.data.items.length ? (
          <div className="grid gap-3">
            {documents.data.items.map((item) => (
              <Card className="p-4" key={item.id}>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_13rem] md:items-center">
                  <Link className="font-semibold hover:underline" to={`/documents/${item.id}`}>
                    {item.title}
                  </Link>
                  <div className="flex flex-wrap gap-1">
                    {item.tags.map((tag) => (
                      <StatusBadge key={tag} status={tag}>
                        {tag}
                      </StatusBadge>
                    ))}
                  </div>
                  <div className="grid gap-1 text-sm text-muted">
                    <ActorDisplay actor={actor(actors.data, item.updatedBy)} />
                    <time>{date(item.updatedAt)}</time>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-6 text-muted">この状態の Document はありません。</Card>
        ))}
    </>
  )
}

export function NewDocumentPage() {
  const navigate = useNavigate()
  const tags = useDocumentTags()
  const create = useCreateDocument()
  return (
    <>
      <PageHeader lead="Markdownとして保存します。HTMLは描画しません。" title="Documentを作成" />
      <Card className="p-5 md:p-7">
        <Form
          cancel={() => void navigate('/documents')}
          label="作成する"
          pending={create.isPending}
          submit={(input) =>
            create.mutate(input, { onSuccess: (item) => void navigate(`/documents/${item.id}`) })
          }
          suggestions={tags.data ?? []}
        />
        {create.isError && <p className="mt-4 text-sm text-danger">{message(create.error)}</p>}
      </Card>
    </>
  )
}

export function DocumentDetailPage() {
  const id = Number(useParams().id)
  const document = useDocument(id)
  const tags = useDocumentTags()
  const actors = useActors()
  const refs = useDocumentReferences(id)
  const activities = useDocumentActivities(id)
  const update = useUpdateDocument(id)
  const archive = useArchiveDocument(id)
  const [edit, setEdit] = useState(false)
  const [confirm, setConfirm] = useState(false)
  if (!Number.isInteger(id) || id < 1)
    return <p className="text-danger">Document の ID が不正です。</p>
  if (document.isPending) return <p className="text-muted">読み込み中…</p>
  if (document.isError || !document.data)
    return <p className="text-danger">{message(document.error)}</p>
  const item = document.data
  const active = item.status === 'active'
  return (
    <>
      <PageHeader
        action={
          active ? (
            <div className="flex gap-3">
              <Button onClick={() => setEdit(true)}>編集</Button>
              <Button onClick={() => setConfirm(true)} variant="danger">
                アーカイブ
              </Button>
            </div>
          ) : undefined
        }
        title={item.title}
      />
      <div className="mb-5 flex gap-2">
        {item.tags.map((tag) => (
          <StatusBadge key={tag} status={tag}>
            {tag}
          </StatusBadge>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card className="p-5 md:p-7">
          <div className="mb-4 flex justify-between gap-3">
            <h2 className="font-semibold">本文</h2>
            <span className="text-sm text-muted">Markdown表示（HTMLは描画しません）</span>
          </div>
          <article className="prose max-w-none">
            <Markdown remarkPlugins={[remarkGfm]} skipHtml>
              {item.content}
            </Markdown>
          </article>
        </Card>
        <Card className="p-5">
          <dl className="grid gap-4 text-sm">
            <div>
              <dt className="text-muted">状態</dt>
              <dd>
                <StatusBadge status={item.status} />
              </dd>
            </div>
            <div>
              <dt className="text-muted">作成者</dt>
              <dd>
                <ActorDisplay actor={actor(actors.data, item.createdBy)} />
              </dd>
            </div>
            <div>
              <dt className="text-muted">更新者</dt>
              <dd>
                <ActorDisplay actor={actor(actors.data, item.updatedBy)} />
              </dd>
            </div>
            <div>
              <dt className="text-muted">作成日時</dt>
              <dd>{date(item.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted">更新日時</dt>
              <dd>{date(item.updatedAt)}</dd>
            </div>
            <div>
              <dt className="text-muted">参照元</dt>
              <dd className="grid gap-2">
                {refs.data?.projects.map((project) => (
                  <Link
                    className="underline"
                    key={project.id}
                    to={`/projects/${project.id}/overview`}
                  >
                    Project: {project.name}
                  </Link>
                ))}
                {refs.data?.tasks.map((task) => (
                  <Link className="underline" key={task.id} to={`/tasks/${task.id}`}>
                    Task: {task.title}
                  </Link>
                ))}
                {refs.data && !refs.data.projects.length && !refs.data.tasks.length && 'ありません'}
              </dd>
            </div>
          </dl>
        </Card>
      </div>
      <Card className="mt-5 p-5">
        <h2 className="mb-3 font-semibold">Activity</h2>
        <ol className="divide-y divide-line">
          {activities.data?.items.map((activity) => (
            <li className="grid gap-1 py-3 text-sm" key={activity.id}>
              <span>
                <ActorDisplay actor={actor(actors.data, activity.actorId)} /> が{' '}
                {activity.eventType}{' '}
                <StatusBadge status={activity.source}>
                  {activity.source === 'web' ? 'Web' : 'MCP'}
                </StatusBadge>
              </span>
              <time className="text-muted">{date(activity.occurredAt)}</time>
            </li>
          ))}
        </ol>
      </Card>
      <Dialog onClose={() => setEdit(false)} open={edit} title="Documentを編集">
        <Form
          cancel={() => setEdit(false)}
          initial={item}
          label="変更を保存"
          pending={update.isPending}
          submit={(input) =>
            update.mutate(
              input as { title: string; content: string; tags: string[]; version: number },
              { onSuccess: () => setEdit(false) },
            )
          }
          suggestions={tags.data ?? []}
        />
        {update.isError && (
          <p className="mt-4 text-sm text-danger">
            {update.error instanceof ApiError && update.error.type === 'conflict'
              ? `${update.error.message} 画面を再読み込みしてからやり直してください。`
              : message(update.error)}
          </p>
        )}
      </Dialog>
      <Dialog onClose={() => setConfirm(false)} open={confirm} title="Documentをアーカイブ">
        <p>アーカイブ後は読み取り専用です。</p>
        <div className="mt-5 flex gap-3">
          <Button
            disabled={archive.isPending}
            onClick={() => archive.mutate(undefined, { onSuccess: () => setConfirm(false) })}
            variant="danger"
          >
            アーカイブする
          </Button>
          <Button onClick={() => setConfirm(false)}>キャンセル</Button>
        </div>
        {archive.isError && <p className="mt-4 text-sm text-danger">{message(archive.error)}</p>}
      </Dialog>
    </>
  )
}
