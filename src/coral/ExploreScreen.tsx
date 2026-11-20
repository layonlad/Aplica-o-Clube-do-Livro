import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BookPlus, Castle, ChartNoAxesColumn, Heart, Landmark, MessageCircle, Plus, Rocket, Search, UserCheck, UserPlus, UsersRound, X, type LucideIcon } from 'lucide-react'
import type { Page, PostDto } from '../../server/src/community-contracts'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, peekCached, publicRequest, readCached, readableError } from '../auth/api'
import { Sheet } from '../components/Sheet'
import { UserAvatar } from '../components/UserAvatar'
import { cachedSocialRead, socialRead } from '../community/social-api'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import type { WorkspaceState } from '../../server/src/workspace-model'
import { useDiscoverClubs } from './data'
import { BookCover, compact, Hero, HeroBell, HeroIcon, SectionHead, SheetBody } from './kit'
import { ClubTile } from './pieces'
import { FreeBooksTeaser } from './FreeBooksScreen'

type Metadata = NonNullable<WorkspaceState['books'][number]['metadata']>
interface CatalogEntry { key: string; title: string; author: string; category: string; metadata: Metadata }
interface Discover {
  books: { title: string; author: string; posts: number }[]
  sections: Record<'featured' | 'reviews' | 'discussions' | 'recommendations', { id: string; body: string; bookTitle: string; bookAuthor: string; authorName: string; likes: number; comments: number }[]>
}
interface Person { id: string; handle: string; displayName: string; bio: string; genres: string[]; avatarId?: string | null }

/** Categorias da referência: o rótulo em português e o assunto usado no catálogo aberto (Open Library). */
const categories: { id: string; label: string; subject: string; icon: LucideIcon }[] = [
  { id: 'romance', label: 'Romance', subject: 'romance', icon: Heart },
  { id: 'fantasia', label: 'Fantasia', subject: 'fantasy', icon: Castle },
  { id: 'negocios', label: 'Negócios', subject: 'business', icon: ChartNoAxesColumn },
  { id: 'classicos', label: 'Clássicos', subject: 'classics', icon: Landmark },
  { id: 'scifi', label: 'Sci-fi', subject: 'science fiction', icon: Rocket },
]

export function ExploreScreen() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState(params.get('q') ?? '')
  const search = (params.get('q') ?? '').trim()
  const category = categories.find((item) => item.id === params.get('categoria')) ?? null
  const [discover, setDiscover] = useState<Discover | null>(() => peekCached(null, '/public/discover') ?? null)
  const [catalog, setCatalog] = useState<{ key: string; items: CatalogEntry[]; error: string } | null>(null)
  const [people, setPeople] = useState<Person[] | null>(null)
  const [book, setBook] = useState<{ title: string; author: string; metadata?: Metadata; posts?: number } | null>(null)
  const clubs = useDiscoverClubs(search || category?.label || '')

  useEffect(() => { if (params.get('busca')) input.current?.focus() }, [params])
  useEffect(() => {
    let live = true
    readCached(null, '/public/discover', () => publicRequest<Discover>('/public/discover')).then((value) => live && setDiscover(value)).catch(() => live && setDiscover({ books: [], sections: { featured: [], reviews: [], discussions: [], recommendations: [] } }))
    return () => { live = false }
  }, [])
  // Catálogo: uma consulta por vez (o servidor limita o ritmo); a categoria ou o texto pesquisado.
  // Sem busca nem categoria: lançamentos (livros publicados pela primeira vez em 2025 ou 2026 no catálogo aberto).
  const catalogKey = search.length >= 2 ? `q=${encodeURIComponent(search)}` : category ? `genre=${encodeURIComponent(category.subject)}` : `q=${encodeURIComponent('first_publish_year:[2025 TO 2026]')}`
  useEffect(() => {
    if (!catalogKey) { setCatalog(null); return }
    let live = true
    const path = `/catalog?${catalogKey}`
    setCatalog({ key: catalogKey, items: peekCached<{items: CatalogEntry[]}>(null, path)?.items ?? [], error: '' })
    // O catálogo aceita uma consulta por segundo no servidor: espera e tenta de novo (até 3 vezes).
    const attempt = (left: number): Promise<{ items: CatalogEntry[] }> =>
      readCached(null, path, () => publicRequest<{ items: CatalogEntry[] }>(path)).catch((err) =>
        left > 0 && live && /CATALOG_BUSY|Aguarde/i.test(`${(err as { code?: string }).code ?? ''} ${readableError(err)}`)
          ? new Promise((resolve) => setTimeout(resolve, 1300)).then(() => { if (live) return attempt(left - 1); throw err })
          : Promise.reject(err),
      )
    attempt(3)
      .then((value) => live && setCatalog({ key: catalogKey, items: value.items, error: '' }))
      .catch((err) => live && setCatalog({ key: catalogKey, items: [], error: readableError(err) }))
    return () => { live = false }
  }, [catalogKey])
  useEffect(() => {
    let live = true
    const filter = search.length >= 2 ? `q=${encodeURIComponent(search)}` : category ? `genre=${encodeURIComponent(category.label === 'Sci-fi' ? 'Ficção científica' : category.label)}` : ''
    cachedSocialRead<Page<Person>>(user, `/public/profiles?limit=8${filter ? '&' + filter : ''}`).then((value) => live && setPeople(value.items)).catch(() => live && setPeople([]))
    return () => { live = false }
  }, [user?.uid, user?.emailVerified, search, category?.id])

  function submit(value: string) {
    const next = new URLSearchParams(params)
    next.delete('busca')
    if (value.trim().length >= 2) next.set('q', value.trim())
    else next.delete('q')
    setParams(next, { replace: true })
  }
  function pick(id: string) {
    const next = new URLSearchParams(params)
    if (next.get('categoria') === id) next.delete('categoria')
    else next.set('categoria', id)
    setParams(next, { replace: true })
  }
  const trending = discover?.books ?? []
  const discussions = discover ? [...discover.sections.discussions, ...discover.sections.featured.filter((item) => !discover.sections.discussions.some((other) => other.id === item.id))].slice(0, 4) : []

  return (
    <div className="explore-screen">
      <Hero
        title="Explorar"
        subtitle="Descubra livros, clubes e pessoas que amam ler."
        subtitleBelow
        actions={<><HeroBell /><HeroIcon label="Pesquisar" onClick={() => input.current?.focus()}><Search size={21} strokeWidth={1.9} /></HeroIcon></>}
      >
        <form className="search-field" role="search" onSubmit={(event) => { event.preventDefault(); submit(query) }}>
          <Search size={19} aria-hidden="true" />
          <input ref={input} type="search" aria-label="Buscar livros, clubes, autoras ou temas" placeholder="Buscar livros, clubes, autoras ou temas" minLength={2} maxLength={100} value={query} onChange={(event) => setQuery(event.target.value)} />
          {query && <button type="button" className="icon-button" aria-label="Limpar busca" onClick={() => { setQuery(''); submit('') }}><X size={18} /></button>}
        </form>
        <div className="filter-pills category-pills" role="group" aria-label="Categorias">
          {categories.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" aria-pressed={category?.id === id} onClick={() => pick(id)}>
              <Icon size={15} aria-hidden="true" />{label}
            </button>
          ))}
        </div>

      </Hero>
      <SheetBody className="explore-sheet">
        {search && <p className="explore-result-note">Resultados para “{search}”</p>}

        {!search && (
          <section aria-labelledby="explore-trending">
            <SectionHead id="explore-trending" title="Livros em alta" to="/app/community" linkLabel="Ver todos" />
            {trending.length ? (
              <div className="h-scroll">
                {trending.map((item, index) => (
                  <button key={`${item.title}-${item.author}`} type="button" className="cover-button" onClick={() => setBook(item)} aria-label={`${index + 1}º em alta: ${item.title}, ${item.posts} publicações`}>
                    <BookCover title={item.title} author={item.author} width={92} ratio={0.86} rank={index + 1} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="soft-empty">Quando a comunidade falar de livros, os mais comentados do mês aparecem aqui.</p>
            )}
          </section>
        )}

        <section aria-labelledby="explore-clubs">
          <SectionHead id="explore-clubs" title={search ? 'Clubes' : 'Clubes populares'} to="/app/clubs" />
          <div className="h-scroll">
            {clubs.page?.items.map((club) => (
              <ClubTile key={club.id} name={club.name} accent={club.accent} coverMediaId={club.coverMediaId} publicMedia onOpen={() => navigate(`/app/clubs?clube=${club.id}`)} />
            ))}
            {!clubs.page && [0, 1, 2].map((key) => <span key={key} className="skeleton skeleton-tile" aria-hidden="true" />)}
          </div>
          {clubs.page && !clubs.page.items.length && <p className="soft-empty">Nenhum clube aberto encontrado{search ? ` para “${search}”` : ''}.</p>}
        </section>

        {!search && !category && <FreeBooksTeaser />}

        {catalog && (
          <section aria-labelledby="explore-catalog">
            <SectionHead id="explore-catalog" title={search ? 'Livros' : category ? `Livros de ${category.label}` : 'Lançamentos'} />
            <div className="h-scroll">
              {catalog.items.map((item) => (
                <button key={item.key} type="button" className="cover-button" onClick={() => setBook(item)} aria-label={`${item.title}, de ${item.author}`}>
                  <BookCover title={item.title} author={item.author} image={item.metadata.cover} width={search || category ? 104 : 86} ratio={search || category ? 0.82 : 1.05} />
                </button>
              ))}
              {!catalog.items.length && !catalog.error && [0, 1, 2, 3].map((key) => <span key={key} className="skeleton" style={{ width: 104, aspectRatio: '0.82', borderRadius: 6 }} aria-hidden="true" />)}
            </div>
            {catalog.error && <p className="access-error" role="alert">{catalog.error}</p>}
          </section>
        )}


        <section aria-labelledby="explore-people">
          <SectionHead id="explore-people" title={search ? 'Pessoas' : 'Leitores recomendados'} />
          {people === null ? (
            <span className="skeleton" style={{ display: 'block', height: 64, borderRadius: 16 }} aria-hidden="true" />
          ) : people.length ? (
            <div className="h-scroll">
              {people.map((person) => <PersonChip key={person.id} person={person} />)}
            </div>
          ) : (
            <p className="soft-empty">Ninguém encontrado{search ? ` para “${search}”` : ''}.</p>
          )}
        </section>

        {search ? (
          <PostResults query={search} />
        ) : (
          <section aria-labelledby="explore-highlights">
            <SectionHead id="explore-highlights" title="Destaques da comunidade" to="/app/community" />
            {discussions.length ? (
              <div className="highlight-list">
                {discussions.map((item) => (
                  <Link key={item.id} className="highlight-card" to={`/app/community?post=${item.id}`}>
                    <BookCover title={item.bookTitle || item.body.slice(0, 30)} author={item.bookAuthor} width={92} ratio={1.08} />
                    <span className="highlight-card__body">
                      <span className="highlight-card__label"><UsersRound size={14} aria-hidden="true" />{item.comments > 0 ? 'Discussão em alta' : 'Em destaque'}</span>
                      <strong>{item.body}</strong>
                      <span className="highlight-card__meta"><span><MessageCircle size={14} aria-hidden="true" />{item.comments} comentário{item.comments === 1 ? '' : 's'}</span><span><Heart size={14} aria-hidden="true" />{compact(item.likes)} curtida{item.likes === 1 ? '' : 's'}</span></span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="soft-empty">As conversas mais comentadas do mês aparecem aqui.</p>
            )}
          </section>
        )}
      </SheetBody>
      {book && <BookDetails book={book} onClose={() => setBook(null)} />}
    </div>
  )
}

/** Pessoa sugerida com o botão real de seguir (ou pedir para seguir, em perfil privado). */
function PersonChip({ person }: { person: Person }) {
  const { user } = useAuth()
  const { snapshot } = useWorkspace()
  const [state, setState] = useState<'unknown' | 'self' | 'follow' | 'request' | 'following' | 'requested'>('unknown')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!user?.emailVerified) { setState('follow'); return }
    let live = true
    apiRequest<{ relation: 'self' | 'follow' | 'request' | 'following' | 'requested' }>(user, `/public/profiles/${person.id}`)
      .then((value) => live && setState(value.relation))
      .catch(() => live && setState('follow'))
    return () => { live = false }
  }, [user?.uid, user?.emailVerified, person.id, snapshot?.actorId])
  if (state === 'self') return null
  async function toggle() {
    if (!user?.emailVerified) return
    setBusy(true)
    setError('')
    try {
      const on = !(state === 'following' || state === 'requested')
      const result = await apiRequest<{ value: boolean; state?: string }>(user, `/public/profiles/${person.id}/follow`, 'POST', { value: on })
      setState(on ? (result.state === 'requested' ? 'requested' : 'following') : 'follow')
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }
  const following = state === 'following' || state === 'requested'
  return (
    <div className="person-chip">
      <Link to={`/app/people/${person.id}`} className="person-chip__who">
        <UserAvatar name={person.displayName} avatarId={person.avatarId} size="md" />
        <span><strong>{person.displayName}</strong><small>{person.genres.slice(0, 2).join(' · ') || `@${person.handle}`}</small></span>
      </Link>
      {user?.emailVerified ? (
        <button type="button" className={`follow-dot ${following ? 'is-on' : ''}`} aria-label={following ? (state === 'requested' ? `Cancelar pedido para seguir ${person.displayName}` : `Deixar de seguir ${person.displayName}`) : `Seguir ${person.displayName}`} aria-pressed={following} aria-busy={busy} disabled={busy || state === 'unknown'} onClick={() => void toggle()}>
          {following ? <UserCheck size={16} /> : <Plus size={16} />}
        </button>
      ) : (
        <Link className="follow-dot" to="/account" aria-label="Entre para seguir"><UserPlus size={16} /></Link>
      )}
      {error && <span className="sr-only" role="alert">{error}</span>}
    </div>
  )
}

function PostResults({ query }: { query: string }) {
  const { user } = useAuth()
  const [page, setPage] = useState<Page<PostDto> | null>(null)
  useEffect(() => {
    let live = true
    setPage(null)
    socialRead<Page<PostDto>>(user, `/public/posts?q=${encodeURIComponent(query)}&limit=6`).then((value) => live && setPage(value)).catch(() => live && setPage({ items: [], nextCursor: null }))
    return () => { live = false }
  }, [query, user?.uid])
  return (
    <section aria-labelledby="explore-posts">
      <SectionHead id="explore-posts" title="Publicações" to={`/app/community?q=${encodeURIComponent(query)}`} />
      {page?.items.length ? (
        <div className="highlight-list">
          {page.items.map((post) => (
            <Link key={post.id} className="highlight-card" to={`/app/community?post=${post.id}`}>
              <BookCover title={post.bookTitle || post.author.name} author={post.bookAuthor} width={72} ratio={0.9} />
              <span className="highlight-card__body">
                <span className="highlight-card__label">{post.author.name}</span>
                <strong>{post.body}</strong>
                <span className="highlight-card__meta"><span><MessageCircle size={14} aria-hidden="true" />{post.comments}</span><span><Heart size={14} aria-hidden="true" />{post.likes}</span></span>
              </span>
            </Link>
          ))}
        </div>
      ) : page ? <p className="soft-empty">Nenhuma publicação com “{query}”.</p> : <span className="skeleton" style={{ display: 'block', height: 80, borderRadius: 16 }} aria-hidden="true" />}
    </section>
  )
}

/** Detalhes de um livro encontrado: dados do catálogo e ações reais (biblioteca, conversas). */
function BookDetails({ book, onClose }: { book: { title: string; author: string; metadata?: Metadata; posts?: number }; onClose: () => void }) {
  const { addToPersonal, busy } = useWorkspace()
  const navigate = useNavigate()
  const [message, setMessage] = useState('')
  const meta = book.metadata
  return (
    <Sheet title="Detalhes do livro" onClose={onClose} className="action-sheet">
      <div className="book-details">
        <BookCover title={book.title} author={book.author} image={meta?.cover} width={112} ratio={0.68} />
        <div>
          <h3>{book.title}</h3>
          <p>{book.author}</p>
          <dl>
            {meta?.year && <><dt>Ano</dt><dd>{meta.year}</dd></>}
            {meta?.pages && <><dt>Páginas</dt><dd>{meta.pages}</dd></>}
            {meta?.ratingAverage && <><dt>Nota no catálogo</dt><dd>{meta.ratingAverage.toFixed(1)}{meta.ratingCount ? ` (${compact(meta.ratingCount)})` : ''}</dd></>}
            {book.posts !== undefined && <><dt>Na comunidade</dt><dd>{book.posts} publicação{book.posts === 1 ? '' : 'ões'} no mês</dd></>}
          </dl>
        </div>
      </div>
      <div className="action-menu">
        <button type="button" disabled={busy} onClick={() => void addToPersonal({ title: book.title, author: book.author, ...(meta ? { metadata: meta } : {}) }).then((ok) => setMessage(ok ? 'Adicionado à sua biblioteca, em “Quero ler”.' : 'Não foi possível adicionar agora.'))}>
          <span className="action-menu__icon"><BookPlus size={19} /></span>
          <span>Adicionar à biblioteca<small>Entra como “Quero ler”</small></span>
        </button>
        <button type="button" onClick={() => { onClose(); navigate(`/app/community?q=${encodeURIComponent(book.title)}`) }}>
          <span className="action-menu__icon"><MessageCircle size={19} /></span>
          <span>Ver conversas sobre o livro</span>
        </button>
      </div>
      {message && <p role="status" className="toast-status" style={{ marginTop: 12 }}>{message}</p>}
      {meta?.source && <p className="t-caption" style={{ marginTop: 12 }}>Dados do catálogo aberto Open Library.</p>}
    </Sheet>
  )
}
