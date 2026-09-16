import { describe, expect, it } from 'vitest'
import { NotAllowedError } from '../../core/errors.js'
import { type TaskStatus, taskStatuses } from './inputs.js'
import {
  checkCanAddChild,
  checkProjectAcceptsTasks,
  planStart,
  resolveProjectOfNewTask,
} from './rules.js'

const task = (id: number, status: TaskStatus) => ({ id, status })

describe('resolveProjectOfNewTask', () => {
  it('親がなければ指定した Project（省略なら Project に属さない）', () => {
    expect(resolveProjectOfNewTask(null, 3)).toBe(3)
    expect(resolveProjectOfNewTask(null, undefined)).toBeNull()
  })

  it('親があり省略したら親の Project に従う', () => {
    expect(resolveProjectOfNewTask({ id: 1, projectId: 3 }, undefined)).toBe(3)
    expect(resolveProjectOfNewTask({ id: 1, projectId: null }, undefined)).toBeNull()
  })

  it('親と同じ Project なら指定してよい', () => {
    expect(resolveProjectOfNewTask({ id: 1, projectId: 3 }, 3)).toBe(3)
  })

  it('親と違う Project は指定できない', () => {
    expect(() => resolveProjectOfNewTask({ id: 1, projectId: 3 }, 4)).toThrow(NotAllowedError)
    expect(() => resolveProjectOfNewTask({ id: 1, projectId: null }, 4)).toThrow(NotAllowedError)
  })
})

describe('checkCanAddChild', () => {
  it.each(taskStatuses.map((s) => [s, ['todo', 'in_progress', 'blocked'].includes(s)] as const))(
    '親が %s なら追加できる: %s',
    (status, allowed) => {
      const check = () => checkCanAddChild(task(1, status))
      if (allowed) {
        expect(check).not.toThrow()
      } else {
        expect(check).toThrow(NotAllowedError)
      }
    },
  )
})

describe('checkProjectAcceptsTasks', () => {
  it('active の Project にだけ作成できる', () => {
    expect(() => checkProjectAcceptsTasks(1, 'active')).not.toThrow()
    expect(() => checkProjectAcceptsTasks(1, 'done')).toThrow(NotAllowedError)
    expect(() => checkProjectAcceptsTasks(1, 'archived')).toThrow(NotAllowedError)
  })
})

describe('planStart', () => {
  it.each(taskStatuses.filter((s) => s !== 'todo'))('%s の Task には着手できない', (status) => {
    expect(() => planStart(task(1, status), [])).toThrow(NotAllowedError)
  })

  it('最上位の todo の Task は、連動する祖先がない', () => {
    expect(planStart(task(1, 'todo'), [])).toEqual([])
  })

  it('todo の祖先を近い順にたどって連動させる', () => {
    const ancestors = [task(2, 'todo'), task(3, 'todo')]
    expect(planStart(task(1, 'todo'), ancestors)).toEqual(ancestors)
  })

  it.each(['in_progress', 'blocked'] as const)(
    '%s の祖先に当たったら、そこから上は連動させない',
    (status) => {
      const ancestors = [task(2, 'todo'), task(3, status), task(4, 'todo')]
      expect(planStart(task(1, 'todo'), ancestors)).toEqual([task(2, 'todo')])
    },
  )
})
