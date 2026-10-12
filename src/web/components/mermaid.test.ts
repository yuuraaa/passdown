// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import mermaid from 'mermaid'
import { renderMermaid } from './mermaid.js'

vi.mock('mermaid', () => ({ default: { initialize: vi.fn(), render: vi.fn() } }))
const draw = vi.mocked(mermaid.render)
const initialize = vi.mocked(mermaid.initialize)

beforeEach(() => {
  draw.mockReset()
  initialize.mockReset()
})

describe('Mermaid の描画', () => {
  it('生成された図のリンクを取り除き、内容は残す', async () => {
    draw.mockResolvedValueOnce({
      svg: '<svg viewBox="0 0 120 60"><a href="https://example.com"><text>開始</text></a></svg>',
      diagramType: 'flowchart',
    })
    const svg = await renderMermaid('flowchart LR\nA-->B', 'light')
    const element = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
    expect(element.querySelector('a')).toBeNull()
    expect(element.querySelector('text')?.textContent).toBe('開始')
  })
  it('図の寸法を保ち、親要素の幅に引き伸ばさない', async () => {
    draw.mockResolvedValueOnce({
      svg: '<svg width="100%" viewBox="0 0 450 120"></svg>',
      diagramType: 'flowchart',
    })
    const svg = await renderMermaid('flowchart LR\nA-->B', 'light')
    const element = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
    expect(element.getAttribute('width')).toBe('450')
    expect(element.getAttribute('height')).toBe('120')
  })
  it('成功時に描画用 DOM を片付ける', async () => {
    let temporary!: Element
    draw.mockImplementation((_id, _source, container) => {
      temporary = container!
      expect(document.body.contains(temporary)).toBe(true)
      return Promise.resolve({ svg: '<svg></svg>', diagramType: 'flowchart' })
    })
    expect(await renderMermaid('flowchart LR\nA-->B', 'light')).toBe('<svg></svg>')
    expect(document.body.contains(temporary)).toBe(false)
  })

  it('失敗時にも一時 DOM を片付け、後続の図は描画できる', async () => {
    let temporary!: Element
    draw.mockImplementationOnce((_id, _source, container) => {
      temporary = container!
      return Promise.reject(new Error('parse error'))
    })
    await expect(renderMermaid('broken', 'light')).rejects.toThrow('parse error')
    expect(document.body.contains(temporary)).toBe(false)
    draw.mockResolvedValueOnce({ svg: '<svg></svg>', diagramType: 'flowchart' })
    expect(await renderMermaid('flowchart LR\nA-->B', 'dark')).toBe('<svg></svg>')
  })

  it('複数図を順番に描画し、共有されるテーマ設定と識別子を混同しない', async () => {
    let currentTheme: string | undefined
    let finishFirst!: () => void
    const firstFinished = new Promise<void>((resolve) => {
      finishFirst = resolve
    })
    initialize.mockImplementation((config) => {
      currentTheme = config.theme
    })
    draw.mockImplementationOnce(async () => {
      await firstFinished
      return { svg: `<svg>${currentTheme}</svg>`, diagramType: 'flowchart' }
    })
    draw.mockImplementationOnce(() =>
      Promise.resolve({ svg: `<svg>${currentTheme}</svg>`, diagramType: 'flowchart' }),
    )
    const first = renderMermaid('first', 'light')
    const second = renderMermaid('second', 'dark')
    await vi.waitFor(() => expect(draw).toHaveBeenCalledTimes(1))
    finishFirst()
    await expect(first).resolves.toBe('<svg>default</svg>')
    await expect(second).resolves.toBe('<svg>dark</svg>')
    expect(draw.mock.calls[0]?.[0]).not.toBe(draw.mock.calls[1]?.[0])
  })
})
