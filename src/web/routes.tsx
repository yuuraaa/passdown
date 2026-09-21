import { Navigate, RouterProvider, createBrowserRouter } from 'react-router'
import { AppShell } from './app-shell.js'
import { LoginPage, RequireSession } from './auth.js'
import { Card, PageHeader } from './components/ui.js'
import { DocumentDetailPage, DocumentsPage, NewDocumentPage } from './documents/documents.js'
import { InboxDetailPage, InboxPage } from './inbox/inbox.js'
import { NewProjectPage, ProjectDetailPage, ProjectsPage } from './projects/projects.js'
import { AgentDetailPage, AgentsPage, NewAgentPage } from './settings/settings.js'
import { NewTaskPage, TaskDetailPage, TasksPage } from './tasks/tasks.js'

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
      { path: '/inbox', element: <InboxPage /> },
      { path: '/inbox/:id', element: <InboxDetailPage /> },
      { path: '/projects', element: <ProjectsPage /> },
      { path: '/projects/new', element: <NewProjectPage /> },
      { path: '/projects/:id', element: <Navigate replace to="overview" /> },
      { path: '/projects/:id/:tab', element: <ProjectDetailPage /> },
      { path: '/tasks', element: <TasksPage /> },
      { path: '/tasks/new', element: <NewTaskPage /> },
      { path: '/tasks/:id', element: <TaskDetailPage /> },
      { path: '/documents', element: <DocumentsPage /> },
      { path: '/documents/new', element: <NewDocumentPage /> },
      { path: '/documents/:id', element: <DocumentDetailPage /> },
      { path: '/search', element: <Placeholder title="検索" /> },
      { path: '/settings', element: <Navigate replace to="/settings/agents" /> },
      { path: '/settings/agents', element: <AgentsPage /> },
      { path: '/settings/agents/new', element: <NewAgentPage /> },
      { path: '/settings/agents/:id', element: <AgentDetailPage /> },
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
