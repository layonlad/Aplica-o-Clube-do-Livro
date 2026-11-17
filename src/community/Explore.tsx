import { useEffect, useRef, useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { publicRequest, readableError } from '../auth/api'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import { Button, CoverArt } from '../components/ui'
import { UserAvatar } from '../components/UserAvatar'
import { DiscoverClubs } from '../clubs/DiscoverClubs'
import { socialRead } from './social-api'
import type { Page, PostDto } from '../../server/src/community-contracts'
import type { CatalogEntry } from '../../server/src/catalog'
import type { SocialProfileDto } from './SocialProfile'
import './community.css'
type Discovery = {
  books: { title: string; author: string; posts: number }[]
  sections: Record<
    string,
    {
      id: string
      body: string
      bookTitle: string
      bookAuthor: string
      authorName: string
      likes: number
      comments: number
    }[]
  >
}
export function Explore() {
  const { user } = useAuth(),
    { addToPersonal, busy } = useWorkspace(),
    [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [genre, setGenre] = useState(''),
    [activeGenre, setActiveGenre] = useState(''),
    [bookAuthor, setBookAuthor] = useState(''),
    [page, setPage] = useState<Page<SocialProfileDto>>({ items: [], nextCursor: null }),
    [books, setBooks] = useState<CatalogEntry[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [message, setMessage] = useState('')
  const [discovery, setDiscovery] = useState<Discovery | null>(null)
  const [kind, setKind] = useState<'all' | 'people' | 'posts' | 'books'>('all'),
    [posts, setPosts] = useState<PostDto[]>([]),
    field = useRef<HTMLInputElement>(null)
  // Pesquisar abre já com o teclado no campo.
  useEffect(() => {
    field.current?.focus({ preventScroll: true })
  }, [])
  // Busca enquanto digita (a partir de 2 letras), sem precisar apertar o botão.
  useEffect(() => {
    const term = query.trim()
    const timer = window.setTimeout(() => setSearch(term.length >= 2 ? term : ''), 350)
    return () => window.clearTimeout(timer)
  }, [query])
  useEffect(() => {
    if (!search) {
      setPosts([])
      return
    }
    let live = true
    socialRead<Page<PostDto>>(user, '/public/posts?' + new URLSearchParams({ q: search }))
      .then((value) => live && setPosts(value.items))
      .catch(() => live && setPosts([]))
    return () => {
      live = false
    }
  }, [user?.uid, user?.emailVerified, search])
  useEffect(() => {
    let live = true
    socialRead<Discovery>(user, '/public/discover')
      .then((value) => live && setDiscovery(value))
      .catch((err) => live && setError(readableError(err)))
    return () => {
      live = false
    }
  }, [user?.uid, user?.emailVerified])
  const filters = new URLSearchParams({
    ...(search ? { q: search } : {}),
    ...(activeGenre ? { genre: activeGenre } : {}),
  }).toString()
  useEffect(() => {
    let live = true
    setError('')
    setLoading(true)
    setPage({ items: [], nextCursor: null })
    socialRead<Page<SocialProfileDto>>(user, '/public/profiles?' + filters)
      .then((value) => live && setPage(value))
      .catch((err) => live && setError(readableError(err)))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [user?.uid, user?.emailVerified, filters])
  async function catalog() {
    setLoading(true)
    setError('')
    try {
      setBooks(
        (
          await publicRequest<{ items: CatalogEntry[] }>(
            '/catalog?' +
              new URLSearchParams({
                ...(query.trim() ? { q: query.trim() } : {}),
                ...(bookAuthor.trim() ? { author: bookAuthor.trim() } : {}),
                ...(genre.trim() ? { genre: genre.trim() } : {}),
              }),
          )
        ).items,
      )
    } catch (err) {
      setError(readableError(err))
    } finally {
      setLoading(false)
    }
  }
  async function more() {
    try {
      const next = await socialRead<Page<SocialProfileDto>>(
        user,
        `/public/profiles?${filters}&cursor=${encodeURIComponent(page.nextCursor!)}`,
      )
      setPage((value) => ({ items: [...value.items, ...next.items], nextCursor: next.nextCursor }))
    } catch (err) {
      setError(readableError(err))
    }
  }
  return (
    <div className="stack-lg">
      <h1 className="sr-only">Pesquisar</h1>
      <form
        className="global-search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
          setSearch(query.trim())
          setActiveGenre(genre.trim())
          field.current?.blur()
          if (kind === 'books') void catalog()
        }}
      >
        <Search size={20} aria-hidden="true" />
        <input
          ref={field}
          type="search"
          aria-label="Pesquisar pessoas, publicações e livros"
          placeholder="Pesquisar"
          maxLength={100}
          value={query}
          enterKeyHint="search"
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button
            type="button"
            className="icon-button"
            aria-label="Limpar pesquisa"
            onClick={() => {
              setQuery('')
              setBooks([])
              field.current?.focus()
            }}
          >
            <X size={18} />
          </button>
        )}
      </form>
      <div className="filter-pills search-kinds" role="group" aria-label="O que pesquisar">
        {(
          [
            ['all', 'Tudo'],
            ['people', 'Pessoas'],
            ['posts', 'Publicações'],
            ['books', 'Livros'],
          ] as const
        ).map(([value, label]) => (
          <button
            type="button"
            key={value}
            className={kind === value ? 'active' : ''}
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {kind === 'books' && (
        <details className="search-filters">
          <summary>
            <SlidersHorizontal size={16} aria-hidden="true" /> Filtros de livros
          </summary>
          <label>
            Gênero literário
            <input maxLength={40} value={genre} onChange={(event) => setGenre(event.target.value)} />
          </label>
          <label>
            Autor do livro
            <input
              minLength={2}
              maxLength={100}
              value={bookAuthor}
              onChange={(event) => setBookAuthor(event.target.value)}
            />
          </label>
        </details>
      )}
      {kind === 'books' && (
        <div className="search-books-action">
          <Button
            type="button"
            variant="secondary"
            disabled={loading || (!query.trim() && !bookAuthor.trim() && !genre.trim())}
            onClick={() => void catalog()}
          >
            Buscar livros
          </Button>
          <small>A busca de livros consulta a Open Library e não autoriza baixar obras.</small>
        </div>
      )}
      {search && (kind === 'all' || kind === 'posts') && (
        <section>
          <h2>Publicações</h2>
          {!posts.length && <p className="t-caption">Nenhuma publicação encontrada.</p>}
          <div className="search-post-list">
            {posts.map((post) => (
              <Link key={post.id} className="search-post" to={`/app/community?post=${post.id}`}>
                <UserAvatar name={post.author.name} avatarId={post.author.avatarId} size="sm" />
                <span>
                  <strong>{post.author.name}</strong>
                  <span>{post.body}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {(kind === 'all' || kind === 'people') && <section>
        <h2>{search ? 'Pessoas' : 'Leitores para conhecer'}</h2>
        <div className="profile-discovery">
          {page.items.map((profile) => (
            <article key={profile.id} className="person-card">
              <UserAvatar name={profile.displayName} avatarId={profile.avatarId} size="lg" />
              <span className="eyebrow">@{profile.handle}</span>
              <h3>
                <Link to={`/app/people/${profile.id}`}>{profile.displayName}</Link>
              </h3>
              <p>{profile.bio}</p>
              <small>{profile.genres.join(' · ')}</small>
            </article>
          ))}
        </div>
        {!loading && !page.items.length && (
          <p>Os perfis que escolheram ser públicos aparecerão aqui.</p>
        )}
        {page.nextCursor && (
          <Button variant="secondary" onClick={() => void more()}>
            Mais leitores
          </Button>
        )}
      </section>}
      {!!books.length && (
        <section>
          <h2>Livros encontrados</h2>
          <div className="catalog-results">
            {books.map((book) => (
              <article key={book.key}>
                <CoverArt title={book.title} author={book.author} />
                <div>
                  <h3>{book.title}</h3>
                  <p>{book.author}</p>
                  <small>{book.metadata.license}</small>
                  <Button
                    disabled={busy}
                    variant="secondary"
                    onClick={() =>
                      void addToPersonal(book).then(
                        (ok) => ok && setMessage(`${book.title} está na sua biblioteca pessoal.`),
                      )
                    }
                  >
                    Adicionar à minha biblioteca
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {discovery && !search && kind === 'all' && (
        <>
          <section>
            <h2>Livros mais conversados</h2>
            <p className="t-caption">
              Referências em publicações visíveis da comunidade nos últimos 30 dias.
            </p>
            {!discovery.books.length && (
              <p className="empty-inline">
                Nenhum livro foi citado na comunidade nos últimos 30 dias. Seja a primeira pessoa a
                comentar uma leitura.
              </p>
            )}
            <div className="profile-discovery">
              {discovery.books.map((book, i) => (
                <article key={i}>
                  <h3>{book.title}</h3>
                  <p>
                    {book.author} · {book.posts} publicação(ões)
                  </p>
                  <Button
                    disabled={busy}
                    variant="secondary"
                    onClick={() =>
                      void addToPersonal(book).then(
                        (ok) => ok && setMessage('Título adicionado à sua biblioteca pessoal.'),
                      )
                    }
                  >
                    Adicionar à minha biblioteca
                  </Button>
                </article>
              ))}
            </div>
          </section>
          {Object.entries({
            featured: 'Publicações em destaque',
            reviews: 'Resenhas recentes',
            discussions: 'Discussões com mais respostas',
            recommendations: 'Indicações de leitores',
          }).map(([key, title]) => (
            <section key={key}>
              <h2>{title}</h2>
              <div className="profile-discovery">
                {discovery.sections[key]?.map((post) => (
                  <article key={post.id}>
                    <small>{post.authorName}</small>
                    <p>{post.body}</p>
                    {post.bookTitle && <strong>{post.bookTitle}</strong>}
                    <p className="t-caption">
                      {post.likes} curtida(s) · {post.comments} comentário(s)
                    </p>
                    <Link to={`/app/community?post=${post.id}`}>Ler e conversar →</Link>
                  </article>
                ))}
              </div>
              {!discovery.sections[key]?.length && (
                <p>Ainda não há publicações para esta seleção.</p>
              )}
            </section>
          ))}
        </>
      )}
      {!search && kind === 'all' && <DiscoverClubs />}
    </div>
  )
}
