import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BookPlus, MessagesSquare, PenLine, Plus, UserCheck, UsersRound } from 'lucide-react'
import type { Page } from '../../server/src/community-contracts'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, readableError } from '../auth/api'
import { Sheet } from '../components/Sheet'
import { Button } from '../components/ui'
import { UserAvatar } from '../components/UserAvatar'
import { useWorkspace } from '../workspace/WorkspaceProvider'

interface Connection { id: string; handle: string; displayName: string; avatarId: string | null; following: boolean; isSelf: boolean }

/** Lista de seguidores ou de quem a pessoa segue, com seguir/deixar de seguir em cada linha. */
export function ConnectionsSheet({ personId, kind, onClose }: { personId: string; kind: 'followers' | 'following'; onClose: () => void }) {
  const { user } = useAuth()
  const [page, setPage] = useState<Page<Connection> | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  useEffect(() => {
    if (!user) return
    let live = true
    apiRequest<Page<Connection>>(user, `/people/${personId}/${kind}?limit=30`)
      .then((value) => live && setPage(value))
      .catch((err) => live && setError(readableError(err)))
    return () => { live = false }
  }, [user?.uid, personId, kind])
  async function more() {
    if (!user || !page?.nextCursor) return
    try {
      const next = await apiRequest<Page<Connection>>(user, `/people/${personId}/${kind}?limit=30&cursor=${encodeURIComponent(page.nextCursor)}`)
      setPage({ items: [...page.items, ...next.items], nextCursor: next.nextCursor })
    } catch (err) { setError(readableError(err)) }
  }
  async function toggle(person: Connection) {
    if (!user) return
    setBusy(person.id)
    try {
      const result = await apiRequest<{ value: boolean; state?: string }>(user, `/public/profiles/${person.id}/follow`, 'POST', { value: !person.following })
      setPage((current) => current && { ...current, items: current.items.map((item) => (item.id === person.id ? { ...item, following: !person.following && result.state !== 'requested' } : item)) })
      if (result.state === 'requested') setStatus(`Pedido enviado para ${person.displayName}.`)
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(null)
    }
  }
  return (
    <Sheet title={kind === 'followers' ? 'Seguidores' : 'Seguindo'} onClose={onClose} className="action-sheet">
      {error && <p role="alert" className="access-error">{error}</p>}
      {status && <p role="status" className="toast-status">{status}</p>}
      {!page && !error && <span className="skeleton" style={{ display: 'block', height: 120, borderRadius: 16 }} aria-hidden="true" />}
      {page && !page.items.length && <p className="soft-empty">{kind === 'followers' ? 'Ninguém por aqui ainda.' : 'Ainda não segue ninguém.'}</p>}
      <ul className="people-list">
        {page?.items.map((person) => (
          <li key={person.id}>
            <Link to={`/app/people/${person.id}`} onClick={onClose} className="people-list__who">
              <UserAvatar name={person.displayName} avatarId={person.avatarId} size="md" />
              <span><strong>{person.displayName}</strong><small>@{person.handle}</small></span>
            </Link>
            {!person.isSelf && (
              <button type="button" className={`pill-button ${person.following ? '' : 'pill-button--solid'}`} disabled={busy === person.id} aria-busy={busy === person.id} onClick={() => void toggle(person)}>
                {person.following ? <><UserCheck size={14} aria-hidden="true" />Seguindo</> : 'Seguir'}
              </button>
            )}
          </li>
        ))}
      </ul>
      {page?.nextCursor && <Button variant="secondary" onClick={() => void more()}>Mostrar mais</Button>}
      {kind === 'followers' && <p className="t-caption" style={{ marginTop: 12 }}>Contas privadas que você não segue podem não aparecer para visitantes.</p>}
    </Sheet>
  )
}

/** Botão flutuante "+" do perfil: abre só as criações que a conta pode fazer agora. */
export function CreateFab() {
  const { user } = useAuth()
  const { clubs, setScope } = useWorkspace()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  if (!user?.emailVerified) return null
  const go = (path: string) => { setOpen(false); navigate(path) }
  return (
    <>
      <button type="button" className="fab" aria-label="Criar" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Plus size={28} strokeWidth={2.2} />
      </button>
      {open && (
        <Sheet title="Criar" onClose={() => setOpen(false)} className="action-sheet">
          <div className="action-menu">
            <button type="button" onClick={() => go('/app/community?publicar=1')}>
              <span className="action-menu__icon"><PenLine size={19} /></span>
              <span>Nova publicação<small>Texto, fotos ou enquete na comunidade</small></span>
            </button>
            {clubs.map((club) => (
              <button key={club.id} type="button" onClick={() => { setScope(club.id); go('/app/forum?novo=1') }}>
                <span className="action-menu__icon"><MessagesSquare size={19} /></span>
                <span>Nova discussão<small>No fórum de {club.name}</small></span>
              </button>
            ))}
            <button type="button" onClick={() => go('/app/clubs?criar=1')}>
              <span className="action-menu__icon"><UsersRound size={19} /></span>
              <span>Novo clube<small>Você organiza e convida quem quiser</small></span>
            </button>
            <button type="button" onClick={() => go('/app/library/gerenciar?importar=1')}>
              <span className="action-menu__icon"><BookPlus size={19} /></span>
              <span>Adicionar livro<small>Importar EPUB ou buscar no catálogo</small></span>
            </button>
          </div>
        </Sheet>
      )}
    </>
  )
}
