import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import {
  blockTaskInput,
  cancelTaskInput,
  createTaskInput,
  requestTaskReviewInput,
  taskPriorities,
  taskStatuses,
  updateTaskInput,
} from '../../server/modules/task/inputs.js'
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
import { activityLabels } from '../lib/activityLabels.js'
import { ApiError } from '../lib/api.js'
import {
  useActors,
  useAddTaskComment,
  useApproveTask,
  useBlockTask,
  useCancelTask,
  useCreateTask,
  useRequestTaskReview,
  useReturnTaskToTodo,
  useStartTask,
  useTask,
  useTaskActivities,
  useTaskDocuments,
  useTaskProjects,
  useTasks,
  useUpdateTask,
} from './hooks.js'
import type { Actor, ProjectList, Task, TaskListItem, TaskPriority, TaskStatus } from './types.js'

const message = (error: unknown) => (error instanceof Error ? error.message : '通信に失敗しました')
const activeStatuses = ['todo', 'in_progress', 'blocked', 'review'] as TaskStatus[]
const allStatuses = [...taskStatuses] as TaskStatus[]
const parentStatuses = ['todo', 'in_progress', 'blocked'] as TaskStatus[]
const statusLabels: Record<TaskStatus, string> = {
  todo: 'Todo',
  in_progress: '進行中',
  blocked: 'Blocked',
  review: 'Review',
  done: 'Done',
  cancelled: 'Cancelled',
}
const priorityLabels: Record<TaskPriority, string> = { high: '高', normal: '通常', low: '低' }
const actor = (actors: Actor[] | undefined, id: number | null): Actor | null =>
  id === null
    ? null
    : (actors?.find((item) => item.id === id) ?? { id, actorType: 'human', name: `Actor #${id}` })
const date = (value: string) =>
  new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Tokyo',
  }).format(new Date(value))

function relativeTime(value: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000))
  if (seconds < 60) return 'たった今'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分前`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}時間前`
  return `${Math.floor(seconds / 86400)}日前`
}

function TaskRow({
  item,
  actors,
  projects,
}: {
  item: TaskListItem
  actors: Actor[] | undefined
  projects: ProjectList['items'] | undefined
}) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const unfinished = !['done', 'cancelled'].includes(item.status)
  return (
    <Card className="p-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] md:items-center">
        <div>
          <Link className="font-semibold hover:underline" to={`/tasks/${item.id}`}>
            {item.title}
          </Link>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusBadge status={item.status}>{statusLabels[item.status]}</StatusBadge>
            {item.allChildrenFinished && activeStatuses.includes(item.status) && (
              <StatusBadge status="children-finished">✓ 子Task完了</StatusBadge>
            )}
            {item.status === 'todo' && item.returnedFrom === 'blocked' && (
              <StatusBadge status="returned">回答済み</StatusBadge>
            )}
            {item.status === 'todo' && item.returnedFrom === 'review' && (
              <StatusBadge status="returned">差し戻し済み</StatusBadge>
            )}
          </div>
        </div>
        <div className="text-sm md:text-right">
          <span className="text-muted md:hidden">優先度: </span>
          <StatusBadge status={item.priority}>{priorityLabels[item.priority]}</StatusBadge>
        </div>
        <div className="text-sm md:text-right">
          {actor(actors, item.assigneeId) ? (
            <ActorDisplay actor={actor(actors, item.assigneeId)!} />
          ) : (
            <span className="text-muted">未割り当て</span>
          )}
        </div>
        <div className="text-sm text-muted md:text-right">
          {item.projectId === null
            ? 'Projectなし'
            : (projects?.find((project) => project.id === item.projectId)?.name ??
              `Project #${item.projectId}`)}
        </div>
        <div className="text-sm text-muted md:text-right">
          {unfinished ? `最終更新 ${relativeTime(item.updatedAt, now)}` : '—'}
        </div>
      </div>
    </Card>
  )
}

export function TasksPage() {
  const [statuses, setStatuses] = useState<TaskStatus[]>(activeStatuses)
  const [projectId, setProjectId] = useState<number | undefined>()
  const [assigneeId, setAssigneeId] = useState<number | undefined>()
  const tasks = useTasks(statuses, projectId, assigneeId)
  const actors = useActors()
  const projects = useTaskProjects()
  const toggle = (status: TaskStatus) =>
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
        title="Tasks"
        lead="全Projectを横断するTask一覧。Kanbanは使用しません。"
        action={
          <Link to="/tasks/new">
            <Button variant="primary">Taskを作成</Button>
          </Link>
        }
      />
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {allStatuses.map((status) => (
          <FilterChip
            key={status}
            selected={statuses.includes(status)}
            onClick={() => toggle(status)}
          >
            {statusLabels[status]} {tasks.data?.statusCounts[status] ?? 0}
          </FilterChip>
        ))}
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <Select
          label="Project"
          value={projectId ?? ''}
          onChange={(event) =>
            setProjectId(event.target.value ? Number(event.target.value) : undefined)
          }
        >
          <option value="">すべてのProject</option>
          {projects.data?.items.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
        <Select
          label="担当者"
          value={assigneeId ?? ''}
          onChange={(event) =>
            setAssigneeId(event.target.value ? Number(event.target.value) : undefined)
          }
        >
          <option value="">すべての担当者</option>
          {actors.data?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
      </div>
      {tasks.isPending && <p className="text-muted">読み込み中…</p>}
      {tasks.isError && <p className="text-danger">{message(tasks.error)}</p>}
      <div className="grid gap-3">
        {tasks.data?.items.map((item) => (
          <TaskRow actors={actors.data} item={item} key={item.id} projects={projects.data?.items} />
        ))}
        {tasks.data?.items.length === 0 && (
          <Card className="p-6 text-muted">該当する Task はありません。</Card>
        )}
      </div>
    </>
  )
}

function LinksEditor({
  disabled,
  value,
  onChange,
}: {
  disabled: boolean
  value: string[]
  onChange: (next: string[]) => void
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
        label="URL"
        disabled={disabled}
        value={entry}
        onChange={(event) => setEntry(event.target.value)}
        placeholder="GitHub issue / PR 等のURLを記録します。"
      />
      <Button className="justify-self-start" disabled={disabled || !entry.trim()} onClick={add}>
        URLを追加
      </Button>
      <ul className="grid gap-2 text-sm">
        {value.map((link) => (
          <li className="flex items-center justify-between gap-3" key={link}>
            <a className="break-all underline" href={link} rel="noreferrer" target="_blank">
              {link}
            </a>
            <Button
              disabled={disabled}
              onClick={() => onChange(value.filter((item) => item !== link))}
            >
              削除
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function TaskForm({
  initial,
  initialProjectId,
  initialParentId,
  pending,
  submit,
  cancel,
}: {
  initial?: Task
  initialProjectId?: number
  initialParentId?: number
  pending: boolean
  submit: (input: object) => void
  cancel: () => void
}) {
  const projects = useTaskProjects()
  const actors = useActors()
  const documents = useTaskDocuments()
  const candidates = useTasks(parentStatuses)
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [acceptanceCriteria, setAcceptanceCriteria] = useState(initial?.acceptanceCriteria ?? '')
  const [priority, setPriority] = useState<TaskPriority>(initial?.priority ?? 'normal')
  const [projectId, setProjectId] = useState<number | null>(
    initial?.projectId ?? initialProjectId ?? null,
  )
  const [parentId, setParentId] = useState<number | null>(
    initial?.parentId ?? initialParentId ?? null,
  )
  const [assigneeId, setAssigneeId] = useState<number | null>(initial?.assigneeId ?? null)
  const [links, setLinks] = useState(initial?.links ?? [])
  const [documentIds, setDocumentIds] = useState(
    initial?.documents.map((document) => document.id) ?? [],
  )
  const [error, setError] = useState<string | null>(null)
  const parentOptions = useMemo(
    () =>
      candidates.data?.items.filter(
        (task) => task.id !== initial?.id && task.projectId === projectId,
      ) ?? [],
    [candidates.data, initial?.id, projectId],
  )
  const save = (event: React.FormEvent) => {
    event.preventDefault()
    const raw = initial
      ? {
          id: initial.id,
          title,
          description,
          acceptanceCriteria,
          priority,
          links,
          assigneeId,
          parentId,
          projectId,
          documentIds,
          version: initial.version,
        }
      : {
          title,
          description,
          acceptanceCriteria,
          priority,
          links,
          ...(assigneeId === null ? {} : { assigneeId }),
          ...(parentId === null ? {} : { parentId }),
          ...(projectId === null ? {} : { projectId }),
        }
    const parsed = initial ? updateTaskInput.safeParse(raw) : createTaskInput.safeParse(raw)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '入力を確認してください')
      return
    }
    submit(parsed.data)
  }
  const availableDocuments = [
    ...(initial?.documents ?? []),
    ...(documents.data?.items ?? []),
  ].filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index)
  return (
    <form className="grid gap-5" onSubmit={save}>
      <Input
        label="タイトル"
        disabled={pending}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <Textarea
        label="説明"
        disabled={pending}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="何をするか"
        rows={5}
      />
      <Textarea
        label="完了条件"
        disabled={pending}
        value={acceptanceCriteria}
        onChange={(event) => setAcceptanceCriteria(event.target.value)}
        placeholder="何を満たせば完了か"
        rows={5}
      />
      <Select
        label="優先度"
        disabled={pending}
        value={priority}
        onChange={(event) => setPriority(event.target.value as TaskPriority)}
      >
        {taskPriorities.map((item) => (
          <option key={item} value={item}>
            {priorityLabels[item]}
          </option>
        ))}
      </Select>
      <Select
        label="Project（任意）"
        disabled={pending}
        value={projectId ?? ''}
        onChange={(event) => {
          setProjectId(event.target.value ? Number(event.target.value) : null)
          setParentId(null)
        }}
      >
        <option value="">なし</option>
        {projects.data?.items
          .filter((item) => item.status === 'active')
          .map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
      </Select>
      <Select
        label="親Task（任意）"
        disabled={pending}
        value={parentId ?? ''}
        onChange={(event) => setParentId(event.target.value ? Number(event.target.value) : null)}
      >
        <option value="">なし</option>
        {parentOptions.map((item) => (
          <option key={item.id} value={item.id}>
            {item.title}
          </option>
        ))}
      </Select>
      <p className="-mt-3 text-xs text-muted">
        同じProjectの todo／進行中／blocked の Task だけ選択できます。
      </p>
      <Select
        label="担当者（任意）"
        disabled={pending}
        value={assigneeId ?? ''}
        onChange={(event) => setAssigneeId(event.target.value ? Number(event.target.value) : null)}
      >
        <option value="">未割り当て</option>
        {actors.data?.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </Select>
      <LinksEditor disabled={pending} onChange={setLinks} value={links} />
      {initial && (
        <>
          <Select
            label="参照Document（複数選択可）"
            disabled={pending}
            multiple
            size={6}
            value={documentIds.map(String)}
            onChange={(event) =>
              setDocumentIds(
                [...event.target.selectedOptions].map((option) => Number(option.value)),
              )
            }
          >
            {availableDocuments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
                {item.status === 'archived' ? '（アーカイブ済み）' : ''}
              </option>
            ))}
          </Select>
          <p className="-mt-3 text-xs text-muted">
            新規作成後、ここから参照Documentを追加できます。
          </p>
        </>
      )}
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

export function NewTaskPage() {
  const navigate = useNavigate()
  const create = useCreateTask()
  const [search] = useSearchParams()
  const projectId = search.get('projectId')
  const parentId = search.get('parentId')
  return (
    <>
      <PageHeader title="Taskを作成" lead="何をするかと、満たすべき完了条件を分けて記録します。" />
      <Card className="p-5 md:p-7">
        <TaskForm
          initialParentId={parentId ? Number(parentId) : undefined}
          initialProjectId={projectId ? Number(projectId) : undefined}
          pending={create.isPending}
          cancel={() => void navigate('/tasks')}
          submit={(input) =>
            create.mutate(input as Parameters<typeof create.mutate>[0], {
              onSuccess: (task) => void navigate(`/tasks/${task.id}`),
            })
          }
        />
        {create.isError && <p className="mt-4 text-sm text-danger">{message(create.error)}</p>}
      </Card>
    </>
  )
}

function ActionDialog({
  open,
  title,
  label,
  pending,
  error,
  onClose,
  submit,
}: {
  open: boolean
  title: string
  label: string
  pending: boolean
  error: unknown
  onClose: () => void
  submit: (value: string) => void
}) {
  const [value, setValue] = useState('')
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <Textarea
        label={label}
        value={value}
        disabled={pending}
        onChange={(event) => setValue(event.target.value)}
      />
      <div className="mt-5 flex flex-wrap gap-3">
        <Button variant="primary" disabled={pending || !value.trim()} onClick={() => submit(value)}>
          {title}
        </Button>
        <Button disabled={pending} onClick={onClose}>
          キャンセル
        </Button>
      </div>
      {Boolean(error) && <p className="mt-4 text-sm text-danger">{message(error)}</p>}
    </Dialog>
  )
}

export function TaskDetailPage() {
  const id = Number(useParams().id)
  const task = useTask(id)
  const actors = useActors()
  const projects = useTaskProjects()
  const activities = useTaskActivities(id)
  const update = useUpdateTask(id)
  const comment = useAddTaskComment(id)
  const start = useStartTask(id)
  const block = useBlockTask(id)
  const review = useRequestTaskReview(id)
  const returnToTodo = useReturnTaskToTodo(id)
  const approve = useApproveTask(id)
  const cancel = useCancelTask(id)
  const [editing, setEditing] = useState(false)
  const [dialog, setDialog] = useState<'block' | 'review' | 'cancel' | null>(null)
  const [commentBody, setCommentBody] = useState('')
  if (!Number.isInteger(id) || id < 1) return <p className="text-danger">Task の ID が不正です。</p>
  if (task.isPending) return <p className="text-muted">読み込み中…</p>
  if (task.isError || !task.data) return <p className="text-danger">{message(task.error)}</p>
  const item = task.data
  const mutable = item.status !== 'done' && item.status !== 'cancelled'
  const commentDisabled = !commentBody.trim() || comment.isPending || returnToTodo.isPending
  const actionError = block.error ?? review.error ?? cancel.error
  return (
    <>
      <PageHeader
        title={item.title}
        lead={
          <span className="flex gap-2">
            <StatusBadge status={item.status}>{statusLabels[item.status]}</StatusBadge>
            <StatusBadge status={item.priority}>{priorityLabels[item.priority]}</StatusBadge>
          </span>
        }
        action={
          <div className="flex flex-wrap gap-3">
            {mutable && <Button onClick={() => setEditing(true)}>編集</Button>}
            {item.status === 'todo' && (
              <Button
                variant="primary"
                disabled={start.isPending}
                onClick={() => start.mutate(undefined)}
              >
                着手する
              </Button>
            )}
            {item.status === 'in_progress' && (
              <>
                <Button onClick={() => setDialog('block')}>blocked にする</Button>
                <Button variant="primary" onClick={() => setDialog('review')}>
                  review に出す
                </Button>
              </>
            )}
            {item.status === 'review' && (
              <Button
                variant="primary"
                disabled={approve.isPending}
                onClick={() => approve.mutate(undefined)}
              >
                承認して Done にする
              </Button>
            )}
            {mutable && (
              <Button variant="danger" onClick={() => setDialog('cancel')}>
                Taskをcancel
              </Button>
            )}
          </div>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="grid gap-5">
          <Card className="p-5">
            <h2 className="mb-4 font-semibold">Taskの内容</h2>
            <dl className="grid gap-5">
              <div>
                <dt className="text-sm text-muted">説明</dt>
                <dd className="mt-1 whitespace-pre-wrap">{item.description || '未記入です。'}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">完了条件</dt>
                <dd className="mt-1 whitespace-pre-wrap">
                  {item.acceptanceCriteria || '未記入です。'}
                </dd>
              </div>
              {item.blockedReason && (
                <div>
                  <dt className="text-sm text-muted">blockedの理由</dt>
                  <dd className="mt-1 whitespace-pre-wrap">{item.blockedReason}</dd>
                </div>
              )}
              {item.result && (
                <div>
                  <dt className="text-sm text-muted">結果</dt>
                  <dd className="mt-1 whitespace-pre-wrap">{item.result}</dd>
                </div>
              )}
            </dl>
          </Card>
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-semibold">親子Task</h2>
              {mutable && (
                <Link
                  to={`/tasks/new?parentId=${item.id}${item.projectId === null ? '' : `&projectId=${item.projectId}`}`}
                >
                  <Button>子Taskを作成</Button>
                </Link>
              )}
            </div>
            <div className="grid gap-3 text-sm">
              <div>
                <p className="text-muted">親Task</p>
                {item.parent ? (
                  <Link className="underline" to={`/tasks/${item.parent.id}`}>
                    {item.parent.title}
                  </Link>
                ) : (
                  <p>なし</p>
                )}
              </div>
              <div>
                <p className="text-muted">子Task</p>
                {item.children.length ? (
                  <ul className="grid gap-2">
                    {item.children.map((child) => (
                      <li key={child.id}>
                        <Link className="underline" to={`/tasks/${child.id}`}>
                          {child.title}
                        </Link>{' '}
                        <StatusBadge status={child.status}>
                          {statusLabels[child.status]}
                        </StatusBadge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>ありません。</p>
                )}
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">参照DocumentとURL</h2>
            <div className="grid gap-4 text-sm">
              <div>
                <p className="text-muted">参照Document</p>
                {item.documents.length ? (
                  <ul>
                    {item.documents.map((document) => (
                      <li key={document.id}>
                        <Link className="underline" to={`/documents/${document.id}`}>
                          {document.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>ありません。</p>
                )}
              </div>
              <div>
                <p className="text-muted">URL</p>
                {item.links.length ? (
                  <ul>
                    {item.links.map((link) => (
                      <li key={link}>
                        <a
                          className="break-all underline"
                          href={link}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {link}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>ありません。</p>
                )}
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="mb-3 flex justify-between gap-3">
              <h2 className="font-semibold">コメント</h2>
              <span className="text-xs text-muted">コメントは編集・削除できません</span>
            </div>
            {item.status === 'blocked' && (
              <p className="mb-4 text-sm text-muted">
                回答を添えて todo に戻すと、エージェントが通常の着手対象として再開します。
              </p>
            )}
            <div className="grid gap-4">
              {item.comments.map((entry) => (
                <article
                  className="border-b border-line pb-4 text-sm last:border-0 last:pb-0"
                  key={entry.id}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <ActorDisplay actor={actor(actors.data, entry.createdBy)!} />
                    <time className="text-muted">{date(entry.createdAt)}</time>
                  </div>
                  <p className="whitespace-pre-wrap">{entry.body}</p>
                </article>
              ))}
            </div>
            {mutable && (
              <div className="mt-5 grid gap-3 border-t border-line pt-5">
                <Textarea
                  label="コメント"
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value)}
                  placeholder="回答またはコメントを入力"
                  disabled={comment.isPending || returnToTodo.isPending}
                />
                <div className="flex flex-wrap gap-3">
                  <Button
                    disabled={commentDisabled}
                    onClick={() =>
                      comment.mutate({ body: commentBody }, { onSuccess: () => setCommentBody('') })
                    }
                  >
                    コメントのみ投稿
                  </Button>
                  {item.status === 'blocked' && (
                    <Button
                      variant="primary"
                      disabled={commentDisabled}
                      onClick={() =>
                        returnToTodo.mutate(
                          { body: commentBody },
                          { onSuccess: () => setCommentBody('') },
                        )
                      }
                    >
                      回答して todo に戻す
                    </Button>
                  )}
                  {item.status === 'review' && (
                    <Button
                      variant="primary"
                      disabled={commentDisabled}
                      onClick={() =>
                        returnToTodo.mutate(
                          { body: commentBody },
                          { onSuccess: () => setCommentBody('') },
                        )
                      }
                    >
                      差し戻す
                    </Button>
                  )}
                </div>
                {(comment.error || returnToTodo.error) && (
                  <p className="text-sm text-danger">
                    {message(comment.error ?? returnToTodo.error)}
                  </p>
                )}
              </div>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Activity</h2>
            {activities.isPending && <p className="text-muted">読み込み中…</p>}
            {activities.isError && <p className="text-danger">{message(activities.error)}</p>}
            <ol className="divide-y divide-line">
              {activities.data?.items.map((entry) => (
                <li className="grid gap-1 py-3 text-sm" key={entry.id}>
                  <span>
                    <ActorDisplay actor={actor(actors.data, entry.actorId)!} />が{' '}
                    {activityLabels[entry.eventType] ?? entry.eventType}{' '}
                    <StatusBadge status={entry.source}>
                      {entry.source === 'web' ? 'Web' : 'MCP'}
                    </StatusBadge>
                  </span>
                  <time className="text-muted">{date(entry.occurredAt)}</time>
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <Card className="h-fit p-5">
          <dl className="grid gap-4 text-sm">
            <div>
              <dt className="text-muted">Project</dt>
              <dd>
                {item.projectId === null ? (
                  'なし'
                ) : (
                  <Link className="underline" to={`/projects/${item.projectId}/overview`}>
                    {projects.data?.items.find((project) => project.id === item.projectId)?.name ??
                      `Project #${item.projectId}`}
                  </Link>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted">担当者</dt>
              <dd>
                {actor(actors.data, item.assigneeId) ? (
                  <ActorDisplay actor={actor(actors.data, item.assigneeId)!} />
                ) : (
                  '未割り当て'
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted">作成者</dt>
              <dd>
                <ActorDisplay actor={actor(actors.data, item.createdBy)!} />
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
          </dl>
        </Card>
      </div>
      <Dialog open={editing} onClose={() => setEditing(false)} title="Taskを編集">
        <TaskForm
          initial={item}
          pending={update.isPending}
          cancel={() => setEditing(false)}
          submit={(input) =>
            update.mutate(input as Parameters<typeof update.mutate>[0], {
              onSuccess: () => setEditing(false),
            })
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
      <ActionDialog
        open={dialog === 'block'}
        onClose={() => setDialog(null)}
        title="blocked にする"
        label="blockedの理由"
        pending={block.isPending}
        error={actionError}
        submit={(blockedReason) =>
          block.mutate(blockTaskInput.parse({ id, blockedReason }), {
            onSuccess: () => setDialog(null),
          })
        }
      />
      <ActionDialog
        open={dialog === 'review'}
        onClose={() => setDialog(null)}
        title="review に出す"
        label="結果"
        pending={review.isPending}
        error={actionError}
        submit={(result) =>
          review.mutate(requestTaskReviewInput.parse({ id, result }), {
            onSuccess: () => setDialog(null),
          })
        }
      />
      <ActionDialog
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        title="Taskをcancel"
        label="やめる理由"
        pending={cancel.isPending}
        error={actionError}
        submit={(result) =>
          cancel.mutate(cancelTaskInput.parse({ id, result }), { onSuccess: () => setDialog(null) })
        }
      />
    </>
  )
}
