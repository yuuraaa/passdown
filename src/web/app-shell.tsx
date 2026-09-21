import { NavLink, Outlet, useNavigate } from 'react-router'
import { useLogout, useSession } from './auth.js'
import { ActorDisplay, Button } from './components/ui.js'

const navigation = [
  { to: '/inbox', label: 'Inbox', icon: '□' },
  { to: '/projects', label: 'Projects', icon: '▦' },
  { to: '/tasks', label: 'Tasks', icon: '≡' },
  { to: '/documents', label: 'Documents', icon: '▤' },
  { to: '/settings/agents', label: 'Settings', icon: 'S' },
] as const

function Brand() {
  return (
    <div className="flex items-center gap-2 px-2 text-lg font-bold">
      <span className="grid size-7 place-items-center border-2 border-ink text-[11px]">pd</span>
      passdown
    </div>
  )
}

function NavItems({ mobile = false }: { mobile?: boolean }) {
  return (
    <nav className={mobile ? 'grid grid-cols-5' : 'grid gap-1'} aria-label="主なナビゲーション">
      {navigation.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            mobile
              ? `grid min-h-15 place-items-center gap-0.5 py-1 text-[10px] ${isActive ? 'font-bold text-ink' : 'text-muted'}`
              : `flex min-h-11 items-center gap-2 rounded-ui px-3 text-sm ${isActive ? 'bg-ink/7 font-semibold text-ink' : 'text-muted hover:bg-ink/4 hover:text-ink'}`
          }
        >
          <span aria-hidden="true" className="font-mono text-base">
            {item.icon}
          </span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export function AppShell() {
  const navigate = useNavigate()
  const session = useSession()
  const logout = useLogout()
  const actor = session.data ? { ...session.data, actorType: 'human' as const } : null
  return (
    <div className="min-h-screen md:grid md:grid-cols-[15.5rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col gap-5 border-r border-line bg-surface p-4 md:flex">
        <Brand />
        <button
          className="flex min-h-11 w-full items-center justify-between rounded-ui border border-line px-3 text-left text-sm text-muted hover:bg-ink/4"
          onClick={() => {
            void navigate('/search')
          }}
        >
          検索 <span className="font-mono text-xs">⌘K</span>
        </button>
        <NavItems />
        <div className="mt-auto grid gap-3 border-t border-line px-2 pt-4 text-xs text-muted">
          {actor && <ActorDisplay actor={actor} />}
          <Button
            className="text-xs"
            disabled={logout.isPending}
            onClick={() => {
              logout.mutate(undefined, {
                onSuccess: () => {
                  void navigate('/login', { replace: true })
                },
              })
            }}
          >
            ログアウト
          </Button>
        </div>
      </aside>
      <header className="sticky top-0 z-10 flex min-h-15 items-center justify-between border-b border-line bg-surface px-4 md:hidden">
        <Brand />
        <button
          className="min-h-11 rounded-ui border border-line px-3 text-sm"
          aria-label="検索を開く"
          onClick={() => {
            void navigate('/search')
          }}
        >
          検索
        </button>
      </header>
      <main className="mx-auto min-w-0 w-full max-w-7xl px-4 py-6 pb-24 md:px-11 md:py-10 md:pb-20">
        <Outlet />
      </main>
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface md:hidden">
        <NavItems mobile />
      </div>
    </div>
  )
}
