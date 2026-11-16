/** Animate an inert copy of the OLD leaf, keeping the live DOM/selection/locator geometry intact. */
export function preparePageTurn(
  host: HTMLElement,
  article: HTMLElement,
  direction: number,
  enabled: boolean,
) {
  if (
    !enabled ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
    !article.animate
  )
    return () => {}
  // Avoid cloning a very large chapter on intermediate phones; the live page still turns.
  const nodes = document.createTreeWalker(article, NodeFilter.SHOW_ELEMENT)
  let complexity = 0
  while (nodes.nextNode()) if (++complexity > 1500) return () => {}
  const rect = host.getBoundingClientRect(),
    computed = getComputedStyle(article),
    container = document.createElement('div'),
    leaf = document.createElement('div'),
    copy = article.cloneNode(true) as HTMLElement
  container.className = 'reading-room reader-flip-layer'
  container.setAttribute('aria-hidden', 'true')
  container.setAttribute('inert', '')
  Object.assign(container.style, {
    left: rect.left + 'px',
    top: rect.top + 'px',
    width: rect.width + 'px',
    height: rect.height + 'px',
    fontFamily: computed.fontFamily,
    fontSize: computed.fontSize,
    lineHeight: computed.lineHeight,
    color: computed.color,
  })
  const surface = getComputedStyle(host.closest('.reading-room')!).getPropertyValue(
    '--reader-surface',
  )
  container.style.setProperty('--reader-surface', surface)
  for (const property of [
    '--reader-leading',
    '--reader-weight',
    '--reader-align',
    '--reader-paragraph',
    '--reader-ink',
  ])
    container.style.setProperty(property, computed.getPropertyValue(property))
  container.style.setProperty('--epub-page-height', host.clientHeight + 'px')
  copy.removeAttribute('id')
  copy.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'))
  Object.assign(copy.style, {
    width: host.clientWidth + 'px',
    height: computed.height,
    margin: '0',
    padding: '0',
    transform: `translateX(${-host.scrollLeft}px)`,
    columnWidth: computed.columnWidth,
    columnGap: computed.columnGap,
  })
  leaf.className = 'reader-flip-leaf'
  leaf.style.transformOrigin = direction > 0 ? 'left center' : 'right center'
  leaf.append(copy)
  container.append(leaf)
  document.body.append(container)
  const cleanup = () => container.remove()
  const timer = window.setTimeout(cleanup, 1800)
  return (moved = true) => {
    if (!moved) {
      clearTimeout(timer)
      cleanup()
      return
    }
    requestAnimationFrame(() => {
      const animation = leaf.animate(
        [
          { transform: 'perspective(1400px) rotateY(0deg)', opacity: 1, boxShadow: '0 0 0 #0000' },
          {
            transform: `perspective(1400px) rotateY(${direction > 0 ? -35 : 35}deg)`,
            opacity: 1,
            offset: 0.55,
            boxShadow: '8px 0 30px #0004',
          },
          {
            transform: `perspective(1400px) rotateY(${direction > 0 ? -92 : 92}deg)`,
            opacity: 0,
            boxShadow: '18px 0 40px #0002',
          },
        ],
        { duration: 280, easing: 'cubic-bezier(.2,.65,.3,1)', fill: 'forwards' },
      )
      void animation.finished
        .catch(() => {})
        .finally(() => {
          clearTimeout(timer)
          cleanup()
        })
    })
  }
}
