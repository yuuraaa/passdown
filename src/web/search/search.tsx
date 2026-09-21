import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { documentStatuses } from '../../server/modules/document/inputs.js'
import { searchInput } from '../../server/modules/search/inputs.js'
import { taskStatuses } from '../../server/modules/task/inputs.js'
import {
  Button,
  Card,
  FilterChip,
  Input,
  PageHeader,
  Select,
  StatusBadge,
} from '../components/ui.js'
import { useDocumentTags } from '../documents/hooks.js'
import { useActors } from '../tasks/hooks.js'
import { useTaskProjects } from '../tasks/hooks.js'
import { useSearch } from './hooks.js'
import type { DocumentStatus, SearchInput, TaskStatus } from './types.js'

type SearchFormState = {
  query: string
  projectId: string
  tag: string
  actorId: string
  taskStatuses: TaskStatus[]
  documentStatuses: DocumentStatus[]
  createdFrom: string
  createdTo: string
  updatedFrom: string
  updatedTo: string
}

const initialSearchForm: SearchFormState = {
  query: '',
  projectId: '',
  tag: '',
  actorId: '',
  taskStatuses: [...taskStatuses],
  documentStatuses: [...documentStatuses],
  createdFrom: '',
  createdTo: '',
  updatedFrom: '',
  updatedTo: '',
}

const taskStatusLabels: Record<TaskStatus, string> = {
  todo: 'Todo',
  in_progress: '進行中',
  blocked: 'Blocked',
  review: 'Review',
  done: 'Done',
  cancelled: 'Cancelled',
}
const documentStatusLabels: Record<DocumentStatus, string> = {
  active: '進行中',
  archived: 'アーカイブ済み',
}
const fieldLabels: Record<string, string> = {
  title: 'タイトル',
  description: '説明',
  result: '結果',
  blockedReason: 'ブロック理由',
  content: '本文',
}
const message = (error: unknown) => (error instanceof Error ? error.message : '通信に失敗しました')
const date = (value: string) =>
  new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Tokyo',
  }).format(new Date(value))

function toJstIso(value: string): string | undefined {
  if (!value) return undefined
  return `${value.length === 16 ? `${value}:00` : value}+09:00`
}

function parseSearchForm(value: SearchFormState) {
  return searchInput.safeParse({
    query: value.query,
    projectId: value.projectId ? Number(value.projectId) : undefined,
    tag: value.tag || undefined,
    actorId: value.actorId ? Number(value.actorId) : undefined,
    taskStatuses: value.taskStatuses,
    documentStatuses: value.documentStatuses,
    createdFrom: toJstIso(value.createdFrom),
    createdTo: toJstIso(value.createdTo),
    updatedFrom: toJstIso(value.updatedFrom),
    updatedTo: toJstIso(value.updatedTo),
    limit: 200,
  })
}

function toggle<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

function StatusFilters({
  title,
  values,
  statuses,
  labels,
  onChange,
}: {
  title: string
  values: readonly string[]
  statuses: readonly string[]
  labels: Record<string, string>
  onChange: (value: string[]) => void
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm text-muted">{title}</legend>
      <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
        {statuses.map((status) => (
          <FilterChip
            key={status}
            onClick={() => onChange(toggle(values, status))}
            selected={values.includes(status)}
          >
            {labels[status]}
          </FilterChip>
        ))}
      </div>
    </fieldset>
  )
}

function ResultMeta({ fields, updatedAt }: { fields: readonly string[]; updatedAt: string }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
      <span>一致: {fields.map((field) => fieldLabels[field] ?? field).join('・')}</span>
      <time>更新 {date(updatedAt)}</time>
    </div>
  )
}

export function SearchPage() {
  const [form, setForm] = useState<SearchFormState>(initialSearchForm)
  const [input, setInput] = useState<SearchInput | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const projects = useTaskProjects()
  const tags = useDocumentTags()
  const actors = useActors()
  const search = useSearch(input)
  const update = <Key extends keyof SearchFormState>(key: Key, value: SearchFormState[Key]) =>
    setForm((current) => ({ ...current, [key]: value }))

  return (
    <>
      <PageHeader lead="Task（コメントを含む）と Document を全文検索します。" title="検索" />
      <Card className="p-5 md:p-7">
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            const parsed = parseSearchForm(form)
            if (!parsed.success) {
              setFormError(parsed.error.issues[0]?.message ?? '入力を確認してください')
              return
            }
            setFormError(null)
            setInput(parsed.data)
          }}
        >
          <Input
            label="キーワード"
            onChange={(event) => update('query', event.target.value)}
            value={form.query}
          />
          <div className="grid gap-4 md:grid-cols-3">
            <Select
              label="Project"
              onChange={(event) => update('projectId', event.target.value)}
              value={form.projectId}
            >
              <option value="">すべて</option>
              {(projects.data?.items ?? []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
            <Select
              label="タグ"
              onChange={(event) => update('tag', event.target.value)}
              value={form.tag}
            >
              <option value="">すべて</option>
              {(tags.data ?? []).map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </Select>
            <Select
              label="Actor"
              onChange={(event) => update('actorId', event.target.value)}
              value={form.actorId}
            >
              <option value="">すべて</option>
              {(actors.data ?? []).map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.name}
                </option>
              ))}
            </Select>
          </div>
          <StatusFilters
            labels={taskStatusLabels}
            onChange={(value) => update('taskStatuses', value as TaskStatus[])}
            statuses={taskStatuses}
            title="Task の状態"
            values={form.taskStatuses}
          />
          <StatusFilters
            labels={documentStatusLabels}
            onChange={(value) => update('documentStatuses', value as DocumentStatus[])}
            statuses={documentStatuses}
            title="Document の状態"
            values={form.documentStatuses}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <fieldset className="grid gap-3">
              <legend className="text-sm text-muted">作成日時（JST）</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="開始"
                  onChange={(event) => update('createdFrom', event.target.value)}
                  type="datetime-local"
                  value={form.createdFrom}
                />
                <Input
                  label="終了"
                  onChange={(event) => update('createdTo', event.target.value)}
                  type="datetime-local"
                  value={form.createdTo}
                />
              </div>
            </fieldset>
            <fieldset className="grid gap-3">
              <legend className="text-sm text-muted">更新日時（JST）</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="開始"
                  onChange={(event) => update('updatedFrom', event.target.value)}
                  type="datetime-local"
                  value={form.updatedFrom}
                />
                <Input
                  label="終了"
                  onChange={(event) => update('updatedTo', event.target.value)}
                  type="datetime-local"
                  value={form.updatedTo}
                />
              </div>
            </fieldset>
          </div>
          {formError && <p className="text-sm text-danger">{formError}</p>}
          <Button className="justify-self-start" type="submit" variant="primary">
            検索する
          </Button>
        </form>
      </Card>

      {input === null && (
        <Card className="mt-5 p-6 text-muted">
          条件を指定して検索してください。キーワードを空にすると、絞り込みだけで検索できます。
        </Card>
      )}
      {input !== null && search.isPending && <p className="mt-5 text-muted">検索中…</p>}
      {input !== null && search.isError && (
        <p className="mt-5 text-danger">{message(search.error)}</p>
      )}
      {search.data && (
        <div className="mt-5 grid gap-7">
          <ResultSection
            count={search.data.tasks.total}
            label="Task"
            shown={search.data.tasks.items.length}
          >
            {search.data.tasks.items.map((task) => (
              <Card className="p-4" key={task.id}>
                <StatusBadge status={task.status}>
                  Task / {taskStatusLabels[task.status]}
                </StatusBadge>
                <Link
                  className="mt-2 block text-lg font-semibold hover:underline"
                  to={`/tasks/${task.id}`}
                >
                  {task.title}
                </Link>
                <ResultMeta fields={task.matchedFields} updatedAt={task.updatedAt} />
                {task.matchedComments.length > 0 && (
                  <div className="mt-4 grid gap-2 border-t border-line pt-3">
                    {task.matchedComments.map((comment) => (
                      <div className="text-sm" key={comment.id}>
                        <p className="whitespace-pre-wrap">{comment.body}</p>
                        <time className="text-xs text-muted">
                          コメント: {date(comment.createdAt)}
                        </time>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </ResultSection>
          <ResultSection
            count={search.data.documents.total}
            label="Document"
            shown={search.data.documents.items.length}
          >
            {search.data.documents.items.map((document) => (
              <Card className="p-4" key={document.id}>
                <StatusBadge status={document.status}>
                  Document / {documentStatusLabels[document.status]}
                </StatusBadge>
                <Link
                  className="mt-2 block text-lg font-semibold hover:underline"
                  to={`/documents/${document.id}`}
                >
                  {document.title}
                </Link>
                <ResultMeta fields={document.matchedFields} updatedAt={document.updatedAt} />
              </Card>
            ))}
          </ResultSection>
        </div>
      )}
    </>
  )
}

function ResultSection({
  children,
  count,
  label,
  shown,
}: {
  children: ReactNode
  count: number
  label: string
  shown: number
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-bold">{label}</h2>
        <p className="text-sm text-muted">
          {count}件{count > shown && `（先頭${shown}件を表示）`}
        </p>
      </div>
      {shown ? (
        <div className="grid gap-3">{children}</div>
      ) : (
        <Card className="p-5 text-muted">該当する {label} はありません。</Card>
      )}
    </section>
  )
}
