import { NotAllowedError } from '../../core/errors.js'
import type { ProjectStatus } from '../project/index.js'
import type { TaskStatus } from './inputs.js'

type TaskRef = { id: number; status: TaskStatus }

const FINISHED: readonly TaskStatus[] = ['done', 'cancelled']
const ACCEPTS_CHILDREN: readonly TaskStatus[] = ['todo', 'in_progress', 'blocked']

/**
 * 新しい Task の所属 Project を決める（要件定義書 6.3）。
 * 子 Task は親と同じ Project に属する。指定がなければ親の Project に従う。
 */
export function resolveProjectOfNewTask(
  parent: { id: number; projectId: number | null } | null,
  projectId: number | undefined,
): number | null {
  if (!parent) {
    return projectId ?? null
  }
  if (projectId !== undefined && projectId !== parent.projectId) {
    const parentProject =
      parent.projectId === null ? 'Project に属さない' : `project:${parent.projectId}`
    throw new NotAllowedError(
      `子 Task は親 Task（task:${parent.id}、${parentProject}）と同じ Project に属します。projectId を省略するか、親と同じ Project を指定してください`,
    )
  }
  return parent.projectId
}

/** 子 Task を追加できるのは、親が todo / in_progress / blocked のときだけ（要件定義書 6.3） */
export function checkCanAddChild(parent: TaskRef): void {
  if (!ACCEPTS_CHILDREN.includes(parent.status)) {
    throw new NotAllowedError(
      `task:${parent.id} は ${parent.status} のため、子 Task を追加できません。子 Task を追加できるのは todo / in_progress / blocked の Task だけです`,
    )
  }
}

/** done / archived の Project には Task を作成できない（要件定義書 6.2） */
export function checkProjectAcceptsTasks(projectId: number, status: ProjectStatus): void {
  if (status !== 'active') {
    throw new NotAllowedError(
      `project:${projectId} は ${status} のため、Task を作成できません。作業が必要なら新しい Project を作ってください`,
    )
  }
}

/**
 * Task を in_progress にできるか判定し、連動して in_progress にする祖先を返す（要件定義書 6.3）。
 * 祖先は近い順に渡す。親が todo なら親を in_progress にし、その親についても同じように上へたどる。
 * todo でない祖先に当たったら、そこで止める（その祖先は状態が変わらないため、さらに上へは連動しない）。
 */
export function planStart<T extends TaskRef>(task: TaskRef, ancestors: readonly T[]): T[] {
  if (task.status !== 'todo') {
    const hint = FINISHED.includes(task.status)
      ? `${task.status} の Task は変更できません。`
      : task.status === 'blocked'
        ? '回答後に todo へ戻してから着手してください。'
        : ''
    throw new NotAllowedError(
      `task:${task.id} は ${task.status} のため着手できません。着手できるのは todo の Task だけです。${hint}`,
    )
  }
  const autoStart: T[] = []
  for (const ancestor of ancestors) {
    if (ancestor.status !== 'todo') {
      break
    }
    autoStart.push(ancestor)
  }
  return autoStart
}
