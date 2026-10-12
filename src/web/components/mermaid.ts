let renderQueue: Promise<void> = Promise.resolve()
let nextId = 0

/** Mermaid の設定は共有されるため、初期化から描画までを直列にする。 */
export function renderMermaid(source: string, theme: 'light' | 'dark'): Promise<string> {
  const result = renderQueue.then(async () => {
    const { default: mermaid } = await import('mermaid')
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      htmlLabels: false,
      theme: theme === 'dark' ? 'dark' : 'default',
      fontFamily: 'system-ui, sans-serif',
      secure: [
        'secure',
        'securityLevel',
        'startOnLoad',
        'maxTextSize',
        'maxEdges',
        'suppressErrorRendering',
        'htmlLabels',
        'flowchart',
        'theme',
        'themeVariables',
        'themeCSS',
      ],
    })

    // Mermaid が使う一時 DOM を本文の外に置き、失敗時も残さない。
    const container = document.createElement('div')
    container.style.visibility = 'hidden'
    container.style.position = 'fixed'
    container.style.top = '0'
    container.style.left = '0'
    container.style.width = '100%'
    container.style.height = '0'
    container.style.overflow = 'hidden'
    container.style.pointerEvents = 'none'
    container.setAttribute('aria-hidden', 'true')
    document.body.append(container)
    try {
      const { svg } = await mermaid.render(`passdown-mermaid-${++nextId}`, source, container)
      // width="100%" の図を引き伸ばさず、描画時の寸法を保って横スクロールさせる。
      const element = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
      // 図は閲覧専用にし、Mermaid のリンクもクリック対象にしない。
      const links = element.querySelectorAll('a')
      for (const link of links) link.replaceWith(...link.childNodes)
      const viewBox = element
        .getAttribute('viewBox')
        ?.trim()
        .split(/[\s,]+/)
        .map(Number)
      if (viewBox && viewBox.length === 4 && viewBox[2]! > 0 && viewBox[3]! > 0) {
        element.setAttribute('width', String(viewBox[2]))
        element.setAttribute('height', String(viewBox[3]))
        return element.outerHTML
      }
      return links.length > 0 ? element.outerHTML : svg
    } finally {
      container.remove()
    }
  })
  // 1つの図の失敗で、後続の図の描画を止めない。
  renderQueue = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}
