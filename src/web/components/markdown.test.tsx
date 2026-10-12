// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MarkdownContent } from './markdown.js'
import { renderMermaid } from './mermaid.js'

vi.mock('./mermaid.js', () => ({ renderMermaid: vi.fn() }))
const draw = vi.mocked(renderMermaid)

beforeEach(() => {
  document.documentElement.dataset.theme = 'light'
  draw.mockReset()
})
afterEach(cleanup)

describe('詳細画面の Markdown', () => {
  it('失敗した図の原文を表示し、本文とほかの図は表示を続ける', async () => {
    draw
      .mockRejectedValueOnce(new Error('parse error'))
      .mockResolvedValueOnce('<svg role="img" aria-label="正常な図"></svg>')
    const { container } = render(
      <MarkdownContent>
        {'本文\n\n```mermaid\n壊れた図 <script>\n```\n\n```mermaid\nflowchart LR\nA-->B\n```'}
      </MarkdownContent>,
    )
    expect(await screen.findByText('図を表示できないため、原文を表示しています。')).toBeTruthy()
    expect(await screen.findByRole('img', { name: '正常な図' })).toBeTruthy()
    expect(container.querySelector('pre code')?.textContent).toBe('壊れた図 <script>\n')
    expect(container.querySelector('script')).toBeNull()
    expect(screen.getByText('本文')).toBeTruthy()
  })

  it('本文変更後に古い描画結果が到着しても表示を上書きしない', async () => {
    let finishOld!: (svg: string) => void
    const oldResult = new Promise<string>((resolve) => {
      finishOld = resolve
    })
    draw.mockReturnValueOnce(oldResult)
    draw.mockResolvedValueOnce('<svg role="img" aria-label="新しい図"></svg>')
    const view = render(<MarkdownContent>{'```mermaid\nflowchart LR\nA-->B\n```'}</MarkdownContent>)
    view.rerender(<MarkdownContent>{'```mermaid\nflowchart LR\nC-->D\n```'}</MarkdownContent>)
    expect(await screen.findByRole('img', { name: '新しい図' })).toBeTruthy()
    await act(async () => {
      finishOld('<svg role="img" aria-label="古い図"></svg>')
      await oldResult
    })
    expect(screen.queryByRole('img', { name: '古い図' })).toBeNull()
    expect(screen.getByRole('img', { name: '新しい図' })).toBeTruthy()
  })

  it('テーマ変更時に図を描き直す', async () => {
    draw.mockImplementation((_source, theme) =>
      Promise.resolve(`<svg role="img" aria-label="${theme}の図"></svg>`),
    )
    render(<MarkdownContent>{'```mermaid\nflowchart LR\nA-->B\n```'}</MarkdownContent>)
    await screen.findByRole('img', { name: 'lightの図' })
    document.documentElement.dataset.theme = 'dark'
    expect(await screen.findByRole('img', { name: 'darkの図' })).toBeTruthy()
    expect(screen.queryByRole('img', { name: 'lightの図' })).toBeNull()
  })
})
