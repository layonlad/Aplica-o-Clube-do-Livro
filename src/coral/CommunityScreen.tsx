import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronDown, Compass, MessagesSquare, PenLine, Plus, SquarePen, UsersRound, X } from 'lucide-react'
import type { Page, PostDto } from '../../server/src/community-contracts'
import { useAuth } from '../auth/AuthProvider'
import { readableError } from '../auth/api'
import { Sheet } from '../components/Sheet'
import { Button } from '../components/ui'
import { PostCard, PostComposer } from '../community/ClubWall'
import { SharedBookComposer } from '../community/SharedBookComposer'
import { socialRead } from '../community/social-api'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import { useMyClubs } from './data'
import { Hero, HeroBell, HeroIcon, SectionHead, SheetBody } from './kit'
import { ClubArt } from './pieces'
import { MyClubCard } from './ClubsScreen'
import { NewsFeed } from './NewsFeed'

type Order = 'recent' | 'following' | 'saved'
type Tab = 'feed' | 'clubes' | 'noticias' | 'debates'
const tabs: { id: Tab; label: string }[] = [
  { id: 'feed', label: 'Feed' },
  { id: 'clubes', label: 'Clubes' },
  { id: 'noticias', label: 'Notícias' },
  { id: 'debates', label: 'Debates' },
]
const orders: { id: Order; label: string }[] = [
  { id: 'recent', label: 'Mais recentes' },
  { id: 'following', label: 'De quem eu sigo' },
  { id: 'saved', label: 'Salvos' },
]

export function CommunityScreen() {
  const { user } = useAuth()
  const { setScope } = useWorkspace()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const selected = params.get('post')
  const search = params.get('q') ?? ''
  const tab: Tab = selected || search ? 'feed' : (tabs.find((item) => item.id === params.get('secao'))?.id ?? 'feed')
  const debates = tab === 'debates'
  const [order, setOrder] = useState<Order>(params.get('aba') === 'seguindo' ? 'following' : params.get('aba') === 'salvos' ? 'saved' : 'recent')
  const [composing, setComposing] = useState<false | 'post' | 'debate'>(params.get('publicar') === '1' ? 'post' : false)
  const [revision, setRevision] = useState(0)
  const [page, setPage] = useState<Page<PostDto>>({ items: [], nextCursor: null })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)
  const clubs = useMyClubs()
  const verified = !!user?.emailVerified
  const filters = new URLSearchParams({
    ...(search ? { q: search } : {}),
    ...(debates ? { kind: 'question' } : {}),
    ...(!debates && order === 'following' ? { following: '1' } : {}),
    ...(!debates && order === 'saved' ? { saved: '1' } : {}),
  }).toString()
  const path = selected ? `/public/posts/${selected}` : `/public/posts?${filters}`

  useEffect(() => {
    if (tab === 'clubes' || tab === 'noticias') return
    let live = true
    setBusy(true)
    setError('')
    setPage({ items: [], nextCursor: null })
    const request = selected
      ? socialRead<PostDto>(user, path).then((post) => ({ items: [post], nextCursor: null }))
      : socialRead<Page<PostDto>>(user, path)
    request
      .then((value) => live && setPage(value))
      .catch((err) => live && setError(readableError(err)))
      .finally(() => live && setBusy(false))
    return () => { live = false }
  }, [user?.uid, user?.emailVerified, path, revision, tab])
  useEffect(() => {
    if (!sortOpen) return
    const close = (event: PointerEvent) => { if (!sortRef.current?.contains(event.target as Node)) setSortOpen(false) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setSortOpen(false) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key) }
  }, [sortOpen])

  async function more() {
    setBusy(true)
    setError('')
    try {
      const next = await socialRead<Page<PostDto>>(user, `/public/posts?${filters}${filters ? '&' : ''}cursor=${encodeURIComponent(page.nextCursor!)}`)
      setPage((value) => ({ items: [...value.items, ...next.items], nextCursor: next.nextCursor }))
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }
  const available = orders.filter((item) => verified || item.id === 'recent')
  function pickTab(next: Tab) {
    const value = new URLSearchParams(params)
    if (next === 'feed') value.delete('secao')
    else value.set('secao', next)
    setParams(value, { replace: true })
  }
  const showFeed = tab === 'feed' || tab === 'debates'

  return (
    <div className="community-screen">
      <Hero
        title="Comunidade"
        subtitle="Conecte-se, discuta e leia junto"
        small
        leading={<span className="hero-glyph" aria-hidden="true"><UsersRound size={28} /></span>}
        actions={<>
          <HeroBell />
          {verified ? (
            <HeroIcon label={debates ? 'Abrir debate' : 'Criar publicação'} onClick={() => setComposing(debates ? 'debate' : 'post')} expanded={!!composing}><SquarePen size={20} strokeWidth={1.9} /></HeroIcon>
          ) : (
            <HeroIcon label="Entre para publicar" to="/account"><SquarePen size={20} strokeWidth={1.9} /></HeroIcon>
          )}
        </>}
      />
      <SheetBody>
        {!selected && !search && (
          <div className="line-tabs community-tabs" role="tablist" aria-label="Seções da comunidade">
            {tabs.map((item) => (
              <button key={item.id} type="button" role="tab" id={`aba-${item.id}`} aria-selected={tab === item.id} aria-controls="community-panel" onClick={() => pickTab(item.id)}>{item.label}</button>
            ))}
          </div>
        )}
        <div id="community-panel" role={!selected && !search ? 'tabpanel' : undefined} aria-labelledby={!selected && !search ? `aba-${tab}` : undefined} className="community-panel">
        {tab === 'noticias' && <NewsFeed />}
        {tab === 'clubes' && <ClubsTab verified={verified} />}
        {tab === 'debates' && (
          <div className="debate-intro">
            <MessagesSquare size={20} aria-hidden="true" />
            <span><strong>Perguntas abertas para toda a comunidade</strong><small>Responda nos comentários ou proponha um tema novo.</small></span>
            {verified ? <button type="button" className="pill-button pill-button--solid" onClick={() => setComposing('debate')}>Abrir debate</button> : <Link className="pill-button" to="/account">Entrar</Link>}
          </div>
        )}
        {tab === 'feed' && (selected ? (
          <Link className="text-link" to="/app/community">← Voltar às novidades</Link>
        ) : (
          <section aria-labelledby="community-clubs">
            <SectionHead id="community-clubs" title="Seus clubes e comunidades" to="/app/clubs" />
            <div className="h-scroll stories">
              <Link className="story" to="/app/clubs?criar=1">
                <span className="story__ring story__ring--add"><span><Plus size={24} aria-hidden="true" /></span></span>
                <small>Criar clube</small>
              </Link>
              {clubs.items?.map((club) => (
                <button key={club.id} type="button" className="story" onClick={() => { setScope(club.id); navigate('/app') }} aria-label={`Abrir ${club.name}${club.active ? ', com atividade recente' : ''}`}>
                  <span className="story__ring">
                    <span><ClubArt accent={club.accent} coverMediaId={club.coverMediaId} book={club.currentBook} name={club.name} /></span>
                    {club.active && <span className="story__dot" aria-hidden="true" />}
                  </span>
                  <small>{club.name}</small>
                </button>
              ))}
              {verified && clubs.items === null && [0, 1, 2].map((key) => <span key={key} className="skeleton" style={{ width: 66, height: 66, borderRadius: '50%' }} aria-hidden="true" />)}
            </div>
          </section>
        ))}

        {tab === 'feed' && !selected && verified && <SharedBookComposer clubId={null} onPublished={() => setRevision((value) => value + 1)} />}

        {showFeed && <section aria-labelledby="community-feed">
          {!selected && !debates && (
            <div className="section-head">
              <h2 id="community-feed">{search ? `Sobre “${search}”` : 'Novidades da comunidade'}</h2>
              {search ? (
                <button type="button" className="sort-pill" onClick={() => { const next = new URLSearchParams(params); next.delete('q'); setParams(next, { replace: true }) }}>
                  Limpar <X size={14} aria-hidden="true" />
                </button>
              ) : available.length > 1 ? (
                <div className="sort-menu" ref={sortRef}>
                  <button type="button" className="sort-pill" aria-haspopup="listbox" aria-expanded={sortOpen} onClick={() => setSortOpen(!sortOpen)}>
                    {orders.find((item) => item.id === order)!.label} <ChevronDown size={15} aria-hidden="true" />
                  </button>
                  {sortOpen && (
                    <div className="sort-menu__list" role="listbox" aria-label="Ordenar novidades">
                      {available.map((item) => (
                        <button key={item.id} type="button" role="option" aria-selected={order === item.id} onClick={() => { setOrder(item.id); setSortOpen(false) }}>
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
          {error && (
            <div role="alert" className="access-error">
              {error}
              <button type="button" onClick={() => setRevision((value) => value + 1)}>Tentar novamente</button>
            </div>
          )}
          <div className="social-feed">
            {page.items.map((post) => (
              <PostCard
                key={post.id}
                clubId={null}
                post={post}
                onChanged={(value) => setPage((current) => ({ ...current, items: current.items.map((item) => (item.id === value.id ? value : item)) }))}
                onRemoved={() => setPage((current) => ({ ...current, items: current.items.filter((item) => item.id !== post.id) }))}
              />
            ))}
            {busy && !page.items.length && [0, 1].map((key) => <span key={key} className="skeleton" style={{ height: 170, borderRadius: 16 }} aria-hidden="true" />)}
          </div>
          {debates && <h2 id="community-feed" className="sr-only">Debates</h2>}
          {!busy && !error && !page.items.length && (
            <div className="soft-empty">
              <PenLine size={26} aria-hidden="true" />
              <h2 className="soft-empty__title">{debates ? 'Nenhum debate aberto' : order === 'saved' ? 'Nenhuma publicação salva' : order === 'following' ? 'Quem você segue ainda não publicou' : 'Há espaço para novas histórias'}</h2>
              {verified && (debates || order === 'recent') && <button type="button" className="pill-button" onClick={() => setComposing(debates ? 'debate' : 'post')}>{debates ? 'Abrir debate' : 'Criar publicação'}</button>}
              {!verified && <Link className="pill-button pill-button--solid" to="/account">Entre para publicar</Link>}
            </div>
          )}
          {page.nextCursor && (
            <div className="library-add">
              <Button variant="secondary" disabled={busy} aria-busy={busy} onClick={() => void more()}>Mais publicações</Button>
            </div>
          )}
        </section>}
        </div>
      </SheetBody>
      {composing && verified && (
        <Sheet title={composing === 'debate' ? 'Abrir debate' : 'Criar publicação'} onClose={() => setComposing(false)} className="composer-sheet">
          <PostComposer clubId={null} kind={composing === 'debate' ? 'question' : 'reflection'} onCancel={() => setComposing(false)} onPublished={() => { const wasDebate = composing === 'debate'; setComposing(false); if (!wasDebate) setOrder('recent'); setRevision((value) => value + 1) }} />
        </Sheet>
      )}
    </div>
  )
}

/** Aba Clubes: os clubes da pessoa com leitura e encontro do momento, e o caminho para descobrir outros. */
function ClubsTab({ verified }: { verified: boolean }) {
  const clubs = useMyClubs()
  const { setScope } = useWorkspace()
  const navigate = useNavigate()
  if (!verified)
    return (
      <div className="soft-empty">
        <UsersRound size={26} aria-hidden="true" />
        <h2 className="soft-empty__title">Entre para ver seus clubes</h2>
        <Link className="pill-button pill-button--solid" to="/account">Entrar ou criar conta</Link>
      </div>
    )
  return (
    <section aria-labelledby="community-my-clubs">
      <SectionHead id="community-my-clubs" title="Seus clubes" to="/app/clubs" linkLabel="Gerenciar" />
      {clubs.items === null ? (
        <div className="my-clubs-grid">{[0, 1].map((key) => <span key={key} className="skeleton" style={{ height: 250, borderRadius: 16 }} aria-hidden="true" />)}</div>
      ) : clubs.items.length ? (
        <div className="my-clubs-grid">
          {clubs.items.map((club) => <MyClubCard key={club.id} club={club} onOpen={() => { setScope(club.id); navigate('/app') }} />)}
        </div>
      ) : (
        <div className="soft-empty">
          <UsersRound size={26} aria-hidden="true" />
          <h2 className="soft-empty__title">Você ainda não participa de clubes</h2>
          <Link className="pill-button pill-button--solid" to="/app/clubs?criar=1">Criar clube</Link>
        </div>
      )}
      <div className="library-add">
        <Link className="pill-button" to="/app/clubs"><Compass size={16} aria-hidden="true" />Descobrir clubes</Link>
      </div>
    </section>
  )
}
