import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BookOpen, BookPlus, ChevronDown, Ellipsis, FolderPen, Heart, Layers, Library, Plus, Search, SlidersHorizontal, Star, Trash2, Upload, X } from 'lucide-react'
import { preferencesSchema, type WorkspaceState } from '../../server/src/workspace-model'
import { Sheet } from '../components/Sheet'
import { Button } from '../components/ui'
import { useTheme } from '../app/ThemeProvider'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest } from '../auth/api'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import { BookCover, compact, Hero, HeroIcon, SectionHead, SheetBody } from './kit'
import { BookActions, ReadingCard, useOpenBook } from './pieces'

type Book = WorkspaceState['books'][number]
type Tab = 'reading' | 'want' | 'finished'
type Sort = 'recent' | 'title' | 'author' | 'progress' | 'finished'
const sorts: { id: Sort; label: string }[] = [
  { id: 'recent', label: 'Recente' },
  { id: 'title', label: 'Título' },
  { id: 'author', label: 'Autor' },
  { id: 'progress', label: 'Progresso' },
  { id: 'finished', label: 'Data de conclusão' },
]
const SORT_KEY = 'clube-livro-library-sort'
const readSort = (): Sort => { try { return (localStorage.getItem(SORT_KEY) as Sort) || 'recent' } catch { return 'recent' } }

export function LibraryScreen() {
  const { snapshot, act, busy } = useWorkspace()
  const { user } = useAuth()
  const { appearance, saveAppearance } = useTheme()
  const navigate = useNavigate()
  const open = useOpenBook()
  const { state, reading } = snapshot!
  const shelves = preferencesSchema.parse(snapshot!.preferences).shelves
  const [tab, setTab] = useState<Tab>('reading')
  const [sort, setSort] = useState<Sort>(readSort)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [filters, setFilters] = useState(false)
  const [collection, setCollection] = useState<string | null>(null)
  const [editCollection, setEditCollection] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [menu, setMenu] = useState<string | null>(null)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const searchInput = useRef<HTMLInputElement>(null)

  const statusOf = (book: Book): Tab | 'other' => {
    const entry = reading[book.id]
    const percent = entry?.percent ?? 0
    if (percent >= 100 || entry?.status === 'finished') return 'finished'
    if (entry?.status === 'want' || (!entry?.status && percent === 0)) return 'want'
    if (entry?.status === 'abandoned') return 'other'
    return 'reading'
  }
  const counts = { reading: 0, want: 0, finished: 0 } as Record<Tab, number>
  for (const book of state.books) { const status = statusOf(book); if (status !== 'other') counts[status] += 1 }

  const order = useMemo(() => new Map(state.books.map((book, index) => [book.id, index])), [state.books])
  const visible = state.books
    .filter((book) => statusOf(book) === tab)
    .filter((book) => !collection || reading[book.id]?.shelf === collection)
    .filter((book) => !favoritesOnly || reading[book.id]?.favorite)
    .filter((book) => !query.trim() || `${book.title} ${book.author} ${book.category}`.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')))
    .sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title, 'pt-BR')
      if (sort === 'author') return a.author.localeCompare(b.author, 'pt-BR')
      if (sort === 'progress') return (reading[b.id]?.percent ?? 0) - (reading[a.id]?.percent ?? 0)
      if (sort === 'finished') return (reading[b.id]?.finishedAt ?? '').localeCompare(reading[a.id]?.finishedAt ?? '')
      return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
    })
  const current =
    state.books.find((book) => book.id === state.currentBookId && statusOf(book) === 'reading') ??
    state.books.find((book) => statusOf(book) === 'reading')
  const menuBook = state.books.find((book) => book.id === menu)

  function changeSort(value: Sort) {
    setSort(value)
    try { localStorage.setItem(SORT_KEY, value) } catch { /* sem armazenamento */ }
  }
  const tabLabel = { reading: 'Lendo', want: 'Quero ler', finished: 'Concluídos' }

  return (
    <div className="library-screen">
      <Hero
        title="Biblioteca"
        actions={<>
          <HeroIcon label={searching ? 'Fechar busca' : 'Buscar na biblioteca'} expanded={searching} onClick={() => { setSearching(!searching); if (searching) setQuery(''); else requestAnimationFrame(() => searchInput.current?.focus()) }}>{searching ? <X size={21} /> : <Search size={21} strokeWidth={1.9} />}</HeroIcon>
          <HeroIcon label="Filtros e organização" expanded={filters} onClick={() => setFilters(true)} dot={!!collection || favoritesOnly}><SlidersHorizontal size={21} strokeWidth={1.9} /></HeroIcon>
        </>}
      >
        {searching && (
          <div className="search-field">
            <Search size={19} aria-hidden="true" />
            <input ref={searchInput} type="search" aria-label="Buscar na sua biblioteca" placeholder="Título, autor ou gênero" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
        )}
      </Hero>
      <SheetBody>
        <div className="pill-tabs" role="tablist" aria-label="Situação da leitura">
          {(['reading', 'want', 'finished'] as Tab[]).map((value) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>
              {tabLabel[value]} ({counts[value]})
            </button>
          ))}
        </div>

        {tab === 'reading' && current && !query && !collection && (
          <section aria-labelledby="library-current">
            <SectionHead id="library-current" title="Continuar lendo" onLink={() => document.getElementById('library-books')?.scrollIntoView({ behavior: 'smooth' })} />
            <ReadingCard book={current} entry={reading[current.id]} onMore={() => setMenu(current.id)} />
          </section>
        )}

        <section aria-labelledby="library-collections">
          <SectionHead id="library-collections" title="Minhas coleções" onLink={shelves.length ? () => setFilters(true) : undefined} linkLabel="Ver todas" />
          <div className="h-scroll">
            {shelves.map((name) => {
              const books = state.books.filter((book) => reading[book.id]?.shelf === name)
              const first = books[0]
              return (
                <button key={name} type="button" className={`club-tile collection-tile ${collection === name ? 'is-selected' : ''}`} aria-pressed={collection === name} onClick={() => setCollection(collection === name ? null : name)} onContextMenu={(event) => { event.preventDefault(); setEditCollection(name) }}>
                  <span className="club-tile__art">
                    {first ? <BookCover title={first.title} author={first.author} bookId={first.id} image={first.metadata?.cover} width={120} ratio={0.9} /> : <span className="club-art" />}
                  </span>
                  {name.toLocaleLowerCase('pt-BR').includes('favorit') ? <Heart size={17} aria-hidden="true" /> : <Layers size={17} aria-hidden="true" />}
                  <strong>{name}</strong>
                  <small>{books.length === 1 ? '1 livro' : `${books.length} livros`}</small>
                </button>
              )
            })}
            <button type="button" className="add-tile" onClick={() => setCreating(true)}>
              <Plus size={24} aria-hidden="true" />Nova coleção
            </button>
          </div>
          {collection && (
            <p className="filter-note">
              Mostrando a coleção <strong>{collection}</strong>.{' '}
              <button type="button" className="text-link" onClick={() => setEditCollection(collection)}>Editar coleção</button>{' '}
              <button type="button" className="text-link" onClick={() => setCollection(null)}>Mostrar todas</button>
            </p>
          )}
        </section>

        <section aria-labelledby="library-books" id="library-books">
          <div className="section-head">
            <h2>Meus livros</h2>
            <label className="sort-select">
              <span>Ordenar por:</span>
              <span className="sort-select__value">{sorts.find((item) => item.id === sort)!.label}<ChevronDown size={15} aria-hidden="true" /></span>
              <select value={sort} onChange={(event) => changeSort(event.target.value as Sort)} aria-label="Ordenar livros">
                {sorts.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
          </div>
          <div className="book-list">
            {visible.map((book) => {
              const entry = reading[book.id]
              const percent = entry?.percent ?? 0
              const rating = entry?.rating ? { value: entry.rating, label: 'Sua nota' } : book.metadata?.ratingAverage ? { value: book.metadata.ratingAverage, label: book.metadata.ratingCount ? `(${compact(book.metadata.ratingCount)})` : '' } : null
              return (
                <article className="lib-row" key={book.id}>
                  <a href={`#/app/reader/${book.id}`} onClick={(event) => { open(event, book); if (!event.defaultPrevented) { event.preventDefault(); navigate(`/app/reader/${book.id}`) } }} aria-label={`Abrir ${book.title}`}>
                    <BookCover title={book.title} author={book.author} bookId={book.id} image={book.metadata?.cover} width={80} ratio={1} />
                  </a>
                  <div className="lib-row__text">
                    <strong>{book.title}</strong>
                    <span>{book.author}</span>
                    {rating && <span className="lib-row__meta"><Star size={14} aria-hidden="true" />{rating.value.toFixed(1).replace('.', ',')} {rating.label}</span>}
                  </div>
                  <div className="lib-row__side">
                    <button type="button" className="more-button" aria-label={`Opções de ${book.title}`} onClick={() => setMenu(book.id)}><Ellipsis size={20} /></button>
                    <small>{percent}%</small>
                    <span className="progress-track" role="progressbar" aria-label={`Progresso de ${book.title}`} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${percent}%` }} /></span>
                  </div>
                </article>
              )
            })}
            {!visible.length && (
              <div className="soft-empty">
                <BookOpen size={26} aria-hidden="true" />
                <strong>{query ? `Nada encontrado para “${query}”` : collection ? `Nenhum livro de “${collection}” aqui` : `Nenhum livro em “${tabLabel[tab]}”`}</strong>
                {!query && <Link className="pill-button" to="/app/library/gerenciar?importar=1">Importar EPUB</Link>}
              </div>
            )}
          </div>
        </section>
      </SheetBody>

      {menuBook && <BookActions book={menuBook} entry={reading[menuBook.id]} onClose={() => setMenu(null)} extra={shelves.length ? <MoveToCollection book={menuBook} onDone={() => setMenu(null)} /> : null} />}
      {creating && <CollectionForm title="Nova coleção" onClose={() => setCreating(false)} onSave={async (name) => { const ok = await act({ type: 'shelf.add', name }); if (ok) setCreating(false); return ok }} />}
      {editCollection && <CollectionEditor name={editCollection} onClose={() => setEditCollection(null)} onRenamed={(next) => { if (collection === editCollection) setCollection(next) }} onRemoved={() => { if (collection === editCollection) setCollection(null) }} />}
      {filters && (
        <Sheet title="Filtros e organização" onClose={() => setFilters(false)} className="action-sheet">
          <div className="stack-sheet">
            <fieldset>
              <legend>Coleção</legend>
              <div className="filter-pills filter-pills--wrap">
                <button type="button" aria-pressed={!collection} onClick={() => setCollection(null)}>Todas</button>
                {shelves.map((name) => <button key={name} type="button" aria-pressed={collection === name} onClick={() => setCollection(name)}>{name}</button>)}
              </div>
            </fieldset>
            <label className="settings-row" style={{ padding: '6px 0' }}>
              <span className="settings-row__icon"><Heart size={18} /></span>
              <span className="settings-row__text"><strong>Só favoritos</strong></span>
              <span className="toggle"><input type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} /></span>
            </label>
            <label className="settings-row" style={{ padding: '6px 0' }}>
              <span className="settings-row__icon"><Library size={18} /></span>
              <span className="settings-row__text"><strong>Capa do livro como fundo</strong><small>O app adota as cores da história</small></span>
              <span className="toggle"><input type="checkbox" checked={!!appearance.coverBackdrop} disabled={busy} onChange={(event) => { const next = { ...appearance, coverBackdrop: event.target.checked }; saveAppearance(next); if (user?.emailVerified) void apiRequest(user, '/me/appearance', 'POST', { appearance: next }).catch(() => undefined) }} /></span>
            </label>
            <div className="action-menu">
              {shelves.map((name) => (
                <button key={name} type="button" onClick={() => { setFilters(false); setEditCollection(name) }}>
                  <span className="action-menu__icon"><FolderPen size={18} /></span>
                  <span>Editar “{name}”<small>Renomear ou excluir a coleção</small></span>
                </button>
              ))}
              <Link to="/app/library/gerenciar?importar=1" onClick={() => setFilters(false)}>
                <span className="action-menu__icon"><Upload size={18} /></span>
                <span>Importar EPUB<small>O livro fica salvo na sua conta</small></span>
              </Link>
              <Link to="/app/library/gerenciar?adicionar=1" onClick={() => setFilters(false)}>
                <span className="action-menu__icon"><BookPlus size={18} /></span>
                <span>Adicionar livro<small>Pelo catálogo ou à mão</small></span>
              </Link>
              <Link to="/app/library/gerenciar" onClick={() => setFilters(false)}>
                <span className="action-menu__icon"><Library size={18} /></span>
                <span>Gerenciar biblioteca<small>Importar EPUB, catálogo, arquivos e espaço na conta</small></span>
              </Link>
              <Link to="/app/history" onClick={() => setFilters(false)}>
                <span className="action-menu__icon"><BookOpen size={18} /></span>
                <span>Histórico de leituras</span>
              </Link>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  )
}

function CollectionForm({ title, initial = '', onClose, onSave, footer }: { title: string; initial?: string; onClose: () => void; onSave: (name: string) => Promise<boolean>; footer?: ReactNode }) {
  const [name, setName] = useState(initial)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    const ok = await onSave(name.trim())
    setSaving(false)
    if (!ok) setError('Não foi possível salvar. Confira se já existe uma coleção com esse nome.')
  }
  return (
    <Sheet title={title} onClose={onClose} className="action-sheet">
      <form className="stack-sheet" onSubmit={submit}>
        <label className="field">Nome da coleção<input autoFocus required maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Favoritos, Fantasia, Clube de leitura" /></label>
        {error && <p role="alert" className="access-error">{error}</p>}
        <Button disabled={saving || !name.trim()} aria-busy={saving}>{saving ? 'Salvando…' : 'Salvar coleção'}</Button>
      </form>
      {footer}
    </Sheet>
  )
}

/** Renomeia (cria a nova, move os livros e remove a antiga) ou exclui uma coleção. */
function CollectionEditor({ name, onClose, onRenamed, onRemoved }: { name: string; onClose: () => void; onRenamed: (name: string) => void; onRemoved: () => void }) {
  const { snapshot, act, busy } = useWorkspace()
  const [confirm, setConfirm] = useState(false)
  const books = snapshot!.state.books.filter((book) => snapshot!.reading[book.id]?.shelf === name)
  async function rename(next: string) {
    if (next === name) { onClose(); return true }
    if (!(await act({ type: 'shelf.add', name: next }))) return false
    for (const book of books) if (!(await act({ type: 'reading.update', id: book.id, shelf: next }))) return false
    if (!(await act({ type: 'shelf.remove', name }))) return false
    onRenamed(next)
    onClose()
    return true
  }
  return (
    <CollectionForm
      title={`Editar “${name}”`}
      initial={name}
      onClose={onClose}
      onSave={rename}
      footer={
        <div className="action-menu" style={{ marginTop: 16 }}>
          {confirm ? (
            <button type="button" className="is-danger" disabled={busy} onClick={() => void act({ type: 'shelf.remove', name }).then((ok) => { if (ok) { onRemoved(); onClose() } })}>
              <span className="action-menu__icon"><Trash2 size={18} /></span>
              <span>Confirmar exclusão<small>{books.length ? `Os ${books.length} livros continuam na biblioteca, sem coleção` : 'A coleção está vazia'}</small></span>
            </button>
          ) : (
            <button type="button" className="is-danger" onClick={() => setConfirm(true)}>
              <span className="action-menu__icon"><Trash2 size={18} /></span>
              <span>Excluir “{name}”</span>
            </button>
          )}
        </div>
      }
    />
  )
}

function MoveToCollection({ book, onDone }: { book: Book; onDone: () => void }) {
  const { snapshot, act, busy } = useWorkspace()
  const shelves = preferencesSchema.parse(snapshot!.preferences).shelves
  const current = snapshot!.reading[book.id]?.shelf ?? ''
  return (
    <label className="action-menu__select">
      <span className="action-menu__icon"><Layers size={19} /></span>
      <span>Coleção
        <select value={current} disabled={busy} onChange={(event) => void act({ type: 'reading.update', id: book.id, shelf: event.target.value }).then((ok) => ok && onDone())}>
          <option value="">Sem coleção</option>
          {shelves.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </span>
    </label>
  )
}
