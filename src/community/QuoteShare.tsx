import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, readableError } from '../auth/api'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import { Button } from '../components/ui'
export function QuoteShare({
  quote,
  title,
  author,
  source,
}: {
  quote: string
  title: string
  author: string
  source: string
}) {
  const { user } = useAuth(),
    { clubs } = useWorkspace(),
    [open, setOpen] = useState(false),
    [audience, setAudience] = useState(''),
    [body, setBody] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [published, setPublished] = useState(false)
  if (!quote || quote.length > 280) return null
  return (
    <div>
      <Button type="button" variant="secondary" onClick={() => setOpen(!open)}>
        Compartilhar este trecho
      </Button>
      {open &&
        (user?.emailVerified ? (
          <form
            className="workspace-form"
            onSubmit={(event) => {
              event.preventDefault()
              if (!audience) return
              setBusy(true)
              setError('')
              void apiRequest(
                user,
                audience === 'public' ? '/public/posts' : `/clubs/${audience}/posts`,
                'POST',
                {
                  kind: 'quote',
                  body,
                  quote,
                  bookTitle: title,
                  bookAuthor: author,
                  source,
                  mediaIds: [],
                  options: [],
                },
              )
                .then(() => {
                  setPublished(true)
                  setOpen(false)
                  setBody('')
                })
                .catch((err) => setError(readableError(err)))
                .finally(() => setBusy(false))
            }}
          >
            <blockquote>{quote}</blockquote>
            <label>
              Onde publicar?
              <select
                required
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
              >
                <option value="">Escolha o destino</option>
                <option value="public">Comunidade pública · qualquer pessoa poderá ver</option>
                {clubs.map((club) => (
                  <option value={club.id} key={club.id}>
                    {club.name} · somente participantes
                  </option>
                ))}
              </select>
            </label>
            <label>
              Seu comentário
              <textarea
                maxLength={5000}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            </label>
            <p>
              Será publicado apenas este trecho curto com a referência. Sua anotação e o arquivo do
              livro permanecem privados.
            </p>
            <Button disabled={busy || !audience}>
              {audience === 'public'
                ? 'Confirmar publicação pública'
                : 'Publicar no clube escolhido'}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </form>
        ) : (
          <p>
            <Link to="/account">Entre para escolher onde compartilhar</Link>. Seu destaque continua
            privado.
          </p>
        ))}
      {error && <p role="alert">{error}</p>}
      {published && <p role="status">Trecho publicado no destino escolhido.</p>}
    </div>
  )
}
