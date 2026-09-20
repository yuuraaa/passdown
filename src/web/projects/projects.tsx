import { useState } from 'react'
import { Link, NavLink, useNavigate, useParams } from 'react-router'
import {
  createProjectInput,
  projectStatuses,
  updateProjectInput,
} from '../../server/modules/project/inputs.js'
import { taskStatuses } from '../../server/modules/task/inputs.js'
import {
  Button,
  Card,
  Dialog,
  FilterChip,
  Input,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
  ActorDisplay,
} from '../components/ui.js'
import { ApiError } from '../lib/api.js'
import { useDocuments } from '../documents/hooks.js'
import {
  useActors,
  useArchiveProject,
  useCompleteProject,
  useCreateProject,
  useProject,
  useProjectActivities,
  useProjects,
  useProjectTasks,
  useUpdateProject,
} from './hooks.js'
import type { Actor, Project, ProjectStatus, TaskStatus } from './types.js'

const message = (error: unknown) => (error instanceof Error ? error.message : '通信に失敗しました')
const allTaskStatuses = [...taskStatuses] as TaskStatus[]
const labels: Record<ProjectStatus, string> = {
  active: '進行中',
  done: '完了',
  archived: 'アーカイブ済み',
}
const actor = (actors: Actor[] | undefined, id: number): Actor =>
  actors?.find((item) => item.id === id) ?? { id, actorType: 'human', name: `Actor #${id}` }
const date = (value: string) =>
  new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Tokyo',
  }).format(new Date(value))

function RepositoriesEditor({
  value,
  onChange,
  disabled,
}: {
  value: string[]
  onChange: (value: string[]) => void
  disabled: boolean
}) {
  const [entry, setEntry] = useState('')
  const add = () => {
    const next = entry.trim()
    if (next && !value.includes(next)) onChange([...value, next])
    setEntry('')
  }
  return (
    <div className="grid gap-2">
      <Input
        disabled={disabled}
        label="関連リポジトリ"
        onChange={(e) => setEntry(e.target.value)}
        placeholder="URLを記録します。同期はしません。"
        value={entry}
      />
      <Button className="justify-self-start" disabled={disabled || !entry.trim()} onClick={add}>
        リポジトリを追加
      </Button>
      <ul className="grid gap-2 text-sm">
        {value.map((repository) => (
          <li className="flex items-center justify-between gap-3" key={repository}>
            <span className="break-all">{repository}</span>
            <Button
              disabled={disabled}
              onClick={() => onChange(value.filter((item) => item !== repository))}
            >
              削除
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ProjectForm({
  initial,
  pending,
  submit,
  cancel,
}: {
  initial?: Project
  pending: boolean
  submit: (input: {
    name: string
    description: string
    instructions: string
    repositories: string[]
    documentIds: number[]
    version?: number
  }) => void
  cancel: () => void
}) {
  const availableDocuments = useDocuments('active')
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [instructions, setInstructions] = useState(initial?.instructions ?? '')
  const [repositories, setRepositories] = useState(initial?.repositories ?? [])
  const [documentIds, setDocumentIds] = useState(
    initial?.documents.map((document) => document.id) ?? [],
  )
  const [error, setError] = useState<string | null>(null)
  const documents = [
    ...(initial?.documents ?? []),
    ...(availableDocuments.data?.items ?? []),
  ].filter((document, index, list) => list.findIndex((item) => item.id === document.id) === index)
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        const raw = initial
          ? {
              id: initial.id,
              name,
              description,
              instructions,
              repositories,
              documentIds,
              version: initial.version,
            }
          : { name, description, instructions, repositories, documentIds }
        const parsed = initial
          ? updateProjectInput.safeParse(raw)
          : createProjectInput.safeParse(raw)
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? '入力を確認してください')
          return
        }
        submit(parsed.data)
      }}
    >
      <Input
        disabled={pending}
        label="Project名"
        onChange={(e) => setName(e.target.value)}
        value={name}
      />
      <Textarea
        disabled={pending}
        label="概要"
        onChange={(e) => setDescription(e.target.value)}
        placeholder="何のProjectか・どうなったら完了か"
        rows={5}
        value={description}
      />
      <Textarea
        disabled={pending}
        label="Instructions"
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="エージェント向けの作業指示"
        rows={6}
        value={instructions}
      />
      <RepositoriesEditor disabled={pending} onChange={setRepositories} value={repositories} />
      <Select
        disabled={pending}
        label="参照Document（複数選択可）"
        multiple
        onChange={(e) =>
          setDocumentIds([...e.target.selectedOptions].map((option) => Number(option.value)))
        }
        size={6}
        value={documentIds.map(String)}
      >
        {documents.map((document) => (
          <option key={document.id} value={document.id}>
            {document.title}
            {document.status === 'archived' ? '（アーカイブ済み）' : ''}
          </option>
        ))}
      </Select>
      {availableDocuments.isError && (
        <p className="text-sm text-danger">
          Document 候補を取得できません: {message(availableDocuments.error)}
        </p>
      )}
      <p className="text-xs text-muted">
        active な Document を参照に追加できます。アーカイブ済みの参照は解除のみ可能です。
      </p>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <Button disabled={pending} type="submit" variant="primary">
          {pending ? '保存中…' : initial ? '変更を保存' : '作成する'}
        </Button>
        <Button disabled={pending} onClick={cancel}>
          キャンセル
        </Button>
      </div>
    </form>
  )
}

export function ProjectsPage() {
  const [statuses, setStatuses] = useState<ProjectStatus[]>(['active'])
  const projects = useProjects(statuses)
  const allProjects = useProjects([...projectStatuses])
  const counts = Object.fromEntries(
    projectStatuses.map((status) => [
      status,
      allProjects.data?.items.filter((item) => item.status === status).length ?? 0,
    ]),
  ) as Record<ProjectStatus, number>
  const toggle = (status: ProjectStatus) =>
    setStatuses((current) =>
      current.includes(status) && current.length > 1
        ? current.filter((item) => item !== status)
        : current.includes(status)
          ? current
          : [...current, status],
    )
  return (
    <>
      <PageHeader
        action={
          <Link to="/projects/new">
            <Button variant="primary">Projectを作成</Button>
          </Link>
        }
        lead="TaskとDocumentを同じ文脈で扱う単位です。"
        title="Projects"
      />
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {projectStatuses.map((status) => (
          <FilterChip
            key={status}
            onClick={() => toggle(status)}
            selected={statuses.includes(status)}
          >
            {labels[status]} {counts[status]}
          </FilterChip>
        ))}
      </div>
      {projects.isPending && <p className="text-muted">読み込み中…</p>}
      {projects.isError && <p className="text-danger">{message(projects.error)}</p>}
      <div className="grid gap-3">
        {projects.data?.items.map((item) => (
          <Card className="p-4" key={item.id}>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div>
                <Link
                  className="font-semibold hover:underline"
                  to={`/projects/${item.id}/overview`}
                >
                  {item.name}
                </Link>
                {item.description && <p className="mt-1 text-sm text-muted">{item.description}</p>}
              </div>
              <StatusBadge status={item.status}>{labels[item.status]}</StatusBadge>
            </div>
          </Card>
        ))}
        {projects.data?.items.length === 0 && (
          <Card className="p-6 text-muted">この状態の Project はありません。</Card>
        )}
      </div>
    </>
  )
}

export function NewProjectPage() {
  const navigate = useNavigate()
  const create = useCreateProject()
  return (
    <>
      <PageHeader
        lead="概要、instructions、関連リポジトリ、参照Documentを設定します。"
        title="Projectを作成"
      />
      <Card className="p-5 md:p-7">
        <ProjectForm
          cancel={() => void navigate('/projects')}
          pending={create.isPending}
          submit={(input) =>
            create.mutate(input, {
              onSuccess: (project) => void navigate(`/projects/${project.id}/overview`),
            })
          }
        />
        {create.isError && <p className="mt-4 text-sm text-danger">{message(create.error)}</p>}
      </Card>
    </>
  )
}

const tabs = ['overview', 'tasks', 'documents', 'activity'] as const
type Tab = (typeof tabs)[number]
function ProjectTabs({ id }: { id: number }) {
  return (
    <nav className="mb-5 flex overflow-x-auto border-b border-line" aria-label="Project詳細タブ">
      {tabs.map((tab) => (
        <NavLink
          className={({ isActive }) =>
            `min-h-11 shrink-0 border-b-2 px-3.5 py-2 ${isActive ? 'border-ink font-semibold text-ink' : 'border-transparent text-muted'}`
          }
          key={tab}
          to={`/projects/${id}/${tab}`}
        >
          {tab.charAt(0).toUpperCase() + tab.slice(1)}
        </NavLink>
      ))}
    </nav>
  )
}

export function ProjectDetailPage() {
  const id = Number(useParams().id)
  const rawTab = useParams().tab
  const tab: Tab = tabs.includes(rawTab as Tab) ? (rawTab as Tab) : 'overview'
  const project = useProject(id)
  const [edit, setEdit] = useState(false)
  const [statusDialog, setStatusDialog] = useState(false)
  const update = useUpdateProject(id)
  const complete = useCompleteProject(id)
  const archive = useArchiveProject(id)
  const tasks = useProjectTasks(id, allTaskStatuses)
  if (!Number.isInteger(id) || id < 1)
    return <p className="text-danger">Project の ID が不正です。</p>
  if (project.isPending) return <p className="text-muted">読み込み中…</p>
  if (project.isError || !project.data)
    return <p className="text-danger">{message(project.error)}</p>
  const item = project.data
  const active = item.status === 'active'
  const hasUnfinishedTasks = tasks.data?.items.some(
    (task) => task.status !== 'done' && task.status !== 'cancelled',
  )
  return (
    <>
      <PageHeader
        action={
          <div className="flex flex-wrap gap-3">
            {active && (
              <>
                <Button onClick={() => setStatusDialog(true)}>完了／アーカイブ</Button>
                <Link to={`/tasks/new?projectId=${item.id}`}>
                  <Button variant="primary">Taskを作成</Button>
                </Link>
              </>
            )}
          </div>
        }
        lead={item.description || undefined}
        title={item.name}
      />
      <ProjectTabs id={item.id} />
      {tab === 'overview' && <Overview edit={() => setEdit(true)} project={item} />}
      {tab === 'tasks' && <TasksTab id={item.id} />}
      {tab === 'documents' && <DocumentsTab edit={() => setEdit(true)} project={item} />}
      {tab === 'activity' && <ActivityTab id={item.id} />}
      <Dialog onClose={() => setEdit(false)} open={edit} title="Projectを編集">
        <ProjectForm
          cancel={() => setEdit(false)}
          initial={item}
          pending={update.isPending}
          submit={(input) =>
            update.mutate(
              input as {
                name: string
                description: string
                instructions: string
                repositories: string[]
                documentIds: number[]
                version: number
              },
              { onSuccess: () => setEdit(false) },
            )
          }
        />
        {update.isError && (
          <p className="mt-4 text-sm text-danger">
            {update.error instanceof ApiError && update.error.type === 'conflict'
              ? `${update.error.message} 画面を再読み込みしてからやり直してください。`
              : message(update.error)}
          </p>
        )}
      </Dialog>
      <Dialog onClose={() => setStatusDialog(false)} open={statusDialog} title="Projectの状態変更">
        <p className="text-sm text-muted">
          完了は未完了Taskがない場合だけ可能です。アーカイブすると未完了Taskは cancelled
          になります。
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            disabled={complete.isPending || archive.isPending || hasUnfinishedTasks}
            onClick={() => complete.mutate(undefined, { onSuccess: () => setStatusDialog(false) })}
          >
            完了にする
          </Button>
          <Button
            disabled={complete.isPending || archive.isPending}
            onClick={() => archive.mutate(undefined, { onSuccess: () => setStatusDialog(false) })}
            variant="danger"
          >
            アーカイブする
          </Button>
          <Button onClick={() => setStatusDialog(false)}>キャンセル</Button>
        </div>
        {(complete.isError || archive.isError) && (
          <p className="mt-4 text-sm text-danger">{message(complete.error ?? archive.error)}</p>
        )}
        {hasUnfinishedTasks && (
          <p className="mt-3 text-sm text-muted">未完了Taskがあるため完了にできません。</p>
        )}
      </Dialog>
    </>
  )
}

function Overview({ project, edit }: { project: Project; edit: () => void }) {
  const active = project.status === 'active'
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="grid gap-5">
        <Card className="p-5">
          <div className="mb-3 flex justify-between gap-3">
            <h2 className="font-semibold">概要</h2>
            {active && <Button onClick={edit}>編集</Button>}
          </div>
          <p className="whitespace-pre-wrap">{project.description || '未記入です。'}</p>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Instructions</h2>
          <p className="whitespace-pre-wrap font-mono text-sm">
            {project.instructions || '未記入です。'}
          </p>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">関連リポジトリ</h2>
          {project.repositories.length ? (
            <ul className="grid gap-2">
              {project.repositories.map((repository) => (
                <li key={repository}>
                  <a
                    className="break-all underline"
                    href={repository}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {repository}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">ありません。</p>
          )}
        </Card>
      </div>
      <Card className="h-fit p-5">
        <dl className="grid gap-4 text-sm">
          <div>
            <dt className="text-muted">状態</dt>
            <dd>
              <StatusBadge status={project.status}>{labels[project.status]}</StatusBadge>
            </dd>
          </div>
          <div>
            <dt className="text-muted">参照Document</dt>
            <dd>
              <Link className="underline" to={`/projects/${project.id}/documents`}>
                {project.documents.length}件を表示
              </Link>
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  )
}
function TasksTab({ id }: { id: number }) {
  const tasks = useProjectTasks(id, allTaskStatuses)
  return (
    <>
      {tasks.isPending && <p className="text-muted">読み込み中…</p>}
      {tasks.isError && <p className="text-danger">{message(tasks.error)}</p>}
      <div className="grid gap-3">
        {tasks.data?.items.map((task) => (
          <Card className="p-4" key={task.id}>
            <Link className="font-semibold hover:underline" to={`/tasks/${task.id}`}>
              {task.title}
            </Link>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge status={task.status} />
              <StatusBadge status={task.priority}>{task.priority}</StatusBadge>
            </div>
          </Card>
        ))}
        {tasks.data?.items.length === 0 && (
          <Card className="p-6 text-muted">この Project の Task はありません。</Card>
        )}
      </div>
    </>
  )
}
function DocumentsTab({ project, edit }: { project: Project; edit: () => void }) {
  return (
    <>
      <div className="mb-4 flex justify-between gap-3">
        <p className="text-muted">この Project の作業文脈として参照する Document です。</p>
        {project.status === 'active' && <Button onClick={edit}>参照を編集</Button>}
      </div>
      <div className="grid gap-3">
        {project.documents.map((document) => (
          <Card className="p-4" key={document.id}>
            <Link className="font-semibold hover:underline" to={`/documents/${document.id}`}>
              {document.title}
            </Link>
            <div className="mt-2 flex flex-wrap gap-1">
              {document.tags.map((tag) => (
                <StatusBadge key={tag} status={tag}>
                  {tag}
                </StatusBadge>
              ))}
            </div>
          </Card>
        ))}
        {project.documents.length === 0 && (
          <Card className="p-6 text-muted">参照する Document はありません。</Card>
        )}
      </div>
    </>
  )
}
function ActivityTab({ id }: { id: number }) {
  const activities = useProjectActivities(id)
  const actors = useActors()
  return (
    <Card className="p-5">
      <h2 className="mb-3 font-semibold">Activity</h2>
      {activities.isPending && <p className="text-muted">読み込み中…</p>}
      {activities.isError && <p className="text-danger">{message(activities.error)}</p>}
      <ol className="divide-y divide-line">
        {activities.data?.items.map((activity) => (
          <li className="grid gap-1 py-3 text-sm" key={activity.id}>
            <span>
              <ActorDisplay actor={actor(actors.data, activity.actorId)} /> が {activity.eventType}{' '}
              <StatusBadge status={activity.source}>
                {activity.source === 'web' ? 'Web' : 'MCP'}
              </StatusBadge>
            </span>
            <time className="text-muted">{date(activity.occurredAt)}</time>
          </li>
        ))}
      </ol>
      {activities.data?.items.length === 0 && <p className="text-muted">Activity はありません。</p>}
    </Card>
  )
}
