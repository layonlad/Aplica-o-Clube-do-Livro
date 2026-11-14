import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { publicRequest, readableError } from '../auth/api'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import { Button, CoverArt } from '../components/ui'
import { DiscoverClubs } from '../clubs/DiscoverClubs'
import { socialRead } from './social-api'
import type { Page } from '../../server/src/community-contracts'
import type { CatalogEntry } from '../../server/src/catalog'
import type { SocialProfileDto } from './SocialProfile'
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
      <header className="social-heading">
        <span className="eyebrow">EXPLORE SEU UNIVERSO LITERÁRIO</span>
        <h1>Uma descoberta puxa outra</h1>
        <p>Encontre leitores, livros e grupos para suas próximas páginas.</p>
      </header>
      <div className="workspace-actions">
        <Link to="/app/community?kind=review">Resenhas da comunidade →</Link>
        <Link to="/app/community">Publicações e discussões →</Link>
      </div>
      <form
        className="workspace-form"
        onSubmit={(event) => {
          event.preventDefault()
          setSearch(query.trim())
          setActiveGenre(genre.trim())
        }}
      >
        <label>
          Buscar leitores
          <input
            minLength={2}
            maxLength={100}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nome, @usuário, título ou autor para buscar livros"
          />
        </label>
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
        <div className="workspace-actions">
          <Button disabled={loading}>Buscar leitores</Button>
          <Button
            type="button"
            variant="secondary"
            disabled={loading || (!query.trim() && !bookAuthor.trim() && !genre.trim())}
            onClick={() => void catalog()}
          >
            Buscar livros na Open Library
          </Button>
        </div>
        <small>
          A busca de livros envia o termo à Open Library e retorna metadados. Ela não fornece
          autorização para baixar obras.
        </small>
      </form>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <section>
        <h2>Leitores para conhecer</h2>
        <div className="profile-discovery">
          {page.items.map((profile) => (
            <article key={profile.id}>
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
      </section>
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
      {discovery && (
        <>
          <section>
            <h2>Livros mais conversados</h2>
            <p className="t-caption">
              Referências em publicações visíveis da comunidade nos últimos 30 dias.
            </p>
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
      <DiscoverClubs />
    </div>
  )
}
