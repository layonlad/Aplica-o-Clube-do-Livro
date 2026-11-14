import { ClubBookFile } from '../clubs/ClubBookFile'
import { PrivateBookCover } from './PrivateBookCover'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest } from '../auth/api'
import { readEpub } from './epub-archive'
import { saveEpub } from './epub-storage'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BookOpen, Heart, Search } from 'lucide-react'
import type { z } from 'zod'
import type { bookMetadataSchema, WorkspaceState } from '../../server/src/workspace-model'
import { preferencesSchema } from '../../server/src/workspace-model'
import type { CatalogEntry } from '../../server/src/catalog'
import { Button, Card, CoverArt, ProgressBar } from '../components/ui'
import { importBook, type ImportedBook } from './import-book'
import { useWorkspace } from './WorkspaceProvider'
import './library-room.css'
import { PrivateBookFile } from './PrivateBookFile'

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
    [params] = useSearchParams(),
    sample = params.get('sample')
  const [originalFile, setOriginalFile] = useState<File | null>(null),
    [cloudOriginal, setCloudOriginal] = useState(true)
  const { snapshot, act, busy, scope } = useWorkspace()
  const { state, reading, role } = snapshot!
  const preferences = preferencesSchema.parse(snapshot!.preferences)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [show, setShow] = useState(false)
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
      const archive = await readEpub(file),
        cover = archive.coverPath ? archive.images.get(archive.coverPath) : null
      await saveEpub(
        user?.emailVerified ? user.uid : 'visitor',
        id,
        file,
        file.name,
        cover ? new Blob([new Uint8Array(cover.bytes)], { type: cover.mime }) : undefined,
      )
      if (user?.emailVerified && cloudOriginal) {
        const bytes = new Uint8Array(await file.arrayBuffer())
        let binary = ''
        for (let index = 0; index < bytes.length; index += 16384)
          binary += String.fromCharCode(...bytes.subarray(index, index + 16384))
        await apiRequest(user, `/me/book-files/${id}`, 'POST', {
          filename: file.name,
          data: btoa(binary),
        })
        setMessage('Livro e EPUB privado guardados na sua conta.')
      } else setMessage('Livro e EPUB guardados neste navegador.')
    } catch (error) {
      setMessage(
        'O livro foi adicionado, mas o original não foi guardado por completo: ' +
          (error as Error).message,
      )
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault()
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
          if (originalFile && scope === 'personal') {
            const created = next.state.books[0]
            if (created) void preserveOriginal(created.id, originalFile)
          }
        })
    if (ok) {
      setShow(false)
      setEditing(null)
      setDraft(blank())
      setMessage(editing ? 'Dados do livro atualizados.' : 'Livro adicionado à biblioteca.')
    }
  }
  async function file(file: File) {
    setImporting(true)
    setMessage('')
    try {
      if (/\.epub$/i.test(file.name)) await readEpub(file)
      const imported = await importBook(file)
      setDraft({
        title: imported.title.slice(0, 150),
        author: imported.author.slice(0, 150),
        category: '',
        content: imported.content,
        metadata: imported.metadata ?? {},
        chapters: imported.chapters,
      })
      setOriginalFile(/\.epub$/i.test(file.name) ? file : null)
      setEditing(null)
      setShow(true)
      setMessage('Confira os dados extraídos antes de adicionar o livro.')
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setImporting(false)
    }
  }
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
            new File([blob], 'a-cadeira-perto-da-janela.epub', { type: 'application/epub+zip' }),
          )
      })
      .catch((error) => live && setMessage((error as Error).message))
    return () => {
      live = false
    }
  }, [sample])
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
          <span className="eyebrow">
            {scope === 'personal' ? 'MEU ESPAÇO DE LEITURA' : 'ACERVO COMPARTILHADO'}
          </span>
          <h1>Sua biblioteca</h1>
          <p>Uma estante para cada capítulo da sua vida.</p>
          <Link to="/app/downloads">Arquivos autorizados e leituras de demonstração →</Link>
        </div>
        {['owner', 'admin'].includes(role) && (
          <Button
            onClick={() => {
              setEditing(null)
              setOriginalFile(null)
              setDraft(blank())
              setShow(!show)
            }}
          >
            Adicionar livro
          </Button>
        )}
      </header>
      {['owner', 'admin'].includes(role) && (
        <details className="library-discovery">
          <summary>
            <Search size={17} /> Buscar um título no catálogo
          </summary>
          <p>
            A pesquisa envia o título ou autor informado à Open Library. Os resultados são
            metadados; arquivos e direitos de distribuição são separados.
          </p>
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
                      setMessage('Confira a edição e salve os metadados na sua biblioteca.')
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
      {['owner', 'admin'].includes(role) && (
        <label className="file-button">
          {importing ? 'Abrindo arquivo…' : 'Importar EPUB ou TXT'}
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
      )}
      {message && <p role="status">{message}</p>}
      {show && (
        <Card>
          <form className="workspace-form" onSubmit={save}>
            <h2>{editing ? 'Editar metadados' : 'Adicionar à biblioteca'}</h2>
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
                      setDraft({ ...draft, metadata: { ...draft.metadata, [key]: e.target.value } })
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
                  setDraft({ ...draft, metadata: { ...draft.metadata, synopsis: e.target.value } })
                }
              />
            </label>
            <label>
              Origem e condições de uso
              <input
                maxLength={500}
                value={draft.metadata.license ?? ''}
                onChange={(e) =>
                  setDraft({ ...draft, metadata: { ...draft.metadata, license: e.target.value } })
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
                    setDraft({ ...draft, content: e.target.value, chapters: undefined })
                  }
                />
              </label>
            )}
            {originalFile && scope === 'personal' && user?.emailVerified && (
              <label className="workspace-check">
                <input
                  type="checkbox"
                  checked={cloudOriginal}
                  onChange={(e) => setCloudOriginal(e.target.checked)}
                />
                Guardar também o EPUB original no armazenamento privado da minha conta
              </label>
            )}
            <small>
              Importe somente conteúdo que você pode usar
              {scope !== 'personal' ? ' e compartilhar com este clube' : ''}. O arquivo original não
              é enviado ao catálogo público.
            </small>
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
        <summary>Organizar estantes personalizadas</summary>
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
      <p className="library-count">{books.length} título(s) nesta estante</p>
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
          <h2>
            {state.books.length
              ? 'Sua próxima leitura pode estar em outra estante'
              : 'Uma estante pronta para suas histórias'}
          </h2>
          <p>
            {state.books.length
              ? 'Experimente outro filtro ou adicione um título.'
              : 'Cadastre um livro físico ou importe um EPUB para começar.'}
          </p>
        </div>
      )}
    </div>
  )
}
function BookItem({ book, onEdit }: { book: Book; onEdit: () => void }) {
  const { snapshot, act, busy, scope, addToPersonal } = useWorkspace()
  const [added, setAdded] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const saved = snapshot!.reading[book.id]
  const owner = ['owner', 'admin'].includes(snapshot!.role)
  const prefs = preferencesSchema.parse(snapshot!.preferences)
  const status =
    saved?.status ?? (saved?.percent === 100 ? 'finished' : saved?.percent ? 'reading' : 'want')
  return (
    <article className="library-book">
      <div className="library-book-identity">
        {book.metadata?.cover ? (
          <img
            className="library-cover"
            src={book.metadata.cover}
            alt={`Capa de ${book.title}`}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <PrivateBookCover id={book.id} title={book.title} author={book.author} />
        )}
        <div>
          <span className="eyebrow">{book.category || 'LITERATURA'}</span>
          <h2>{book.title}</h2>
          <p>{book.author}</p>
          <p className="book-edition">
            {[book.metadata?.publisher, book.metadata?.year, book.metadata?.language]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <Button
            variant="ghost"
            disabled={busy}
            aria-label={`${saved?.favorite ? 'Retirar dos' : 'Adicionar aos'} favoritos: ${book.title}`}
            onClick={() =>
              void act({ type: 'reading.update', id: book.id, favorite: !saved?.favorite })
            }
          >
            <Heart size={17} fill={saved?.favorite ? 'currentColor' : 'none'} />
            {saved?.favorite ? 'Favorito' : 'Favoritar'}
          </Button>
        </div>
      </div>
      <ProgressBar value={saved?.percent ?? 0} label="Seu progresso" />
      <div className="book-metadata-grid">
        <label>
          Status de leitura
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
        <label>
          Sua estante
          <select
            disabled={busy}
            value={saved?.shelf ?? ''}
            onChange={(e) =>
              void act({ type: 'reading.update', id: book.id, shelf: e.target.value })
            }
          >
            <option value="">Sem estante personalizada</option>
            {prefs.shelves.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {scope !== 'personal' && (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() =>
            void addToPersonal({
              title: book.title,
              author: book.author,
              category: book.category,
              metadata: book.metadata,
            }).then((ok) => ok && setAdded(true))
          }
        >
          {added ? 'Título na biblioteca pessoal' : 'Adicionar à minha biblioteca'}
        </Button>
      )}
      <Link className="button-link" to={`/app/reader/${book.id}`}>
        {book.content ? 'Ler agora' : 'Acompanhar leitura'} →
      </Link>
      <details>
        <summary>Sobre esta edição</summary>
        <p className="preserve-text">{book.metadata?.synopsis || 'Sinopse não informada.'}</p>
        <p>
          {book.metadata?.ratingAverage !== undefined && (
            <>
              Avaliação na Open Library: {book.metadata.ratingAverage.toFixed(1)}/5 ·{' '}
              {book.metadata.ratingCount} avaliação(ões).
            </>
          )}
        </p>
        <p>
          ISBN: {book.metadata?.isbn || 'Não informado'}
          {book.metadata?.pages ? ` · ${book.metadata.pages} páginas` : ''}
        </p>
        <p>
          {book.metadata?.license ||
            'A disponibilidade do arquivo é independente do cadastro bibliográfico.'}
        </p>
        {book.metadata?.source && (
          <small className="preserve-text">Origem: {book.metadata.source}</small>
        )}
      </details>
      {scope === 'personal' ? (
        <PrivateBookFile bookId={book.id} />
      ) : (
        <ClubBookFile clubId={scope} bookId={book.id} />
      )}
      {owner && (
        <div className="workspace-actions">
          <Button variant="ghost" disabled={busy} onClick={onEdit}>
            Editar dados
          </Button>
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
            {snapshot!.state.currentBookId === book.id ? 'Tirar destaque' : 'Destacar leitura'}
          </Button>
          {confirm ? (
            <>
              <span>Excluir este livro?</span>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => void act({ type: 'book.remove', id: book.id })}
              >
                Confirmar exclusão
              </Button>
              <Button variant="ghost" onClick={() => setConfirm(false)}>
                Cancelar
              </Button>
            </>
          ) : (
            <Button variant="ghost" disabled={busy} onClick={() => setConfirm(true)}>
              Remover livro
            </Button>
          )}
        </div>
      )}
    </article>
  )
}
