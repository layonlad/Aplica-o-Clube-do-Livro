import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { localEpub, saveEpub } from './epub-storage'

import { useWorkspace } from './WorkspaceProvider'
import { CoverArt } from '../components/ui'
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
      if (detail?.namespace === namespace && detail?.bookId === id) setRevision((n) => n + 1)
    }
    window.addEventListener('clube-epub-saved', changed)
    return () => window.removeEventListener('clube-epub-saved', changed)
  }, [namespace, id])
  useEffect(() => {
    if (!visible) return
    let live = true,
      href = ''
    const controller = new AbortController()
    setUrl('')
    void (async () => {
      const record = await localEpub(namespace, id).catch(() => undefined)
      let cover = record?.cover
      if (!cover && record) {
        const { readEpub } = await import('./epub-archive')
        const archive = await readEpub(record.file),
          image = archive.coverPath ? archive.images.get(archive.coverPath) : undefined
        if (image) {
          cover = new Blob([new Uint8Array(image.bytes)], { type: image.mime })
          if (live)
            void saveEpub(namespace, id, record.file, record.filename, cover).catch(() => {})
        }
      }
      if (!cover && user?.emailVerified && scope === 'personal' && import.meta.env.VITE_API_URL) {
        const token = await user.getIdToken()
        const timeout = setTimeout(() => controller.abort(), 75000)
        try {
          for (let attempt = 0; attempt < 4 && live; attempt++) {
            const response = await fetch(
              `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/v1/me/book-files/${id}/cover`,
              {
                headers: { Authorization: 'Bearer ' + token },
                signal: controller.signal,
                cache: 'no-store',
                credentials: 'omit',
                referrerPolicy: 'no-referrer',
              },
            )
            if (response.status === 429) {
              await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
              continue
            }
            if (response.ok && response.headers.get('content-type')?.startsWith('image/jpeg')) {
              const blob = await response.blob()
              if (blob.size <= 300000) cover = blob
            }
            break
          }
        } finally {
          clearTimeout(timeout)
        }
      }
      if (live && cover) {
        href = URL.createObjectURL(cover)
        setUrl(href)
      }
    })().catch(() => {})
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
