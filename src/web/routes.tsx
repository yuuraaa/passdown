import { Navigate, RouterProvider, createBrowserRouter } from 'react-router'
import { AppShell } from './app-shell.js'
import { LoginPage, RequireSession } from './auth.js'
import { Card, PageHeader } from './components/ui.js'

const routes = [
  { path: '/login', element: <LoginPage /> },
  {
    element: (
      <RequireSession>
        <AppShell />
      </RequireSession>
    ),
    children: [
      { index: true, element: <Navigate replace to="/tasks" /> },
      { path: '/inbox', element: <Placeholder title="Inbox" /> },
      { path: '/projects', element: <Placeholder title="Projects" /> },
      { path: '/projects/new', element: <Placeholder title="Projectを作成" /> },
      { path: '/projects/:id', element: <Navigate replace to="overview" /> },
      { path: '/projects/:id/:tab', element: <Placeholder title="Project" /> },
      { path: '/tasks', element: <Placeholder title="Tasks" /> },
      { path: '/tasks/new', element: <Placeholder title="Taskを作成" /> },
      { path: '/tasks/:id', element: <Placeholder title="Task" /> },
      { path: '/documents', element: <Placeholder title="Documents" /> },
      { path: '/documents/new', element: <Placeholder title="Documentを作成" /> },
      { path: '/documents/:id', element: <Placeholder title="Document" /> },
      { path: '/search', element: <Placeholder title="検索" /> },
      { path: '/settings', element: <Navigate replace to="/settings/agents" /> },
      { path: '/settings/agents', element: <Placeholder title="Agent" /> },
      { path: '/settings/agents/new', element: <Placeholder title="Agentを作成" /> },
      { path: '/settings/agents/:id', element: <Placeholder title="Agent" /> },
    ],
  },
  { path: '*', element: <Navigate replace to="/tasks" /> },
]

function Placeholder({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card className="p-8 text-center">
        <h2 className="font-semibold">この画面は準備中です</h2>
        <p className="mt-2 text-muted">共通基盤の次に、この画面の機能を実装します。</p>
      </Card>
    </>
  )
}

const router = createBrowserRouter(routes)
export function AppRouter() {
  return <RouterProvider router={router} />
}
