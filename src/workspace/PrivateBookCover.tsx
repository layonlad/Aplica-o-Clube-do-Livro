import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { localEpub } from './epub-storage'
import { CoverArt } from '../components/ui'
export function PrivateBookCover({
  id,
  title,
  author,
}: {
  id: string
  title: string
  author: string
}) {
  const { user } = useAuth(),
    [url, setUrl] = useState(''),
    [revision, setRevision] = useState(0),
    namespace = user?.emailVerified ? user.uid : 'visitor'
  useEffect(() => {
    const changed = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail?.namespace === namespace && detail?.bookId === id) setRevision((n) => n + 1)
    }
    window.addEventListener('clube-epub-saved', changed)
    return () => window.removeEventListener('clube-epub-saved', changed)
  }, [namespace, id])
  useEffect(() => {
    let live = true,
      href = ''
    setUrl('')
    void localEpub(namespace, id)
      .then((record) => {
        if (live && record?.cover) {
          href = URL.createObjectURL(record.cover)
          setUrl(href)
        }
      })
      .catch(() => {})
    return () => {
      live = false
      if (href) URL.revokeObjectURL(href)
    }
  }, [namespace, id, revision])
  return url ? (
    <img className="library-cover" src={url} alt={`Capa de ${title}`} loading="lazy" />
  ) : (
    <CoverArt title={title} author={author} className="library-cover" />
  )
}
