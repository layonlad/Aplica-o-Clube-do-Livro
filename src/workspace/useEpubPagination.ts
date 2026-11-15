import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { epubTextPoint } from './epub-locator'
const gap = 32
/** DOM offsets stay stable when font, viewport or margins change; page numbers do not. */
export function useEpubPagination(
  article: RefObject<HTMLElement>,
  viewport: RefObject<HTMLDivElement>,
  active: boolean,
  contentKey: string,
  formatKey: string,
) {
  const [page, setPage] = useState(0),
    [count, setCount] = useState(1)
  const anchor = useRef(0),
    stride = useRef(1),
    current = useRef(0)
  const offsetAtPage = useCallback(() => {
    const body = article.current,
      host = viewport.current
    if (!body || !host || !host.clientWidth) return anchor.current
    const origin = body.getBoundingClientRect().left,
      index = Math.round(host.scrollLeft / stride.current)
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
    let node: Node | null,
      offset = 0
    while ((node = walker.nextNode())) {
      const length = node.textContent?.length ?? 0
      if (!length) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      if (
        [...range.getClientRects()].some(
          (rect) =>
            rect.width > 0 && Math.floor((rect.left - origin + 1) / stride.current) === index,
        )
      ) {
        let low = 0,
          high = length - 1
        while (low < high) {
          const middle = Math.floor((low + high) / 2)
          range.setStart(node, middle)
          range.setEnd(node, middle + 1)
          const rect = range.getBoundingClientRect()
          if (Math.floor((rect.left - origin + 1) / stride.current) < index) low = middle + 1
          else high = middle
        }
        anchor.current = offset + low
        return anchor.current
      }
      offset += length
    }
    return anchor.current
  }, [article, viewport])
  const revealOffset = useCallback(
    (offset: number) => {
      anchor.current = offset
      const body = article.current,
        host = viewport.current
      if (!active || !body || !host || !host.clientWidth) return
      const point = epubTextPoint(body, offset)
      let target = 0
      if (point) {
        const node = point.node,
          length = node.textContent?.length ?? 0
        const range = document.createRange(),
          at = Math.max(0, Math.min(length - 1, point.offset))
        range.setStart(node, at)
        range.setEnd(node, at + 1)
        const rect = range.getBoundingClientRect()
        target = Math.max(
          0,
          Math.floor((rect.left - body.getBoundingClientRect().left + 1) / stride.current),
        )
      }
      const last = Math.max(0, Math.ceil((body.scrollWidth + gap) / stride.current) - 1)
      target = Math.min(last, target)
      host.scrollLeft = target * stride.current
      current.current = target
      setPage(target)
    },
    [active, article, viewport],
  )
  const revealElement = useCallback(
    (element: HTMLElement) => {
      const body = article.current,
        host = viewport.current
      if (!body || !host) return
      const target = Math.max(
        0,
        Math.floor(
          (element.getBoundingClientRect().left - body.getBoundingClientRect().left + 1) /
            stride.current,
        ),
      )
      host.scrollLeft = target * stride.current
      current.current = target
      setPage(target)
      offsetAtPage()
    },
    [article, viewport, offsetAtPage],
  )
  const go = useCallback(
    (target: number) => {
      const host = viewport.current
      if (!host) return
      const next = Math.min(count - 1, Math.max(0, target))
      host.scrollLeft = next * stride.current
      current.current = next
      setPage(next)
      offsetAtPage()
    },
    [count, viewport, offsetAtPage],
  )
  useLayoutEffect(() => {
    anchor.current = 0
    current.current = 0
    setPage(0)
  }, [contentKey])
  useLayoutEffect(() => {
    const body = article.current,
      host = viewport.current
    if (!active || !body || !host) {
      setPage(0)
      setCount(1)
      return
    }
    let frame = 0,
      live = true
    const measure = () => {
      if (!live) return
      const width = host.clientWidth
      if (!width) return
      host.style.setProperty('--epub-column-width', width + 'px')
      stride.current = width + gap
      setCount(Math.max(1, Math.ceil((body.scrollWidth + gap) / stride.current)))
      revealOffset(anchor.current)
    }
    const resize = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const scroll = () => {
      const next = Math.max(0, Math.round(host.scrollLeft / stride.current))
      if (next !== current.current) offsetAtPage()
      current.current = next
      setPage(next)
    }
    measure()
    resize()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize)
    observer?.observe(host)
    observer?.observe(body)
    host.addEventListener('scroll', scroll, { passive: true })
    host.addEventListener('load', resize, true)
    window.addEventListener('resize', resize)
    document.fonts?.addEventListener('loadingdone', resize)
    void document.fonts?.ready.then(() => live && resize())
    return () => {
      live = false
      cancelAnimationFrame(frame)
      observer?.disconnect()
      host.removeEventListener('scroll', scroll)
      host.removeEventListener('load', resize, true)
      window.removeEventListener('resize', resize)
      document.fonts?.removeEventListener('loadingdone', resize)
    }
  }, [active, contentKey, formatKey, article, viewport, revealOffset, offsetAtPage])
  return {
    page,
    count,
    go,
    revealOffset,
    revealElement,
    visibleOffset: offsetAtPage,
  }
}
