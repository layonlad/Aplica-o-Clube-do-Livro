import { useLayoutEffect, useRef, type RefObject } from 'react'

const savedRoutes = new Set(['/app', '/app/explore', '/app/library', '/app/community', '/app/profile', '/app/clubs'])

/** Scroll positions live inside the authenticated shell and are discarded at logout. */
export function useTabScroll(path: string, search: string, scope: string, content: RefObject<HTMLElement>) {
  const positions = useRef(new Map<string, number>())
  const key = String(scope) + ':' + path + search

  useLayoutEffect(() => {
    const top = savedRoutes.has(path) ? positions.current.get(key) ?? 0 : 0
    let observer: ResizeObserver | undefined
    let frame = 0
    let restoring = top > 0
    const track = () => {
      if (restoring || !savedRoutes.has(path)) return
      positions.current.delete(key)
      positions.current.set(key, window.scrollY)
      if (positions.current.size > 24) positions.current.delete(positions.current.keys().next().value!)
    }
    const stopRestoring = () => { restoring = false; observer?.disconnect() }
    const restore = () => {
      window.scrollTo({ top, behavior: 'instant' })
      if (window.scrollY >= top - 1) stopRestoring()
    }
    restore()
    if (restoring && content.current && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(restore)
      observer.observe(content.current)
      frame = requestAnimationFrame(restore)
    }
    const timeout = setTimeout(stopRestoring, 1000)
    window.addEventListener('scroll', track, { passive: true })
    window.addEventListener('touchstart', stopRestoring, { passive: true })
    window.addEventListener('wheel', stopRestoring, { passive: true })
    return () => {
      clearTimeout(timeout)
      cancelAnimationFrame(frame)
      stopRestoring()
      window.removeEventListener('scroll', track)
      window.removeEventListener('touchstart', stopRestoring)
      window.removeEventListener('wheel', stopRestoring)
    }
  }, [key, path, content])
}
