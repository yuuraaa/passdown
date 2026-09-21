import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { loginInput } from '../server/modules/auth/inputs.js'
import { ApiError, api, readJson } from './lib/api.js'
import { queryKeys } from './lib/query.js'

type Actor = { id: number; actorType: 'human' | 'agent'; name: string }

export function useSession() {
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: async () => readJson<Actor>(await api.session.$get()),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => readJson(await api.session.$delete()),
    onSuccess: () => queryClient.removeQueries({ queryKey: queryKeys.session }),
  })
}

export function RequireSession({ children }: { children: ReactNode }) {
  const session = useSession()
  const location = useLocation()
  if (session.isPending) return <p className="p-8 text-muted">読み込み中…</p>
  if (session.isError) {
    if (session.error instanceof ApiError && session.error.type === 'unauthorized') {
      return (
        <Navigate replace to="/login" state={{ from: `${location.pathname}${location.search}` }} />
      )
    }
    return <p className="p-8 text-danger">{session.error.message}</p>
  }
  return children
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const session = useSession()
  const [validationError, setValidationError] = useState<string | null>(null)
  const login = useMutation({
    mutationFn: async (input: { loginName: string; password: string }) =>
      readJson<Actor>(await api.session.$post({ json: input })),
    onSuccess: (actor) => {
      queryClient.setQueryData(queryKeys.session, actor)
      const from =
        (location.state as { from?: string } | null)?.from ??
        new URLSearchParams(location.search).get('returnTo') ??
        '/tasks'
      void navigate(from, { replace: true })
    },
  })
  if (session.data) return <Navigate replace to="/tasks" />
  return (
    <main className="grid min-h-screen place-items-center p-5">
      <div className="w-full max-w-md">
        <div className="mb-7 text-lg font-bold">
          <span className="mr-2 inline-grid size-7 place-items-center border-2 border-ink text-xs">
            pd
          </span>
          passdown
        </div>
        <form
          className="grid gap-4 rounded-lg border border-line bg-surface p-7"
          onSubmit={(event) => {
            event.preventDefault()
            const values = Object.fromEntries(new FormData(event.currentTarget))
            const parsed = loginInput.safeParse(values)
            if (!parsed.success) {
              setValidationError(parsed.error.issues[0]?.message ?? '入力を確認してください')
              return
            }
            setValidationError(null)
            login.mutate(parsed.data)
          }}
        >
          <div>
            <h1 className="text-2xl font-bold">ログイン</h1>
            <p className="mt-1 text-muted">オーナー用のアカウントでログインします。</p>
          </div>
          <label className="grid gap-1.5 text-sm text-muted">
            ユーザー名
            <input
              name="loginName"
              autoComplete="username"
              className="min-h-11 rounded-ui border border-line px-3 text-ink"
              disabled={login.isPending}
            />
          </label>
          <label className="grid gap-1.5 text-sm text-muted">
            パスワード
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              className="min-h-11 rounded-ui border border-line px-3 text-ink"
              disabled={login.isPending}
            />
          </label>
          {(validationError || login.isError) && (
            <p className="text-sm text-danger">
              {validationError ?? (login.isError ? login.error.message : '')}
            </p>
          )}
          <button
            className="min-h-11 rounded-ui bg-accent px-4 font-semibold text-surface disabled:opacity-50"
            disabled={login.isPending}
            type="submit"
          >
            {login.isPending ? 'ログイン中…' : 'ログイン'}
          </button>
          <p className="text-xs text-muted">アカウント作成とパスワード再設定は CLI で行います。</p>
        </form>
      </div>
    </main>
  )
}
