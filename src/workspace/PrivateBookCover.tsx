import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { useWorkspace } from './WorkspaceProvider'
import { CoverArt } from '../components/ui'
import { BOOK_FILES_EVENT, bookCoverBlob } from './book-files'

/**
 * Capa do livro na biblioteca: a imagem do próprio EPUB (deste aparelho ou da conta).
 * Sem imagem, mostra a capa tipográfica do app. Carrega só quando aparece na tela.
 */
export function PrivateBookCover({
  id,
  title,
  author,
  fallback,
}: {
  id: string
  title: string
  author: string
  fallback?: string
}) {
  const { user } = useAuth(),
    { scope } = useWorkspace(),
    element = useRef<HTMLDivElement>(null),
    [visible, setVisible] = useState(false),
    [url, setUrl] = useState(''),
    [revision, setRevision] = useState(0),
    namespace = user?.emailVerified ? user.uid : 'visitor'
  useEffect(() => {
    if (!element.current || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(element.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const changed = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (!detail || (detail.namespace === namespace && detail.bookId === id)) setRevision((n) => n + 1)
    }
    window.addEventListener('clube-epub-saved', changed)
    window.addEventListener(BOOK_FILES_EVENT, changed)
    return () => {
      window.removeEventListener('clube-epub-saved', changed)
      window.removeEventListener(BOOK_FILES_EVENT, changed)
    }
  }, [namespace, id])
  useEffect(() => {
    if (!visible || scope !== 'personal') return
    let live = true,
      href = ''
    const controller = new AbortController()
    void bookCoverBlob(user, id, controller.signal)
      .then((cover) => {
        if (!live || !cover) return
        href = URL.createObjectURL(cover)
        setUrl(href)
      })
      .catch(() => {})
    return () => {
      live = false
      controller.abort()
      if (href) URL.revokeObjectURL(href)
    }
  }, [namespace, id, revision, visible, scope])
  return (
    <div ref={element} className="private-book-cover">
      {url || fallback ? (
        <img
          className="library-cover"
          src={url || fallback}
          alt={`Capa de ${title}`}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <CoverArt title={title} author={author} className="library-cover" />
      )}
    </div>
  )
}
