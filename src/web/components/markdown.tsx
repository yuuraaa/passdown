import { useEffect, useState, useSyncExternalStore } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import { renderMermaid } from './mermaid.js'

function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}

const readTheme = () =>
  document.documentElement.dataset.theme === 'dark' ? ('dark' as const) : ('light' as const)

function MermaidDiagram({ source }: { source: string }) {
  const theme = useSyncExternalStore(subscribeTheme, readTheme)
  const [result, setResult] = useState<{
    source: string
    theme: 'light' | 'dark'
    svg?: string
    failed?: boolean
  }>()

  useEffect(() => {
    let cancelled = false
    void renderMermaid(source, theme).then(
      (svg) => {
        if (!cancelled) setResult({ source, theme, svg })
      },
      () => {
        if (!cancelled) setResult({ source, theme, failed: true })
      },
    )
    return () => {
      cancelled = true
    }
  }, [source, theme])

  const current = result?.source === source && result.theme === theme ? result : undefined
  if (current?.failed) {
    return (
      <div className="mermaid-fallback">
        <p className="text-sm text-muted" role="status">
          図を表示できないため、原文を表示しています。
        </p>
        <pre>
          <code>{source}</code>
        </pre>
      </div>
    )
  }
  if (!current?.svg)
    return (
      <p className="text-sm text-muted" role="status">
        図を読み込み中…
      </p>
    )
  return (
    <div
      className="mermaid-diagram"
      // 本文の HTML ではなく、strict 設定で Mermaid が生成・無害化した SVG だけを挿入する。
      dangerouslySetInnerHTML={{ __html: current.svg }}
    />
  )
}

const components: Components = {
  pre({ node, children, ...props }) {
    const code = node?.children[0]
    if (
      code?.type === 'element' &&
      code.tagName === 'code' &&
      Array.isArray(code.properties.className) &&
      code.properties.className.includes('language-mermaid')
    ) {
      const source = code.children
        .map((child) => (child.type === 'text' ? child.value : ''))
        .join('')
      return <MermaidDiagram source={source} />
    }
    return <pre {...props}>{children}</pre>
  },
  table({ children }) {
    return (
      <div className="markdown-table">
        <table>{children}</table>
      </div>
    )
  },
}

/** 詳細画面の文章を、全リソースで同じ記法・スタイルで読む。 */
export function MarkdownContent({ children }: { children: string }) {
  return (
    <div className="markdown-content">
      <Markdown components={components} remarkPlugins={[remarkGfm]} skipHtml>
        {children}
      </Markdown>
    </div>
  )
}
