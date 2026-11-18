import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarDays, Plus, Search, Ticket, UsersRound, X } from 'lucide-react'
import type { Club } from '../../server/src/contracts'
import type { Page } from '../../server/src/community-contracts'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, readableError } from '../auth/api'
import { Sheet } from '../components/Sheet'
import { Button } from '../components/ui'
import { notificationChanged } from '../community/NotificationBell'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import { forgetClub, useDiscoverClubs, useMyClubs, type ClubSummary, type DiscoverClub } from './data'
import { BookCover, compact, Hero, HeroIcon, SectionHead, SheetBody } from './kit'
import { ClubArt } from './pieces'

interface Notice { id: string; kind: string; targetType: string; targetId: string; clubId: string | null; clubName: string | null; actorName: string; createdAt: string }
const PENDING_KEY = 'clube-livro-join-pending'
const readPending = (key: string): string[] => { try { return JSON.parse(localStorage.getItem(key) ?? '[]') } catch { return [] } }
const shortDate = (value: string) => new Date(value).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '')

export function ClubsScreen() {
  const { user } = useAuth()
  const { setScope, refresh } = useWorkspace()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [creating, setCreating] = useState(params.get('criar') === '1')
  const [joining, setJoining] = useState<DiscoverClub | null>(null)
  const pendingKey = PENDING_KEY + ':' + user?.uid
  const [pending, setPending] = useState<string[]>(() => readPending(pendingKey))
  const [invites, setInvites] = useState<Notice[] | null>(null)
  const [inviteBusy, setInviteBusy] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState('')
  const searchInput = useRef<HTMLInputElement>(null)
  const mine = useMyClubs()
  const discover = useDiscoverClubs(query.trim().length >= 2 ? query : '')
  const verified = !!user?.emailVerified
  const focus = params.get('clube')

  useEffect(() => {
    if (!verified) { setInvites([]); return }
    let live = true
    apiRequest<Page<Notice>>(user!, '/me/notifications?limit=50')
      .then((page) => live && setInvites(page.items.filter((item) => item.targetType === 'invite')))
      .catch(() => live && setInvites([]))
    return () => { live = false }
  }, [user?.uid, verified])
  useEffect(() => {
    if (!focus || !discover.page) return
    const club = discover.page.items.find((item) => item.id === focus)
    if (club && !(mine.items ?? []).some((item) => item.id === club.id)) setJoining(club)
    const next = new URLSearchParams(params)
    next.delete('clube')
    setParams(next, { replace: true })
  }, [focus, discover.page])

  function openClub(id: string) { setScope(id); navigate('/app') }
  async function answer(notice: Notice, accept: boolean) {
    if (!user) return
    setInviteBusy(notice.id)
    setInviteError('')
    try {
      if (accept) {
        const club = await apiRequest<Club>(user, `/me/invitations/${notice.targetId}/accept`, 'POST', {})
        notificationChanged()
        await refresh()
        forgetClub()
        openClub(club.id)
      } else {
        await apiRequest(user, `/me/invitations/${notice.targetId}/decline`, 'POST', {})
        notificationChanged()
        setInvites((items) => items?.filter((item) => item.id !== notice.id) ?? null)
      }
    } catch (err) {
      setInviteError(readableError(err))
    } finally {
      setInviteBusy(null)
    }
  }
  const myIds = new Set((mine.items ?? []).map((club) => club.id))
  const filteredMine = (mine.items ?? []).filter((club) => query.trim().length < 2 || `${club.name} ${club.description}`.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')))
  const discoverItems = (discover.page?.items ?? []).filter((club) => !myIds.has(club.id))

  return (
    <div className="clubs-screen">
      <Hero
        title="Clubes"
        subtitle="Leia, discuta e compartilhe com pessoas que amam livros como você."
        small
        leading={<span className="hero-glyph" aria-hidden="true"><UsersRound size={28} /></span>}
        actions={<>
          <HeroIcon label={searching ? 'Fechar busca' : 'Buscar clubes'} expanded={searching} onClick={() => { setSearching(!searching); if (searching) setQuery(''); else requestAnimationFrame(() => searchInput.current?.focus()) }}>{searching ? <X size={21} /> : <Search size={21} strokeWidth={1.9} />}</HeroIcon>
          {verified ? <HeroIcon label="Criar clube" onClick={() => setCreating(true)} expanded={creating}><Plus size={22} strokeWidth={2} /></HeroIcon> : <HeroIcon label="Entre para criar um clube" to="/account"><Plus size={22} /></HeroIcon>}
        </>}
      >
        {searching && (
          <div className="search-field">
            <Search size={19} aria-hidden="true" />
            <input ref={searchInput} type="search" aria-label="Buscar clubes" placeholder="Nome ou assunto do clube" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
        )}
      </Hero>
      <SheetBody>
        {verified && (
          <section aria-labelledby="clubs-mine">
            <SectionHead id="clubs-mine" title="Meus clubes" onLink={filteredMine.length > 2 ? () => setShowAll(!showAll) : undefined} linkLabel={showAll ? 'Mostrar menos' : `Ver todos (${filteredMine.length})`} />
            {mine.items === null ? (
              <div className="h-scroll">{[0, 1].map((key) => <span key={key} className="skeleton" style={{ width: 168, height: 250, borderRadius: 16 }} aria-hidden="true" />)}</div>
            ) : filteredMine.length ? (
              <div className={showAll ? 'my-clubs-grid' : 'h-scroll'}>
                {filteredMine.map((club) => <MyClubCard key={club.id} club={club} onOpen={() => openClub(club.id)} />)}
              </div>
            ) : (
              <div className="soft-empty">
                <UsersRound size={26} aria-hidden="true" />
                <strong>{query ? `Nenhum dos seus clubes tem “${query}”` : 'Você ainda não participa de clubes'}</strong>
                {!query && <span>Crie o seu ou descubra um grupo abaixo.</span>}
                {!query && <button type="button" className="pill-button pill-button--solid" onClick={() => setCreating(true)}>Criar clube</button>}
              </div>
            )}
          </section>
        )}

        {verified && !!invites?.length && (
          <section aria-labelledby="clubs-invites">
            <div className="section-head">
              <h2 id="clubs-invites">Convites <span className="count-badge">{invites.length}</span></h2>
            </div>
            <div className="invite-list">
              {invites.map((notice) => (
                <article key={notice.id} className="row-card invite-card">
                  <span className="row-card__media"><ClubArt accent="#7a4b5d" name={notice.clubName ?? 'Clube'} /></span>
                  <span className="row-card__body">
                    <strong>{notice.clubName ?? 'Clube'}</strong>
                    <span>Convite de {notice.actorName}</span>
                    <span className="row-card__meta"><span><Ticket size={14} aria-hidden="true" />{shortDate(notice.createdAt)}</span></span>
                  </span>
                  <span className="row-card__actions">
                    <button type="button" className="pill-button pill-button--solid" disabled={!!inviteBusy} aria-busy={inviteBusy === notice.id} onClick={() => void answer(notice, true)}>Aceitar</button>
                    <button type="button" className="pill-button" disabled={!!inviteBusy} onClick={() => void answer(notice, false)}>Recusar</button>
                  </span>
                </article>
              ))}
            </div>
            {inviteError && <p role="alert" className="access-error">{inviteError}</p>}
          </section>
        )}

        <section aria-labelledby="clubs-discover">
          <SectionHead id="clubs-discover" title="Descobrir clubes" onLink={discover.page?.nextCursor && !discover.loadingMore ? () => void discover.loadMore() : undefined} linkLabel="Ver mais" />
          {discover.error && <p role="alert" className="access-error">{discover.error}</p>}
          <div className="discover-list">
            {discoverItems.map((club) => {
              const requested = pending.includes(club.id)
              return (
                <article key={club.id} className="discover-card">
                  <span className="discover-card__media"><ClubArt accent={club.accent} coverMediaId={club.coverMediaId} publicMedia name={club.name} /></span>
                  <div className="discover-card__body">
                    <span className="tag">{club.visibility === 'public' ? 'Clube público' : 'Aceita pedidos'}</span>
                    <strong>{club.name}</strong>
                    {club.description && <p>{club.description}</p>}
                    <div className="discover-card__foot">
                      {verified ? (
                        <button type="button" className={`pill-button ${requested ? 'is-requested' : ''}`} disabled={requested} onClick={() => setJoining(club)}>
                          {requested ? 'Solicitado' : 'Participar'}
                        </button>
                      ) : (
                        <Link className="pill-button" to="/account">Entrar para participar</Link>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
            {!discover.page && [0, 1].map((key) => <span key={key} className="skeleton" style={{ height: 150, borderRadius: 16 }} aria-hidden="true" />)}
            {discover.page && !discoverItems.length && <p className="soft-empty">{query ? `Nenhum clube aberto com “${query}”.` : 'Nenhum outro clube aberto a novos leitores agora.'}</p>}
          </div>
          {verified && <p className="t-caption" style={{ marginTop: 12 }}>Tem um código de convite? <Link className="text-link" to="/invite">Usar código</Link></p>}
        </section>
      </SheetBody>

      {creating && verified && <CreateClub onClose={() => { setCreating(false); if (params.get('criar')) { const next = new URLSearchParams(params); next.delete('criar'); setParams(next, { replace: true }) } }} />}
      {joining && <JoinClub club={joining} onClose={() => setJoining(null)} onRequested={() => { const next = [...pending, joining.id]; setPending(next); try { localStorage.setItem(pendingKey, JSON.stringify(next)) } catch { /* sem armazenamento */ } setJoining(null) }} />}
    </div>
  )
}

function MyClubCard({ club, onOpen }: { club: ClubSummary; onOpen: () => void }) {
  return (
    <button type="button" className="my-club" onClick={onOpen} aria-label={`Abrir ${club.name}`}>
      <span className="my-club__top">
        <ClubArt accent={club.accent} coverMediaId={club.coverMediaId} book={club.currentBook} name={club.name} />
        {['owner', 'admin'].includes(club.role ?? '') && <span className="club-tile__tag">{club.role === 'owner' ? 'Você organiza' : 'Administração'}</span>}
        <span className="my-club__title">
          <strong>{club.name}</strong>
          {club.memberCount != null && <small><UsersRound size={13} aria-hidden="true" />{club.memberCount === 1 ? '1 membro' : `${compact(club.memberCount)} membros`}</small>}
        </span>
      </span>
      <span className="my-club__book">
        {club.currentBook ? (
          <>
            <BookCover title={club.currentBook.title} author={club.currentBook.author} width={40} ratio={0.7} />
            <span><small>Lendo agora</small><strong>{club.currentBook.title}</strong><small>{club.currentBook.author}</small></span>
          </>
        ) : (
          <span><small>Leitura do clube</small><strong>Ainda não escolhida</strong></span>
        )}
      </span>
      <span className="my-club__event"><CalendarDays size={14} aria-hidden="true" />{club.nextEvent ? <>Próximo encontro: <strong>{shortDate(club.nextEvent.date)}</strong></> : 'Sem encontro marcado'}</span>
    </button>
  )
}

function CreateClub({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const { refresh, setScope } = useWorkspace()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!user || busy) return
    setBusy(true)
    setError('')
    try {
      const club = await apiRequest<Club>(user, '/clubs', 'POST', { name: name.trim() })
      await refresh()
      forgetClub()
      setScope(club.id)
      navigate(`/clubs/${club.id}`)
    } catch (err) {
      setError(readableError(err))
      setBusy(false)
    }
  }
  return (
    <Sheet title="Criar clube" onClose={onClose} className="action-sheet">
      <form className="stack-sheet" onSubmit={submit}>
        <label className="field">Nome do clube<input autoFocus required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Clube das Quintas" /></label>
        <p className="t-caption">O clube começa privado. Depois você escolhe a capa, a descrição, quem pode encontrá-lo e convida pessoas.</p>
        {error && <p role="alert" className="access-error">{error}</p>}
        <Button disabled={busy || name.trim().length < 2} aria-busy={busy}>{busy ? 'Criando…' : 'Criar clube'}</Button>
      </form>
    </Sheet>
  )
}

function JoinClub({ club, onClose, onRequested }: { club: DiscoverClub; onClose: () => void; onRequested: () => void }) {
  const { user } = useAuth()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!user || busy) return
    setBusy(true)
    setError('')
    try {
      await apiRequest(user, `/clubs/${club.id}/join-requests`, 'POST', { message })
      onRequested()
    } catch (err) {
      const text = readableError(err)
      if (/já|pendente|already/i.test(text)) onRequested()
      else setError(text)
      setBusy(false)
    }
  }
  return (
    <Sheet title={`Participar de ${club.name}`} onClose={onClose} className="action-sheet">
      <form className="stack-sheet" onSubmit={submit}>
        <p className="t-caption">Quem organiza o clube recebe seu pedido e aprova a entrada. Você recebe uma notificação quando for aceito.</p>
        <label className="field">Mensagem para o clube (opcional)<textarea maxLength={1000} rows={3} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Conte um pouco sobre o que você gosta de ler" /></label>
        {error && <p role="alert" className="access-error">{error}</p>}
        <Button disabled={busy} aria-busy={busy}>{busy ? 'Enviando…' : 'Pedir para participar'}</Button>
      </form>
    </Sheet>
  )
}
