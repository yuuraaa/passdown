import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  createAgentActorInput,
  updateAgentPermissionsInput,
} from '../../server/modules/auth/inputs.js'
import {
  ActivityTimeline,
  ActorDisplay,
  Button,
  Card,
  Dialog,
  Input,
  PageHeader,
  Select,
} from '../components/ui.js'
import {
  useActivities,
  useAgent,
  useActors,
  useCreateAgent,
  useIssueToken,
  useLatestActivities,
  useRevokeToken,
  useTokens,
  useTokensForAgents,
  useUpdatePermissions,
} from './hooks.js'
import type { Actor, Agent, Permission, Token } from './types.js'
import { activityLabels } from '../lib/activityLabels.js'

const resources = [
  ['project', 'Project'],
  ['task', 'Task（コメントを含む）'],
  ['document', 'Document'],
  ['inbox', 'Inbox'],
] as const

const permissionLabels: Record<Permission, string> = {
  none: 'なし',
  read: 'read',
  readwrite: 'readwrite',
}

const message = (error: unknown) => (error instanceof Error ? error.message : '通信に失敗しました')
const date = (value: string) =>
  new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Tokyo',
  }).format(new Date(value))

function Permissions({
  permissions,
  disabled = false,
  onChange,
}: {
  permissions: Agent['permissions']
  disabled?: boolean
  onChange?: (value: Agent['permissions']) => void
}) {
  return (
    <div className="grid gap-4">
      {resources.map(([key, label]) => (
        <Select
          disabled={disabled}
          key={key}
          label={label}
          onChange={(event) =>
            onChange?.({ ...permissions, [key]: event.target.value as Permission })
          }
          value={permissions[key]}
        >
          <option value="none">なし</option>
          <option value="read">read</option>
          <option value="readwrite">readwrite</option>
        </Select>
      ))}
    </div>
  )
}

function PermissionText({ permissions }: { permissions: Agent['permissions'] }) {
  return (
    <div className='flex flex-wrap'>
      {resources
        .map(([key, label], index) => (
          <span key={key}>{`${label.replace('（コメントを含む）', '')}: ${permissions[key]} ${resources.length - 1 === index ? "" : " / "}`}</span>
        ))}
    </div>
  )
}

function ActivityList({
  activities,
  actors,
}: {
  activities: ReturnType<typeof useActivities>['data']
  actors: Actor[] | undefined
}) {
  if (!activities?.items.length)
    return <p className="text-sm text-muted">Activity はまだありません。</p>
  return (
    <ActivityTimeline>
      {activities.items.map((item) => {
        const actor = actors?.find((candidate) => candidate.id === item.actorId) ?? {
          id: item.actorId,
          actorType: 'human' as const,
          name: `Actor #${item.actorId}`,
        }
        return (
          <li className="grid gap-1 py-4" key={item.id}>
            <p className="text-sm">
              <ActorDisplay actor={actor} /> が{activityLabels[item.eventType] ?? item.eventType}{' '}
              <span className="ml-1 rounded-full border border-line px-2 py-0.5 text-xs text-muted">
                {item.source === 'web' ? 'Web' : 'MCP'}
              </span>
            </p>
            <time className="text-xs text-muted">{date(item.occurredAt)}</time>
          </li>
        )
      })}
    </ActivityTimeline>
  )
}

export function AgentsPage() {
  const actors = useActors()
  const agents = (actors.data ?? []).filter((actor) => actor.actorType === 'agent')
  const latest = useLatestActivities(agents)
  const tokens = useTokensForAgents(agents)
  return (
    <>
      <PageHeader
        action={
          <Link to="/settings/agents/new">
            <Button variant="primary">agent Actorを作成</Button>
          </Link>
        }
        lead="agent Actorの権限とトークンを、オーナーが管理します。"
        title="Settings / Agents"
      />
      {actors.isPending && <p className="text-muted">読み込み中…</p>}
      {actors.isError && <p className="text-danger">{message(actors.error)}</p>}
      {actors.data &&
        (agents.length ? (
          <div className="grid gap-3">
            {agents.map((agent, index) => {
              const activeTokens = (tokens[index]?.data ?? []).filter(
                (token) => token.revokedAt === null,
              ).length
              const item = latest[index]?.data?.items[0]
              return (
                <Card className="p-4" key={agent.id}>
                  <div className="grid gap-3 lg:grid-cols-[minmax(12rem,1fr)_minmax(10rem,2fr)_7rem_10rem] md:items-center">
                    <Link
                      className="font-semibold hover:underline"
                      to={`/settings/agents/${agent.id}`}
                    >
                      <ActorDisplay actor={agent} />
                    </Link>
                    <p className="text-sm text-muted">
                      <PermissionSummary agentId={agent.id} />
                    </p>
                    <p className="text-sm text-muted">有効なトークン {activeTokens}</p>
                    <time className="text-sm text-muted">
                      {item ? date(item.occurredAt) : 'Activityなし'}
                    </time>
                  </div>
                </Card>
              )
            })}
          </div>
        ) : (
          <Card className="p-6 text-muted">agent Actor はまだありません。</Card>
        ))}
    </>
  )
}

function PermissionSummary({ agentId }: { agentId: number }) {
  const agent = useAgent(agentId)
  return agent.data ? (
    <PermissionText permissions={agent.data.permissions} />
  ) : (
    <>権限を読み込み中…</>
  )
}

export function NewAgentPage() {
  const navigate = useNavigate()
  const create = useCreateAgent()
  const [name, setName] = useState('')
  const [permissions, setPermissions] = useState<Agent['permissions']>({
    project: 'none',
    task: 'none',
    document: 'none',
    inbox: 'none',
  })
  const [error, setError] = useState<string | null>(null)
  const submit = () => {
    const parsed = createAgentActorInput.safeParse({ name, permissions })
    if (!parsed.success)
      return setError(parsed.error.issues[0]?.message ?? '入力を確認してください')
    setError(null)
    create.mutate(parsed.data, {
      onSuccess: (agent) => void navigate(`/settings/agents/${agent.id}`),
    })
  }
  return (
    <>
      <PageHeader
        lead="最初の権限を設定し、その後トークンを発行します。"
        title="agent Actorを作成"
      />
      <Card className="max-w-3xl p-5 md:p-7">
        <div className="grid gap-5">
          <Input
            disabled={create.isPending}
            label="Actor名"
            onChange={(event) => setName(event.target.value)}
            placeholder="例: Codex"
            value={name}
          />
          <fieldset>
            <legend className="mb-3 font-semibold">権限</legend>
            <Permissions
              disabled={create.isPending}
              onChange={setPermissions}
              permissions={permissions}
            />
          </fieldset>
          <p className="text-sm text-muted">
            権限はActorに付与し、同じActorのすべてのトークンに反映します。
          </p>
          {(error || create.isError) && (
            <p className="text-sm text-danger">{error ?? message(create.error)}</p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button disabled={create.isPending} onClick={submit} variant="primary">
              {create.isPending ? '作成中…' : '作成してトークン発行へ'}
            </Button>
            <Button disabled={create.isPending} onClick={() => void navigate('/settings/agents')}>
              キャンセル
            </Button>
          </div>
        </div>
      </Card>
    </>
  )
}

export function AgentDetailPage() {
  const id = Number(useParams().id)
  const actorList = useActors()
  const agent = useAgent(id)
  const tokens = useTokens(id)
  const activities = useActivities(id)
  const update = useUpdatePermissions(id)
  const issue = useIssueToken(id)
  const revoke = useRevokeToken(id)
  const [permissionOpen, setPermissionOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<Token | null>(null)
  const [issuedToken, setIssuedToken] = useState<string | null>(null)
  const [draft, setDraft] = useState<Agent['permissions'] | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!Number.isInteger(id) || id < 1)
    return <p className="text-danger">agent Actor の ID が不正です。</p>
  if (agent.isPending) return <p className="text-muted">読み込み中…</p>
  if (agent.isError || !agent.data) return <p className="text-danger">{message(agent.error)}</p>
  const item = agent.data
  const savePermissions = () => {
    if (!draft) return
    const parsed = updateAgentPermissionsInput.safeParse({ id, permissions: draft })
    if (!parsed.success)
      return setError(parsed.error.issues[0]?.message ?? '入力を確認してください')
    setError(null)
    update.mutate(parsed.data.permissions, { onSuccess: () => setPermissionOpen(false) })
  }
  return (
    <>
      <PageHeader
        action={
          <Button
            disabled={issue.isPending}
            onClick={() =>
              issue.mutate(undefined, { onSuccess: (token) => setIssuedToken(token.token) })
            }
            variant="primary"
          >
            {issue.isPending ? '発行中…' : 'トークンを発行'}
          </Button>
        }
        lead="agent Actorの権限・トークン・Activityを確認します。"
        title={item.name}
      />
      {issue.isError && <p className="mb-4 text-sm text-danger">{message(issue.error)}</p>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="grid gap-5">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-semibold">権限</h2>
              <Button
                onClick={() => {
                  setDraft(item.permissions)
                  setError(null)
                  setPermissionOpen(true)
                }}
              >
                変更
              </Button>
            </div>
            <dl className="grid gap-3">
              {resources.map(([key, label]) => (
                <div className="flex justify-between gap-4 border-t border-line pt-3" key={key}>
                  <dt>{label}</dt>
                  <dd className="text-muted">{permissionLabels[item.permissions[key]]}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-semibold">トークン</h2>
              <span className="text-xs text-muted">値は発行時に一度だけ表示</span>
            </div>
            {tokens.isPending && <p className="text-sm text-muted">読み込み中…</p>}
            {tokens.data &&
              (tokens.data.length ? (
                <div className="grid gap-3">
                  {tokens.data.map((token) => (
                    <div
                      className="grid gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center"
                      key={token.id}
                    >
                      <time className="text-sm">発行 {date(token.issuedAt)}</time>
                      <span className="text-sm text-muted">
                        {token.revokedAt ? `失効 ${date(token.revokedAt)}` : '有効'}
                      </span>
                      {token.revokedAt ? (
                        <span className="text-sm text-muted">失効済み</span>
                      ) : (
                        <Button
                          className="justify-self-start"
                          onClick={() => setRevokeTarget(token)}
                          variant="danger"
                        >
                          失効
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">トークンはまだありません。</p>
              ))}
          </Card>
          <Card className="p-5">
            <h2 className="mb-2 font-semibold">Activity</h2>
            <ActivityList activities={activities.data} actors={actorList.data} />
          </Card>
        </div>
        <aside>
          <Card className="p-5">
            <dl className="grid gap-3">
              <div>
                <dt className="text-sm text-muted">Actor種別</dt>
                <dd className="mt-1">
                  <ActorDisplay actor={item} />
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted">補足</dt>
                <dd className="mt-1 text-sm">
                  agentの無効化は持たず、使わなくなったトークンを失効します。
                </dd>
              </div>
            </dl>
          </Card>
        </aside>
      </div>
      <Dialog onClose={() => setPermissionOpen(false)} open={permissionOpen} title="権限を変更">
        <div className="grid gap-5">
          {draft && (
            <Permissions disabled={update.isPending} onChange={setDraft} permissions={draft} />
          )}
          {(error || update.isError) && (
            <p className="text-sm text-danger">{error ?? message(update.error)}</p>
          )}
          <div className="flex gap-3">
            <Button disabled={update.isPending} onClick={() => setPermissionOpen(false)}>
              キャンセル
            </Button>
            <Button disabled={update.isPending} onClick={savePermissions} variant="primary">
              {update.isPending ? '保存中…' : '変更を保存'}
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog
        onClose={() => setRevokeTarget(null)}
        open={revokeTarget !== null}
        title="トークンを失効"
      >
        <div className="grid gap-5">
          <p>失効したトークンは再び使えません。入れ替えの場合は先に新しいトークンを発行します。</p>
          {revoke.isError && <p className="text-sm text-danger">{message(revoke.error)}</p>}
          <div className="flex gap-3">
            <Button disabled={revoke.isPending} onClick={() => setRevokeTarget(null)}>
              キャンセル
            </Button>
            <Button
              disabled={revoke.isPending}
              onClick={() =>
                revokeTarget &&
                revoke.mutate(revokeTarget.id, { onSuccess: () => setRevokeTarget(null) })
              }
              variant="danger"
            >
              {revoke.isPending ? '失効中…' : '失効する'}
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog
        onClose={() => setIssuedToken(null)}
        open={issuedToken !== null}
        title="トークンを発行しました"
      >
        <div className="grid gap-5">
          <p className="text-sm text-muted">
            この値は今だけ表示されます。安全な場所に保存してから閉じてください。
          </p>
          <code className="overflow-x-auto rounded-ui border border-line bg-canvas p-3 text-sm break-all">
            {issuedToken}
          </code>
          <Button onClick={() => setIssuedToken(null)} variant="primary">
            安全な場所に保存したので閉じる
          </Button>
        </div>
      </Dialog>
    </>
  )
}
