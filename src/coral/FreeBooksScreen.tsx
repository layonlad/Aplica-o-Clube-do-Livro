import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, BadgeCheck, BookOpen, BookPlus, ChevronDown, ChevronRight, ExternalLink, Search, ShieldCheck, X } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { readableError } from '../auth/api'
import { Sheet } from '../components/Sheet'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import { fetchFreeBookHome, languageNames, searchFreeBooks, ServiceNotReady } from '../literary/api'
import type { FreeBook, FreeBookHome, FreeBookPage } from '../literary/contracts'
import { BookCover, Hero, HeroIcon, SectionHead, SheetBody } from './kit'

const languages = [
  { id: '', label: 'Todos os idiomas' },
  { id: 'pt', label: 'Português' },
  { id: 'en', label: 'Inglês' },
  { id: 'es', label: 'Espanhol' },
]

type Load<T> = { state: 'loading' } | { state: 'ready'; value: T } | { state: 'error'; message: string } | { state: 'not-ready' }
const failed = (error: unknown): Load<never> => (error instanceof ServiceNotReady ? { state: 'not-ready' } : { state: 'error', message: readableError(error) })

/** Biblioteca Gratuita: obras em domínio público ou com licença aberta, verificadas pelo servidor. */
export function FreeBooksScreen() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const input = useRef<HTMLInputElement>(null)
  const search = (params.get('q') ?? '').trim()
  const category = params.get('categoria') ?? ''
  const language = params.get('idioma') ?? ''
  const [query, setQuery] = useState(search)
  const [searching, setSearching] = useState(!!search)
  const [home, setHome] = useState<Load<FreeBookHome>>({ state: 'loading' })
  const [results, setResults] = useState<Load<FreeBookPage> | null>(null)
  const [more, setMore] = useState(false)
  const [book, setBook] = useState<FreeBook | null>(null)
  const [retry, setRetry] = useState(0)
  const filtered = search.length >= 2 || !!category || !!language

  useEffect(() => {
    let live = true
    setHome({ state: 'loading' })
    fetchFreeBookHome().then((value) => live && setHome({ state: 'ready', value })).catch((error) => live && setHome(failed(error)))
    return () => { live = false }
  }, [retry])
  useEffect(() => {
    if (!filtered) { setResults(null); return }
    let live = true
    setResults({ state: 'loading' })
    searchFreeBooks({ q: search, category, language }).then((value) => live && setResults({ state: 'ready', value })).catch((error) => live && setResults(failed(error)))
    return () => { live = false }
  }, [search, category, language, filtered, retry])
  useEffect(() => { if (searching) input.current?.focus() }, [searching])

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) value ? next.set(key, value) : next.delete(key)
    setParams(next, { replace: true })
  }
  async function loadMore() {
    if (results?.state !== 'ready' || !results.value.nextCursor || more) return
    setMore(true)
    try {
      const next = await searchFreeBooks({ q: search, category, language, cursor: results.value.nextCursor })
      setResults((current) => current?.state === 'ready'
        ? { state: 'ready', value: { items: [...current.value.items, ...next.items.filter((item) => !current.value.items.some((old) => old.id === item.id))], nextCursor: next.nextCursor } }
        : current)
    } catch (error) {
      setResults(failed(error))
    } finally {
      setMore(false)
    }
  }
  const categories = home.state === 'ready' ? home.value.categories : []
  const notReady = home.state === 'not-ready' || results?.state === 'not-ready'

  return (
    <div className="free-books-screen">
      <Hero
        title="Livros Gratuitos"
        subtitle="Clássicos e obras liberadas para ler sem pagar."
        subtitleBelow
        leading={<HeroIcon label="Voltar para Explorar" onClick={() => navigate('/app/explore')}><ArrowLeft size={20} strokeWidth={1.9} /></HeroIcon>}
        actions={<HeroIcon label={searching ? 'Fechar pesquisa' : 'Pesquisar livros gratuitos'} expanded={searching} onClick={() => { if (searching) { setQuery(''); update({ q: '' }) } setSearching(!searching) }}>{searching ? <X size={20} strokeWidth={1.9} /> : <Search size={20} strokeWidth={1.9} />}</HeroIcon>}
      >
        {searching && (
          <form className="search-field" role="search" onSubmit={(event) => { event.preventDefault(); update({ q: query.trim().length >= 2 ? query.trim() : '' }) }}>
            <Search size={19} aria-hidden="true" />
            <input ref={input} type="search" aria-label="Buscar por título, autoria ou assunto" placeholder="Título, autoria ou assunto" minLength={2} maxLength={100} value={query} onChange={(event) => setQuery(event.target.value)} />
            {query && <button type="button" className="icon-button" aria-label="Limpar busca" onClick={() => { setQuery(''); update({ q: '' }) }}><X size={18} /></button>}
          </form>
        )}
        {categories.length > 0 && (
          <div className="filter-pills category-pills" role="group" aria-label="Categorias">
            {categories.map((item) => (
              <button key={item.id} type="button" aria-pressed={category === item.id} onClick={() => update({ categoria: category === item.id ? '' : item.id })}>{item.label}</button>
            ))}
          </div>
        )}
      </Hero>
      <SheetBody className="free-books-sheet">
        {!notReady && (
          <div className="free-books-filters">
            <label className="sort-select">
              <span>Idioma:</span>
              <span className="sort-select__value">{languages.find((item) => item.id === language)?.label ?? 'Todos os idiomas'}<ChevronDown size={15} aria-hidden="true" /></span>
              <select aria-label="Idioma" value={language} onChange={(event) => update({ idioma: event.target.value })}>
                {languages.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <span className="free-books-filters__note"><ShieldCheck size={15} aria-hidden="true" />Licença verificada</span>
          </div>
        )}

        {notReady ? (
          <div className="soft-empty">
            <BookOpen size={26} aria-hidden="true" />
            <h2 className="soft-empty__title">A Biblioteca Gratuita está sendo conectada</h2>
            <p>Os livros aparecem aqui assim que o servidor liberar o acervo. Nenhum título é mostrado antes da verificação de licença.</p>
            <button type="button" className="pill-button" onClick={() => setRetry((value) => value + 1)}>Tentar novamente</button>
          </div>
        ) : filtered ? (
          <section aria-labelledby="free-results">
            <SectionHead id="free-results" title={search ? `Resultados para “${search}”` : categories.find((item) => item.id === category)?.label ?? 'Livros'} />
            {results?.state === 'error' && <Retry message={results.message} onRetry={() => setRetry((value) => value + 1)} />}
            <div className="free-grid">
              {results?.state === 'ready' && results.value.items.map((item) => <FreeBookTile key={item.id} book={item} onOpen={() => setBook(item)} />)}
              {results?.state === 'loading' && [0, 1, 2, 3, 4, 5].map((key) => <span key={key} className="skeleton free-grid__skeleton" aria-hidden="true" />)}
            </div>
            {results?.state === 'ready' && !results.value.items.length && <p className="soft-empty">Nenhum livro gratuito encontrado. Tente outro termo ou idioma.</p>}
            {results?.state === 'ready' && results.value.nextCursor && (
              <div className="library-add"><button type="button" className="pill-button" disabled={more} aria-busy={more} onClick={() => void loadMore()}>Mais livros</button></div>
            )}
          </section>
        ) : home.state === 'error' ? (
          <Retry message={home.message} onRetry={() => setRetry((value) => value + 1)} />
        ) : home.state === 'loading' ? (
          [0, 1].map((key) => (
            <section key={key} aria-hidden="true">
              <span className="skeleton" style={{ display: 'block', width: 160, height: 20, borderRadius: 8, marginBottom: 12 }} />
              <div className="h-scroll">{[0, 1, 2, 3].map((item) => <span key={item} className="skeleton" style={{ width: 104, height: 150, borderRadius: 8 }} />)}</div>
            </section>
          ))
        ) : home.value.sections.length ? (
          home.value.sections.map((section) => (
            <section key={section.id} aria-labelledby={`free-${section.id}`}>
              <SectionHead id={`free-${section.id}`} title={section.title} />
              <div className="h-scroll">
                {section.items.map((item) => <FreeBookTile key={item.id} book={item} onOpen={() => setBook(item)} />)}
              </div>
            </section>
          ))
        ) : (
          <p className="soft-empty">O acervo gratuito está vazio no momento.</p>
        )}
        {!notReady && <p className="free-books-credit t-caption">Acervo de Project Gutenberg, Standard Ebooks e Open Library. Só aparecem obras em domínio público ou com licença aberta.</p>}
      </SheetBody>
      {book && <FreeBookDetails book={book} onClose={() => setBook(null)} />}
    </div>
  )
}

function Retry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="access-error">
      {message}
      <button type="button" onClick={onRetry}>Tentar novamente</button>
    </div>
  )
}

export function FreeBookTile({ book, onOpen }: { book: FreeBook; onOpen: () => void }) {
  return (
    <button type="button" className="free-tile" onClick={onOpen} aria-label={`${book.title}, de ${book.authors.join(', ') || 'autoria desconhecida'}. Gratuito`}>
      <span className="free-tile__cover">
        <BookCover title={book.title} author={book.authors[0] ?? ''} image={book.cover ?? undefined} width={104} ratio={0.68} />
        <span className="free-tile__badge">Grátis</span>
      </span>
      <strong>{book.title}</strong>
      <small>{book.authors[0] ?? 'Autoria desconhecida'}</small>
    </button>
  )
}

/** Detalhes, licença e as ações reais: ler agora ou guardar na biblioteca pessoal (com o EPUB). */
export function FreeBookDetails({ book, onClose }: { book: FreeBook; onClose: () => void }) {
  const { user } = useAuth()
  const { setScope } = useWorkspace()
  const navigate = useNavigate()
  function add(read: boolean) {
    onClose()
    setScope('personal')
    navigate(`/app/library/gerenciar?gratuito=${encodeURIComponent(book.id)}${read ? '&ler=1' : ''}`)
  }
  const verified = new Date(book.license.verifiedAt)
  return (
    <Sheet title="Livro gratuito" onClose={onClose} className="action-sheet free-details">
      <div className="book-details">
        <BookCover title={book.title} author={book.authors[0] ?? ''} image={book.cover ?? undefined} width={112} ratio={0.68} />
        <div>
          <h3>{book.title}</h3>
          <p>{book.authors.join(', ') || 'Autoria desconhecida'}</p>
          <dl>
            {book.year && <><dt>Ano</dt><dd>{book.year}</dd></>}
            <dt>Idioma</dt><dd>{languageNames[book.language] ?? book.language.toUpperCase()}</dd>
            {book.pages && <><dt>Páginas</dt><dd>{book.pages}</dd></>}
          </dl>
        </div>
      </div>
      <p className="free-license">
        <BadgeCheck size={17} aria-hidden="true" />
        <span><strong>{book.license.label}</strong><small>Verificado em {Number.isNaN(verified.getTime()) ? '—' : verified.toLocaleDateString('pt-BR')} · {book.source.name}</small></span>
      </p>
      {book.description && <p className="free-description preserve-text">{book.description}</p>}
      {book.subjects.length > 0 && <div className="free-subjects">{book.subjects.slice(0, 6).map((item) => <span key={item} className="tag">{item}</span>)}</div>}
      <div className="action-menu">
        {book.epub && user?.emailVerified ? (
          <>
            <button type="button" onClick={() => add(true)}>
              <span className="action-menu__icon"><BookOpen size={19} /></span>
              <span>Ler agora<small>Entra na sua biblioteca com o EPUB</small></span>
            </button>
            <button type="button" onClick={() => add(false)}>
              <span className="action-menu__icon"><BookPlus size={19} /></span>
              <span>Adicionar à biblioteca<small>Conta no limite de EPUBs do seu plano</small></span>
            </button>
          </>
        ) : book.epub ? (
          <button type="button" onClick={() => { onClose(); navigate('/account') }}>
            <span className="action-menu__icon"><BookPlus size={19} /></span>
            <span>Entre para guardar e ler<small>O livro fica na sua conta</small></span>
          </button>
        ) : null}
        <a href={book.source.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
          <span className="action-menu__icon"><ExternalLink size={19} /></span>
          <span>Ver em {book.source.name}<small>Abre o site da fonte</small></span>
        </a>
        {book.license.url && (
          <a href={book.license.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
            <span className="action-menu__icon"><ShieldCheck size={19} /></span>
            <span>Ler a licença</span>
          </a>
        )}
      </div>
    </Sheet>
  )
}

/** Chamada para a Biblioteca Gratuita no Explorar: mostra a primeira seção do acervo quando ele já responde. */
export function FreeBooksTeaser() {
  const [items, setItems] = useState<FreeBook[] | null>(null)
  const [book, setBook] = useState<FreeBook | null>(null)
  useEffect(() => {
    let live = true
    fetchFreeBookHome().then((value) => live && setItems(value.sections[0]?.items.slice(0, 10) ?? [])).catch(() => live && setItems([]))
    return () => { live = false }
  }, [])
  return (
    <section aria-labelledby="explore-free">
      <SectionHead id="explore-free" title="Livros Gratuitos" to="/app/explore/gratuitos" linkLabel="Ver todos" />
      {items === null ? (
        <div className="h-scroll">{[0, 1, 2, 3].map((key) => <span key={key} className="skeleton" style={{ width: 104, height: 190, borderRadius: 8 }} aria-hidden="true" />)}</div>
      ) : items.length ? (
        <div className="h-scroll">{items.map((item) => <FreeBookTile key={item.id} book={item} onOpen={() => setBook(item)} />)}</div>
      ) : (
        <Link className="free-banner" to="/app/explore/gratuitos">
          <span className="free-banner__icon" aria-hidden="true"><BookOpen size={22} /></span>
          <span><strong>Clássicos para ler sem pagar</strong><small>Obras em domínio público ou com licença aberta</small></span>
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      )}
      {book && <FreeBookDetails book={book} onClose={() => setBook(null)} />}
    </section>
  )
}
