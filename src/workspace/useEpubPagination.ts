import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { epubTextPoint } from './epub-locator'
import { visibleScrollPoint, revealScrollPoint, type EpubPoint } from './epub-scroll'
const gap = 32
/** Stable UTF-16 locator, plus an optional image ordinal for pages without visible text. */
export function useEpubPagination(
  article: RefObject<HTMLElement>,
  viewport: RefObject<HTMLDivElement>,
  active: boolean,
  contentKey: string,
  formatKey: string,
) {
  const [page, setPage] = useState(0),
    [count, setCount] = useState(1),
    anchor = useRef<EpubPoint>({ offset: 0 }),
    stride = useRef(1),
    current = useRef(0)
  const visibleLocator = useCallback(() => {
    const body = article.current,
      host = viewport.current
    if (!body || !host?.clientWidth) return anchor.current
    if (!active) {
      anchor.current = visibleScrollPoint(body, host)
      return anchor.current
    }
    const origin = body.getBoundingClientRect().left,
      index = Math.round(host.scrollLeft / stride.current),
      column = (rect: DOMRect) => Math.max(0, Math.floor((rect.left - origin + 1) / stride.current))
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
    let node: Node | null,
      total = 0
    while ((node = walker.nextNode())) {
      const text = node.textContent ?? '',
        length = text.length
      if (!length) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      if (
        /\S/.test(text) &&
        [...range.getClientRects()].some((r) => r.width > 0 && column(r) === index)
      ) {
        // Collapsed spaces at a column boundary belong to the next printable character.
        const printable = (at: number) => {
          while (at < length && /\s/.test(text[at])) at++
          return at
        }
        const location = (at: number) => {
          at = printable(at)
          if (at >= length) return Infinity
          range.setStart(node!, at)
          range.setEnd(node!, at + 1)
          return column(range.getBoundingClientRect())
        }
        let low = 0,
          high = length - 1
        while (low < high) {
          const middle = Math.floor((low + high) / 2)
          if (location(middle) < index) low = middle + 1
          else high = middle
        }
        low = printable(low)
        if (low < length && location(low) === index) {
          anchor.current = { offset: total + low }
          return anchor.current
        }
      }
      total += length
    }
    const images = [...body.querySelectorAll('img')],
      element = images.findIndex((img) => column(img.getBoundingClientRect()) === index)
    if (element >= 0) {
      const range = document.createRange()
      range.selectNodeContents(body)
      range.setEndBefore(images[element])
      anchor.current = { offset: range.toString().length, element }
    }
    return anchor.current
  }, [active, article, viewport])
  const revealOffset = useCallback(
    (offset: number, element?: number) => {
      anchor.current = { offset, ...(element === undefined ? {} : { element }) }
      const body = article.current,
        host = viewport.current
      if (!body || !host?.clientWidth) return
      if (!active) {
        revealScrollPoint(body, host, anchor.current)
        return
      }
      let rect: DOMRect | undefined
      const image = element === undefined ? undefined : body.querySelectorAll('img')[element]
      if (image) rect = image.getBoundingClientRect()
      else if (offset > 0) {
        const point = epubTextPoint(body, offset)
        if (point) {
          let at = Math.min((point.node.textContent?.length ?? 1) - 1, point.offset)
          const text = point.node.textContent ?? ''
          while (at < text.length - 1 && /\s/.test(text[at])) at++
          const range = document.createRange()
          range.setStart(point.node, Math.max(0, at))
          range.setEnd(point.node, Math.max(0, at) + 1)
          rect = range.getBoundingClientRect()
        }
      }
      const last = Math.max(0, Math.ceil((body.scrollWidth + gap) / stride.current) - 1),
        target = Math.min(
          last,
          Math.max(
            0,
            rect
              ? Math.floor((rect.left - body.getBoundingClientRect().left + 1) / stride.current)
              : 0,
          ),
        )
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
      visibleLocator()
    },
    [article, viewport, visibleLocator],
  )
  const go = useCallback(
    (target: number) => {
      const host = viewport.current
      if (!host) return
      const next = Math.min(count - 1, Math.max(0, target))
      host.scrollLeft = next * stride.current
      current.current = next
      setPage(next)
      visibleLocator()
    },
    [count, viewport, visibleLocator],
  )
  useLayoutEffect(() => {
    anchor.current = { offset: 0 }
    current.current = 0
    setPage(0)
  }, [contentKey])
  useLayoutEffect(() => {
    const body = article.current,
      host = viewport.current
    if (!body || !host) {
      setPage(0)
      setCount(1)
      return
    }
    if (!active) {
      setPage(0)
      setCount(1)
      let frame = 0,
        live = true
      const resize = () => {
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(() => {
          if (live) revealOffset(anchor.current.offset, anchor.current.element)
        })
      }
      const scroll = () => {
        anchor.current = visibleScrollPoint(body, host)
      }
      revealOffset(anchor.current.offset, anchor.current.element)
      const observer =
        typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize)
      observer?.observe(host)
      observer?.observe(body)
      host.addEventListener('scroll', scroll, { passive: true })
      host.addEventListener('load', resize, true)
      document.fonts?.addEventListener('loadingdone', resize)
      return () => {
        live = false
        cancelAnimationFrame(frame)
        observer?.disconnect()
        host.removeEventListener('scroll', scroll)
        host.removeEventListener('load', resize, true)
        document.fonts?.removeEventListener('loadingdone', resize)
      }
    }
    let frame = 0,
      live = true
    const measure = () => {
      if (!live || !host.clientWidth) return
      host.style.setProperty('--epub-column-width', host.clientWidth + 'px')
      host.style.setProperty('--epub-page-height', host.clientHeight + 'px')
      stride.current = host.clientWidth + gap
      setCount(Math.max(1, Math.ceil((body.scrollWidth + gap) / stride.current)))
      revealOffset(anchor.current.offset, anchor.current.element)
    }
    const resize = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const scroll = () => {
      const next = Math.max(0, Math.round(host.scrollLeft / stride.current))
      if (next !== current.current) visibleLocator()
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
  }, [active, contentKey, formatKey, article, viewport, revealOffset, visibleLocator])
  return {
    page,
    count,
    go,
    revealOffset,
    revealElement,
    visibleLocator,
    visibleOffset: () => visibleLocator().offset,
  }
}
