import { ClubBookFile } from '../clubs/ClubBookFile'
import { PrivateBookCover } from './PrivateBookCover'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, messageFor, readableError } from '../auth/api'
import { localEpub, saveEpub } from './epub-storage'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BookOpen, BookPlus, Heart, ImageIcon, MoreHorizontal, Plus, Search, Upload } from 'lucide-react'
import { useTheme } from '../app/ThemeProvider'
import { BOOK_FILES_EVENT, fetchUsage, uploadOriginal, type BookFilesUsage } from './book-files'
import { openBook } from './BookOpener'
import { BookShare } from './BookShare'
import type { z } from 'zod'
import type { bookMetadataSchema, WorkspaceState } from '../../server/src/workspace-model'
import { preferencesSchema } from '../../server/src/workspace-model'
import type { CatalogEntry } from '../../server/src/catalog'
import { Button, Card } from '../components/ui'
import type { ImportedBook } from './import-book'
import { useWorkspace } from './WorkspaceProvider'
import './library-room.css'
import { PrivateBookFile } from './PrivateBookFile'
import { addFreeBook, literaryCoverUrl, ServiceNotReady } from '../literary/api'

const statusLabels = {
  want: 'Quero ler',
  reading: 'Lendo',
  finished: 'Concluídos',
  paused: 'Pausados',
  abandoned: 'Abandonados',
}
type Metadata = z.infer<typeof bookMetadataSchema>
type Book = WorkspaceState['books'][number]
const blank = () => ({
  title: '',
  author: '',
  category: '',
  content: '',
  metadata: {} as Metadata,
  chapters: undefined as ImportedBook['chapters'],
})
export function LibraryRoom() {
  const { user } = useAuth(),
    [params, setParams] = useSearchParams(),
    sample = params.get('sample'),
    freeBookId = params.get('gratuito'),
    readAfter = params.get('ler') === '1'
  const navigateTo = useNavigate()
  const [originalFile, setOriginalFile] = useState<File | null>(null)
  const { appearance, saveAppearance } = useTheme()
  const [usage, setUsage] = useState<BookFilesUsage | null>(null)
  const { snapshot, act, busy, scope, refresh } = useWorkspace()
  const { state, reading, role } = snapshot!
  const preferences = preferencesSchema.parse(snapshot!.preferences)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  // Atalhos vindos da Biblioteca e do botão Criar: ?adicionar=1 abre o formulário; ?importar=1 destaca o botão de importar.
  const [show, setShow] = useState(params.get('adicionar') === '1')
  const [shelf, setShelf] = useState('')
  const [draft, setDraft] = useState(blank)
  const [editing, setEditing] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [importing, setImporting] = useState(false)
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalogAuthor, setCatalogAuthor] = useState(''),
    [catalogGenre, setCatalogGenre] = useState('')
  const [searching, setSearching] = useState(false)
  async function preserveOriginal(id: string, file: File) {
    try {
      const { readEpub } = await import('./epub-archive')
      const archive = await readEpub(file),
        cover = archive.coverPath ? archive.images.get(archive.coverPath) : null
      await saveEpub(
        user?.emailVerified ? user.uid : 'visitor',
        id,
        file,
        file.name,
        cover ? new Blob([new Uint8Array(cover.bytes)], { type: cover.mime }) : undefined,
      )
      // Com conta, o EPUB vai para a conta uma vez só e fica disponível em qualquer aparelho.
      if (user?.emailVerified) {
        await uploadOriginal(user, id, file, file.name)
        setMessage('Livro salvo na sua conta.')
      } else setMessage('Livro salvo neste aparelho.')
    } catch (error) {
      setMessage('O livro foi adicionado, mas o arquivo não foi salvo na conta: ' + readableError(error))
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (importing) return
    let createdId: string | undefined
    const original = originalFile
    const ok = editing
      ? await act({
          type: 'book.metadata',
          id: editing,
          title: draft.title,
          author: draft.author,
          category: draft.category,
          metadata: draft.metadata,
        })
      : await act({ type: 'book.add', ...draft }, (next) => {
          createdId = next.state.books[0]?.id
        })
    if (!ok) return
    if (original && createdId && scope === 'personal') {
      setImporting(true)
      setMessage('Guardando o EPUB e a capa…')
      try {
        await preserveOriginal(createdId, original)
      } finally {
        setImporting(false)
      }
    } else setMessage(editing ? 'Dados atualizados.' : 'Livro adicionado.')
    setShow(false)
    setEditing(null)
    setDraft(blank())
    setOriginalFile(null)
  }
  async function file(file: File, extra: Partial<Metadata> = {}, identity?: { title: string; author: string }) {
    setImporting(true)
    setMessage('')
    try {
      if (file.size > 10000000) throw Error('Escolha um arquivo de até 10 MB.')
      const stableFile = new File([await file.arrayBuffer()], file.name, {
        type: file.type,
      })
      const { importBook } = await import('./import-book')
      const imported = await importBook(stableFile)
      setDraft({
        title: (identity?.title || imported.title).slice(0, 150),
        author: (identity?.author || imported.author).slice(0, 150),
        category: '',
        content: imported.content,
        metadata: { ...(imported.metadata ?? {}), ...extra },
        chapters: imported.chapters,
      })
      setOriginalFile(/\.epub$/i.test(file.name) ? stableFile : null)
      setEditing(null)
      setShow(true)
      setMessage('')
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setImporting(false)
    }
  }
  useEffect(() => {
    if (!freeBookId || !user?.emailVerified || scope !== 'personal') return
    let live = true
    setImporting(true)
    setMessage('Adicionando o livro gratuito…')
    void addFreeBook(user, freeBookId)
      .then(async ({ bookId }) => {
        if (!live) return
        await refresh(true)
        if (!live) return
        setImporting(false)
        setMessage('Livro salvo na sua biblioteca.')
        if (readAfter) navigateTo(`/app/reader/${bookId}`, { replace: true })
        else setParams({}, { replace: true })
      })
      .catch(error => {
        if (live) setMessage(error instanceof ServiceNotReady
          ? 'A Biblioteca Gratuita está sendo conectada ao servidor.'
          : messageFor(error))
      })
      .finally(() => {
        if (live) setImporting(false)
      })
    return () => { live = false }
  }, [freeBookId, readAfter, user?.uid, user?.emailVerified, scope])
  useEffect(() => {
    if (sample !== 'welcome') return
    let live = true
    void fetch('/books/a-cadeira-perto-da-janela.epub', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw Error('A amostra não está disponível.')
        return response.blob()
      })
      .then((blob) => {
        if (live)
          return file(
            new File([blob], 'a-cadeira-perto-da-janela.epub', {
              type: 'application/epub+zip',
            }),
          )
      })
      .catch((error) => live && setMessage((error as Error).message))
    return () => {
      live = false
    }
  }, [sample])
  // Livros importados antes (só neste aparelho) sobem sozinhos para a conta, um de cada vez.
  const syncing = useRef(false)
  useEffect(() => {
    if (!user?.emailVerified || scope !== 'personal') return
    let live = true
    const load = () =>
      void fetchUsage(user)
        .then((value) => live && setUsage(value))
        .catch(() => {})
    load()
    window.addEventListener(BOOK_FILES_EVENT, load)
    return () => {
      live = false
      window.removeEventListener(BOOK_FILES_EVENT, load)
    }
  }, [user?.uid, user?.emailVerified, scope])
  useEffect(() => {
    if (!user?.emailVerified || scope !== 'personal' || !usage?.enabled || syncing.current) return
    const missing = state.books.filter((book) => !usage.bookIds.includes(book.id))
    if (!missing.length || usage.used >= usage.limit) return
    syncing.current = true
    void (async () => {
      try {
        let room = usage.limit - usage.used
        for (const book of missing) {
          if (room <= 0) break
          const record = await localEpub(user.uid, book.id).catch(() => undefined)
          if (!record) continue
          await uploadOriginal(user, book.id, record.file, record.filename)
          room--
        }
      } catch {
        /* tenta de novo na próxima visita */
      } finally {
        syncing.current = false
      }
    })()
  }, [usage, state.books.length])
  async function search(event: FormEvent) {
    event.preventDefault()
    setSearching(true)
    setMessage('')
    try {
      const base = import.meta.env.VITE_API_URL
      if (!base)
        throw Error(
          'Configure a API local para consultar o catálogo. O cadastro manual continua disponível.',
        )
      const response = await fetch(
        `${base.replace(/\/$/, '')}/v1/catalog?${new URLSearchParams({ ...(catalogQuery.trim() ? { q: catalogQuery.trim() } : {}), ...(catalogAuthor.trim() ? { author: catalogAuthor.trim() } : {}), ...(catalogGenre.trim() ? { genre: catalogGenre.trim() } : {}) })}`,
        { referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(75000) },
      )
      const data = await response.json()
      if (!response.ok) throw Error(data.error?.message ?? 'Não foi possível consultar o catálogo.')
      setCatalog(data.items)
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setSearching(false)
    }
  }
  const books = state.books.filter((book) => {
    const entry = reading[book.id]
    const status =
      entry?.status ?? (entry?.percent === 100 ? 'finished' : entry?.percent ? 'reading' : 'want')
    return (
      `${book.title} ${book.author} ${book.category} ${book.metadata?.isbn ?? ''}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()) &&
      (filter === 'all' ||
        filter === status ||
        (filter === 'favorite' && entry?.favorite) ||
        filter === `shelf:${entry?.shelf}`)
    )
  })
  return (
    <div className="library-room stack-lg">
      <header className="library-heading">
        <div>
          <h1>{scope === 'personal' ? 'Sua biblioteca' : 'Leituras do clube'}</h1>
          {usage?.enabled && (
            <p className="library-usage" aria-label={`${usage.used} de ${usage.limit} livros na sua conta`}>
              <span className="library-usage__bar" aria-hidden="true">
                <span style={{ width: `${Math.min(100, (usage.used / usage.limit) * 100)}%` }} />
              </span>
              {usage.used} de {usage.limit} livros na conta
            </p>
          )}
        </div>
      </header>
      {['owner', 'admin'].includes(role) && (
        <div className="library-toolbar">
          <label className={`button button--primary library-import ${params.get('importar') === '1' ? 'is-highlighted' : ''}`}>
            <Upload size={18} aria-hidden="true" />
            {importing ? 'Abrindo…' : 'Importar EPUB'}
            <input
              aria-label="Importar EPUB ou TXT"
              type="file"
              accept=".epub,.txt"
              disabled={importing || busy}
              onChange={(e) => {
                const item = e.target.files?.[0]
                if (item) void file(item)
                e.target.value = ''
              }}
            />
          </label>
          <Button
            variant="secondary"
            onClick={() => {
              setEditing(null)
              setOriginalFile(null)
              setDraft(blank())
              setShow(!show)
            }}
          >
            <BookPlus size={18} aria-hidden="true" /> Adicionar livro
          </Button>
          {scope === 'personal' && (
            <label className="switch-chip">
              <input
                type="checkbox"
                checked={!!appearance.coverBackdrop}
                onChange={(e) => {
                  const next = { ...appearance, coverBackdrop: e.target.checked }
                  saveAppearance(next)
                  // Com conta, a escolha vai junto para os outros aparelhos.
                  if (user?.emailVerified)
                    void apiRequest(user, '/me/appearance', 'POST', { appearance: next }).catch(() => {})
                }}
              />
              <ImageIcon size={17} aria-hidden="true" />
              Capa como fundo
            </label>
          )}
        </div>
      )}
      {['owner', 'admin'].includes(role) && (
        <details className="library-discovery">
          <summary>
            <Search size={17} /> Buscar no catálogo
          </summary>
          <form className="workspace-actions" onSubmit={search}>
            <input
              aria-label="Pesquisar catálogo"
              minLength={2}
              maxLength={100}
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
              placeholder="Título, autor ou ISBN"
            />
            <input
              aria-label="Filtrar catálogo por autor"
              minLength={2}
              maxLength={100}
              value={catalogAuthor}
              onChange={(e) => setCatalogAuthor(e.target.value)}
              placeholder="Autor"
            />
            <input
              aria-label="Filtrar catálogo por gênero"
              minLength={2}
              maxLength={80}
              value={catalogGenre}
              onChange={(e) => setCatalogGenre(e.target.value)}
              placeholder="Gênero ou assunto"
            />
            <Button
              disabled={
                searching || (!catalogQuery.trim() && !catalogAuthor.trim() && !catalogGenre.trim())
              }
            >
              {searching ? 'Pesquisando…' : 'Pesquisar catálogo'}
            </Button>
          </form>
          <div className="catalog-results">
            {catalog.map((item) => (
              <article key={item.key}>
                {item.metadata.cover && (
                  <img
                    src={item.metadata.cover}
                    alt={`Capa de ${item.title}`}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                )}
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.author}</p>
                  <small>{item.metadata.year} · Open Library</small>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setOriginalFile(null)
                      setDraft({
                        ...blank(),
                        title: item.title,
                        author: item.author,
                        category: item.category,
                        metadata: item.metadata,
                      })
                      setEditing(null)
                      setShow(true)
                      setMessage('')
                    }}
                  >
                    Adicionar à minha biblioteca
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </details>
      )}
      {message && <p role="status">{message}</p>}
      {show && (
        <Card>
          <form className="workspace-form" onSubmit={save}>
            <h2>{editing ? 'Editar livro' : originalFile ? 'Confira e salve' : 'Novo livro'}</h2>
            <label>
              Título
              <input
                required
                maxLength={150}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label>
              Autor
              <input
                required
                maxLength={150}
                value={draft.author}
                onChange={(e) => setDraft({ ...draft, author: e.target.value })}
              />
            </label>
            <label>
              Categoria
              <input
                maxLength={80}
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              />
            </label>
            <div className="book-metadata-grid">
              {(
                [
                  ['isbn', 'ISBN'],
                  ['publisher', 'Editora'],
                  ['language', 'Idioma'],
                  ['year', 'Ano de publicação'],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    maxLength={
                      key === 'isbn' ? 32 : key === 'publisher' ? 150 : key === 'language' ? 50 : 20
                    }
                    value={draft.metadata[key] ?? ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        metadata: { ...draft.metadata, [key]: e.target.value },
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <label>
              Número de páginas
              <input
                type="number"
                min={1}
                max={100000}
                value={draft.metadata.pages ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    metadata: {
                      ...draft.metadata,
                      pages: e.target.value ? Number(e.target.value) : undefined,
                    },
                  })
                }
              />
            </label>
            <label>
              Sinopse
              <textarea
                rows={3}
                maxLength={3000}
                value={draft.metadata.synopsis ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    metadata: { ...draft.metadata, synopsis: e.target.value },
                  })
                }
              />
            </label>
            <label>
              Origem e condições de uso
              <input
                maxLength={500}
                value={draft.metadata.license ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    metadata: { ...draft.metadata, license: e.target.value },
                  })
                }
              />
            </label>
            {!editing && (
              <label>
                Texto para ler (opcional)
                <textarea
                  rows={4}
                  maxLength={600000}
                  value={draft.content}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      content: e.target.value,
                      chapters: undefined,
                    })
                  }
                />
              </label>
            )}
            <small>Importe só livros que você tem direito de usar.</small>
            <div className="workspace-actions">
              <Button disabled={busy || importing}>Salvar livro</Button>
              <Button variant="ghost" type="button" onClick={() => setShow(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}
      <div className="search-field">
        <Search size={19} />
        <input
          aria-label="Buscar na biblioteca"
          placeholder="Título, autor, gênero ou ISBN"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="library-shelves" aria-label="Minhas estantes">
        {[
          ['all', 'Todos'],
          ...Object.entries(statusLabels),
          ['favorite', 'Favoritos'],
          ...preferences.shelves.map((name) => [`shelf:${name}`, name]),
        ].map(([value, label]) => (
          <button
            key={value}
            className={filter === value ? 'active' : ''}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <details className="library-discovery">
        <summary>
          <Plus size={16} aria-hidden="true" /> Estantes
        </summary>
        <form
          className="workspace-actions"
          onSubmit={(e) => {
            e.preventDefault()
            void act({ type: 'shelf.add', name: shelf }).then((ok) => ok && setShelf(''))
          }}
        >
          <label>
            Nova estante
            <input
              required
              maxLength={60}
              value={shelf}
              onChange={(e) => setShelf(e.target.value)}
            />
          </label>
          <Button disabled={busy}>Criar estante</Button>
        </form>
        {preferences.shelves.map((name) => (
          <div key={name} className="workspace-actions">
            <span>{name}</span>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void act({ type: 'shelf.remove', name })}
            >
              Remover estante
            </Button>
          </div>
        ))}
      </details>
      <p className="library-count">{books.length} {books.length === 1 ? 'livro' : 'livros'}</p>
      <div className="library-book-grid">
        {books.map((book) => (
          <BookItem
            key={book.id}
            book={book}
            onEdit={() => {
              setDraft({
                title: book.title,
                author: book.author,
                category: book.category,
                content: book.content,
                metadata: book.metadata ?? {},
                chapters: book.chapters,
              })
              setEditing(book.id)
              setShow(true)
            }}
          />
        ))}
      </div>
      {!books.length && (
        <div className="library-empty">
          <BookOpen size={36} />
          <h2>{state.books.length ? 'Nada nesta estante' : 'Sua estante está vazia'}</h2>
          <p>{state.books.length ? 'Tente outro filtro.' : 'Importe um EPUB para começar.'}</p>
        </div>
      )}
    </div>
  )
}
function BookItem({ book, onEdit }: { book: Book; onEdit: () => void }) {
  const { snapshot, act, busy, scope, addToPersonal } = useWorkspace()
  const navigate = useNavigate()
  const [added, setAdded] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const saved = snapshot!.reading[book.id]
  const owner = ['owner', 'admin'].includes(snapshot!.role)
  const prefs = preferencesSchema.parse(snapshot!.preferences)
  const percent = saved?.percent ?? 0
  const status =
    saved?.status ?? (percent === 100 ? 'finished' : percent ? 'reading' : 'want')
  const href = `/app/reader/${book.id}`
  const open = (event: React.MouseEvent<HTMLAnchorElement>) =>
    openBook(event, { title: book.title, go: () => navigate(href) })
  return (
    <article className="library-book">
      <Link className="library-cover-link" to={href} aria-label={`Ler ${book.title}`} onClick={open}>
        <PrivateBookCover
          id={book.id}
          title={book.title}
          author={book.author}
          fallback={book.metadata?.literaryEpub ? literaryCoverUrl(book.metadata.literaryEditionId) : book.metadata?.cover}
        />
      </Link>
      <div className="library-book__body">
        {book.category && <span className="eyebrow">{book.category}</span>}
        <h2>{book.title}</h2>
        <p className="library-book__author">{book.author}</p>
        <div
          className="library-book__progress"
          role="progressbar"
          aria-label={`Progresso de ${book.title}`}
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span className="library-book__track" aria-hidden="true">
            <span style={{ width: `${percent}%` }} />
          </span>
          <small>{percent === 100 ? 'Lido' : percent ? `${percent}%` : 'Não iniciado'}</small>
        </div>
        <div className="library-book__actions">
          <Link className="button button--primary library-book__read" to={href} onClick={open}>
            <BookOpen size={17} aria-hidden="true" />
            {percent ? 'Continuar' : 'Ler'}
          </Link>
          <button
            type="button"
            className={`icon-action ${saved?.favorite ? 'is-on' : ''}`}
            disabled={busy}
            aria-pressed={!!saved?.favorite}
            aria-label={saved?.favorite ? `Tirar ${book.title} dos favoritos` : `Favoritar ${book.title}`}
            title={saved?.favorite ? 'Favorito' : 'Favoritar'}
            onClick={() => void act({ type: 'reading.update', id: book.id, favorite: !saved?.favorite })}
          >
            <Heart size={19} fill={saved?.favorite ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
          <BookShare compact book={{ id: book.id, title: book.title, author: book.author, coverUrl: book.metadata?.cover }} />
          <details className="book-menu">
            <summary className="icon-action" aria-label={`Mais opções de ${book.title}`} title="Mais opções">
              <MoreHorizontal size={19} aria-hidden="true" />
            </summary>
            <div className="book-menu__panel">
              <label>
                Status
                <select
                  aria-label={`Status de ${book.title}`}
                  disabled={busy}
                  value={status}
                  onChange={(e) =>
                    void act({
                      type: 'reading.update',
                      id: book.id,
                      status: e.target.value as keyof typeof statusLabels,
                    })
                  }
                >
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {prefs.shelves.length > 0 && (
                <label>
                  Estante
                  <select
                    disabled={busy}
                    value={saved?.shelf ?? ''}
                    onChange={(e) => void act({ type: 'reading.update', id: book.id, shelf: e.target.value })}
                  >
                    <option value="">Nenhuma</option>
                    {prefs.shelves.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {scope !== 'personal' && (
                <Button
                  variant="secondary"
                  disabled={busy || added}
                  onClick={() =>
                    void addToPersonal({
                      title: book.title,
                      author: book.author,
                      category: book.category,
                      metadata: book.metadata,
                    }).then((ok) => ok && setAdded(true))
                  }
                >
                  {added ? 'Na sua biblioteca' : 'Levar para minha biblioteca'}
                </Button>
              )}
              {owner && (
                <>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void act({
                        type: 'book.current',
                        id: snapshot!.state.currentBookId === book.id ? null : book.id,
                      })
                    }
                  >
                    {snapshot!.state.currentBookId === book.id ? 'Tirar do destaque' : 'Destacar no início'}
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={onEdit}>
                    Editar dados
                  </Button>
                </>
              )}
              <details className="book-menu__about">
                <summary>Sobre o livro</summary>
                {book.metadata?.synopsis && <p className="preserve-text">{book.metadata.synopsis}</p>}
                <p className="book-edition">
                  {[
                    book.metadata?.publisher,
                    book.metadata?.year?.slice(0, 4),
                    book.metadata?.pages ? `${book.metadata.pages} páginas` : '',
                    book.metadata?.isbn ? `ISBN ${book.metadata.isbn}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Sem dados da edição.'}
                </p>
              </details>
              {scope === 'personal' ? (
                <PrivateBookFile bookId={book.id} />
              ) : (
                <ClubBookFile clubId={scope} bookId={book.id} />
              )}
              {owner &&
                (confirm ? (
                  <div className="workspace-actions">
                    <Button variant="danger" disabled={busy} onClick={() => void act({ type: 'book.remove', id: book.id })}>
                      Remover livro
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirm(false)}>
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <Button variant="ghost" className="book-menu__danger" disabled={busy} onClick={() => setConfirm(true)}>
                    Remover da biblioteca
                  </Button>
                ))}
            </div>
          </details>
        </div>
      </div>
    </article>
  )
}
