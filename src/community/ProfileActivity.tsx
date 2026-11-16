import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Page } from '../../server/src/community-contracts'
import { UserAvatar } from '../components/UserAvatar'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, readableError } from '../auth/api'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import { Button, SkeletonPage } from '../components/ui'
interface Activity {
  id: string
  kind: string
  targetId: string
  clubId: string | null
  context: string
  excerpt: string
  createdAt: string
}
const labels: Record<string, string> = {
  post: 'Publicação',
  comment: 'Comentário',
  topic: 'Discussão',
  reply: 'Resposta no fórum',
  membership: 'Participação',
  saved: 'Publicação salva',
}
export function ProfileActivityFeed({
  id,
  saved = false,
  author,
}: {
  id: string
  saved?: boolean
  author?: { name: string; handle?: string; avatarId: string | null }
}) {
  const { user } = useAuth(),
    { setScope } = useWorkspace(),
    navigate = useNavigate(),
    [page, setPage] = useState<Page<Activity> | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const path = saved ? '/me/profile/saved' : `/people/${id}/activity`
  useEffect(() => {
    let live = true
    setPage(null)
    setError('')
    if (user)
      void apiRequest<Page<Activity>>(user, path)
        .then((p) => live && setPage(p))
        .catch((e) => live && setError(readableError(e)))
    return () => {
      live = false
    }
  }, [user?.uid, path])
  async function more() {
    if (!user || !page?.nextCursor) return
    setBusy(true)
    try {
      const next = await apiRequest<Page<Activity>>(
        user,
        path + '?cursor=' + encodeURIComponent(page.nextCursor),
      )
      setPage((p) => ({ items: [...(p?.items ?? []), ...next.items], nextCursor: next.nextCursor }))
    } catch (e) {
      setError(readableError(e))
    } finally {
      setBusy(false)
    }
  }
  function open(item: Activity) {
    if (item.clubId) setScope(item.clubId)
    if (item.kind === 'membership') navigate('/space/' + item.clubId)
    else if (['topic', 'reply'].includes(item.kind)) navigate('/app/forum?topic=' + item.targetId)
    else navigate((item.clubId ? '/app/wall' : '/app/community') + '?post=' + item.targetId)
  }
  if (!user) return <p>Entre para ver as atividades disponíveis para você.</p>
  if (error) return <p role="alert">{error}</p>
  if (!page) return <SkeletonPage label="Carregando atividades…" />
  return (
    <div className="profile-activity-feed">
      {!page.items.length && (
        <p className="empty-inline">Nenhuma atividade disponível nesta seção.</p>
      )}
      {page.items.map((item) => (
        <article className="profile-activity-card" key={item.id}>
          {author && (
            <header className="profile-activity-author">
              <UserAvatar name={author.name} avatarId={author.avatarId} size="sm" />
              <span>
                <strong>{author.name}</strong>
                <small>@{author.handle}</small>
              </span>
            </header>
          )}
          <span className="eyebrow">
            {labels[item.kind] ?? item.kind} · {item.context}
          </span>
          <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('pt-BR')}</time>
          <p>{item.excerpt}</p>
          <button className="text-link" onClick={() => open(item)}>
            Abrir conteúdo
          </button>
        </article>
      ))}
      {page.nextCursor && (
        <Button disabled={busy} variant="secondary" onClick={() => void more()}>
          Mais atividades
        </Button>
      )}
    </div>
  )
}
export function FollowRequests({ onResolved }: { onResolved: () => void }) {
  const { user } = useAuth(),
    [page, setPage] = useState<Page<{
      id: string
      userId: string
      name: string
      handle: string
    }> | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  async function load(cursor?: string) {
    if (!user) return
    const next = await apiRequest<NonNullable<typeof page>>(
      user,
      '/me/follow-requests' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''),
    )
    setPage((p) =>
      cursor ? { items: [...(p?.items ?? []), ...next.items], nextCursor: next.nextCursor } : next,
    )
  }
  useEffect(() => {
    void load().catch((e) => setError(readableError(e)))
  }, [user?.uid])
  async function decide(id: string, decision: 'approve' | 'decline') {
    if (!user) return
    setBusy(true)
    try {
      await apiRequest(user, '/me/follow-requests/' + id, 'POST', { decision })
      await load()
      onResolved()
    } catch (e) {
      setError(readableError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="card follow-requests" aria-label="Solicitações para seguir">
      <h2>Solicitações para seguir</h2>
      {error && <p role="alert">{error}</p>}
      {!page ? (
        <p role="status">Carregando…</p>
      ) : !page.items.length ? (
        <p>Nenhuma solicitação pendente.</p>
      ) : (
        page.items.map((r) => (
          <div className="follow-request" key={r.id}>
            <a href={'#/app/people/' + r.userId}>
              <strong>{r.name}</strong>
              <small>@{r.handle}</small>
            </a>
            <Button disabled={busy} onClick={() => void decide(r.id, 'approve')}>
              Aceitar solicitação
            </Button>
            <Button disabled={busy} variant="ghost" onClick={() => void decide(r.id, 'decline')}>
              Recusar solicitação
            </Button>
          </div>
        ))
      )}
      {page?.nextCursor && (
        <Button disabled={busy} onClick={() => void load(page.nextCursor!)}>
          Mais solicitações
        </Button>
      )}
    </section>
  )
}

interface SavedBook {
  id: string
  title: string
  author: string
  favorite: boolean
  hasBookmark: boolean
  noteCount: number
}
export function SavedReading() {
  const { user } = useAuth(),
    { setScope } = useWorkspace(),
    navigate = useNavigate()
  const [books, setBooks] = useState<SavedBook[] | null>(null),
    [error, setError] = useState('')
  useEffect(() => {
    let live = true
    if (user)
      void apiRequest<{ items: SavedBook[] }>(user, '/me/profile/reading-saved')
        .then((p) => {
          if (live) setBooks(p.items)
        })
        .catch((e) => {
          if (live) setError(readableError(e))
        })
    return () => {
      live = false
    }
  }, [user?.uid])
  return (
    <section className="profile-saved-reading">
      <h2>Leituras salvas</h2>
      <p className="t-caption">Favoritos, marcadores e anotações. Só você pode ver esta seção.</p>
      {error && <p role="alert">{error}</p>}
      {!books && !error && <p role="status">Carregando leituras…</p>}
      {books?.length === 0 && <p>Nenhuma leitura salva ainda.</p>}
      {books?.map((book) => (
        <article className="profile-activity-card" key={book.id}>
          <strong>{book.title}</strong>
          <small>{book.author}</small>
          <p>
            {[
              book.favorite ? 'Favorito' : null,
              book.hasBookmark ? 'Com marcador' : null,
              book.noteCount ? `${book.noteCount} anotações` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              setScope('personal')
              navigate('/app/reader/' + book.id)
            }}
          >
            Abrir leitura
          </Button>
        </article>
      ))}
    </section>
  )
}
