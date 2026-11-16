import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, readableError } from '../auth/api'
import { Button } from '../components/ui'
import { uploadMediaFile } from './PrivateMedia'
import { postBase } from './social-api'
import { clearPendingShare, peekPendingShare, takePendingShare } from '../workspace/BookShare'

/**
 * Publicação pronta com a capa do livro que a pessoa escolheu compartilhar na biblioteca.
 * Aparece no topo da comunidade ou do mural do clube; publica a capa como foto, nunca o arquivo.
 */
export function SharedBookComposer({
  clubId,
  onPublished,
}: {
  clubId: string | null
  onPublished: () => void
}) {
  const { user } = useAuth()
  const target = clubId ?? 'public'
  const [share] = useState(() => peekPendingShare(target))
  const [body, setBody] = useState(() =>
    share ? `Estou lendo “${share.title}”, de ${share.author}.` : '',
  )
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const card = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!share) return
    const href = URL.createObjectURL(share.cover)
    setPreview(href)
    card.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    return () => URL.revokeObjectURL(href)
  }, [share])
  if (!share || done || !user) return null
  async function publish() {
    if (!user || !share) return
    setBusy(true)
    setError('')
    try {
      const media = await uploadMediaFile(user, clubId, share.cover)
      await apiRequest(user, postBase(clubId), 'POST', {
        kind: 'reflection',
        body: body.trim(),
        bookTitle: share.title.slice(0, 150),
        bookAuthor: share.author.slice(0, 150),
        mediaIds: [media.id],
        options: [],
        clientRequestId: crypto.randomUUID(),
      })
      takePendingShare(target)
      setDone(true)
      onPublished()
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section ref={card} className="card shared-book" aria-label="Compartilhar capa do livro">
      <button
        type="button"
        className="icon-button shared-book__close"
        aria-label="Cancelar compartilhamento"
        onClick={() => {
          clearPendingShare()
          setDone(true)
        }}
      >
        <X size={18} aria-hidden="true" />
      </button>
      <div className="shared-book__body">
        {preview && <img src={preview} alt={`Capa de ${share.title}`} />}
        <div>
          <strong>{share.title}</strong>
          <small>{share.author}</small>
        </div>
      </div>
      <textarea
        className="shared-book__text"
        aria-label="Texto da publicação"
        value={body}
        maxLength={2000}
        rows={3}
        onChange={(event) => setBody(event.target.value)}
      />
      <div className="workspace-actions">
        <Button disabled={busy} onClick={() => void publish()}>
          {busy ? 'Publicando…' : clubId ? 'Publicar no clube' : 'Publicar na comunidade'}
        </Button>
      </div>
      {error && <p role="alert" className="access-error">{error}</p>}
    </section>
  )
}
