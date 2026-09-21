import { useEffect, useId, useRef } from 'react'
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

const buttonStyles = {
  default: 'border-line bg-surface text-ink hover:border-ink hover:bg-ink/4',
  primary: 'border-accent bg-accent text-surface hover:bg-accent/90',
  danger: 'border-danger/35 bg-surface text-danger hover:border-danger',
} as const

export function Button({
  variant = 'default',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof buttonStyles }) {
  return (
    <button
      className={`min-h-11 rounded-ui border px-3.5 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${buttonStyles[variant]} ${className}`}
      type={type}
      {...props}
    />
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: (id: string) => ReactNode
}) {
  const id = useId()
  return (
    <label className="grid min-w-0 gap-1.5 text-sm text-muted" htmlFor={id}>
      {label}
      {children(id)}
      {error && <span className="text-sm text-danger">{error}</span>}
    </label>
  )
}

export function Input({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <Field label={label} error={error}>
      {(id) => (
        <input
          id={id}
          className="min-h-11 min-w-0 w-full rounded-ui border border-line bg-surface px-3 py-2 text-ink"
          {...props}
        />
      )}
    </Field>
  )
}

export function Textarea({
  label,
  error,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string }) {
  return (
    <Field label={label} error={error}>
      {(id) => (
        <textarea
          id={id}
          className="min-h-28 min-w-0 w-full rounded-ui border border-line bg-surface px-3 py-2 text-ink"
          {...props}
        />
      )}
    </Field>
  )
}

export function Select({
  label,
  error,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  error?: string
  children: ReactNode
}) {
  return (
    <Field label={label} error={error}>
      {(id) => (
        <select
          id={id}
          className="min-h-11 min-w-0 w-full rounded-ui border border-line bg-surface px-3 py-2 text-ink"
          {...props}
        >
          {children}
        </select>
      )}
    </Field>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-ui border border-line bg-surface ${className}`}>
      {children}
    </section>
  )
}

export function PageHeader({
  title,
  lead,
  action,
}: {
  title: string
  lead?: ReactNode
  action?: ReactNode
}) {
  return (
    <header className="mb-7 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {lead && <p className="mt-2 text-muted">{lead}</p>}
      </div>
      {action}
    </header>
  )
}

export function Dialog({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog
      ref={dialogRef}
      className="m-0 h-full max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-ink/35 md:m-auto md:h-auto md:max-w-xl md:p-5"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
    >
      <div className="absolute inset-x-0 bottom-0 rounded-t-lg border border-line bg-surface md:static md:rounded-lg">
        <header className="flex items-center justify-between border-b border-line p-5">
          <h2 className="font-semibold">{title}</h2>
          <Button aria-label="閉じる" onClick={onClose}>
            閉じる
          </Button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </dialog>
  )
}

const statusLabels: Record<string, string> = {
  todo: 'Todo',
  in_progress: '進行中',
  blocked: 'Blocked',
  review: 'Review',
  done: 'Done',
  cancelled: 'Cancelled',
  active: '進行中',
  archived: 'アーカイブ済み',
  triaged: '整理済み',
}
export function StatusBadge({ status, children }: { status: string; children?: ReactNode }) {
  return (
    <span className="inline-flex whitespace-nowrap rounded-full border border-line px-2 py-0.5 text-xs text-muted">
      {children ?? statusLabels[status] ?? status}
    </span>
  )
}

export function FilterChip({
  selected,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button
      className={`min-h-10 whitespace-nowrap rounded-full border px-3 text-sm ${selected ? 'border-ink bg-ink/6 font-semibold text-ink' : 'border-line bg-surface text-muted'}`}
      aria-pressed={selected}
      {...props}
    >
      {children}
    </button>
  )
}

export function ActorDisplay({ actor }: { actor: { actorType: 'human' | 'agent'; name: string } }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden="true"
        className={`grid size-5 place-items-center border border-line text-[10px] text-muted ${actor.actorType === 'agent' ? 'rounded-ui' : 'rounded-full'}`}
      >
        {actor.actorType === 'agent' ? '□' : '人'}
      </span>
      {actor.name}
    </span>
  )
}

export function ActivityTimeline({ children }: { children: ReactNode }) {
  return <ol className="divide-y divide-line">{children}</ol>
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly { id: string; label: string }[]
  active: string
  onChange: (id: string) => void
}) {
  return (
    <nav
      className="mb-5 flex overflow-x-auto border-b border-line"
      aria-label="ページ内ナビゲーション"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`min-h-11 shrink-0 border-b-2 px-3.5 ${active === tab.id ? 'border-ink font-semibold text-ink' : 'border-transparent text-muted'}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
