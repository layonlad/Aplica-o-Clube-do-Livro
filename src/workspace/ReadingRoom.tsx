import { QuoteShare } from '../community/QuoteShare'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Bookmark, Highlighter, Search, Expand, Minimize, Star, Check, ArrowLeft } from 'lucide-react'
import { preferencesSchema } from '../../server/src/workspace-model'
import { Button, Card } from '../components/ui'
import { rememberOpenedBook } from './CoverBackdrop'
import { BookShare } from './BookShare'
import { useWorkspace } from './WorkspaceProvider'
import { pageAt, readingPages } from './reading-layout'
import './reading-room.css'
import { ReaderSettings, readerFont, readerStyle } from './ReaderSettings'
import { useAuth } from '../auth/AuthProvider'
import { localEpub } from './epub-storage'
import { apiRequest } from '../auth/api'

const EpubReader = lazy(() =>
  import('./EpubReader').then((module) => ({ default: module.EpubReader })),
)
export function ReadingRoom() {
  const { id } = useParams()
  const { user } = useAuth()
  const manualMode = useRef(false)
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (focused) document.documentElement.dataset.readerFocus = 'true'
    else delete document.documentElement.dataset.readerFocus
    return () => {
      delete document.documentElement.dataset.readerFocus
    }
  }, [focused])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFocused(false)
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [])
  const { snapshot, act, busy, scope } = useWorkspace()
  const book = snapshot!.state.books.find((book) => book.id === id)
  useEffect(() => {
    if (book?.id) rememberOpenedBook(book.id)
  }, [book?.id])
  const saved = id ? snapshot!.reading[id] : undefined
  const preferences = preferencesSchema.parse(snapshot!.preferences).reader
  const pages = useMemo(
    () => readingPages(book?.content ?? '', book?.chapters),
    [book?.content, book?.chapters],
  )
  const [page, setPage] = useState(
    saved?.locator !== undefined
      ? pageAt(pages, saved.locator)
      : Math.min(saved?.page ?? 0, Math.max(0, pages.length - 1)),
  )
  const [percent, setPercent] = useState(saved?.percent ?? 0)
  const [original, setOriginal] = useState(
    Boolean(
      saved?.epubLocator ||
      (scope === 'personal' && book?.metadata?.source?.startsWith('EPUB importado')),
    ),
  )
  useEffect(() => {
    setFocused(original)
  }, [id, original])
  useEffect(() => {
    if (!id || scope !== 'personal') return
    let live = true
    void (async () => {
      const record = await localEpub(user?.emailVerified ? user.uid : 'visitor', id).catch(
        () => undefined,
      )
      if (record) {
        if (live && !manualMode.current) setOriginal(true)
        return
      }
      if (user?.emailVerified) {
        const result = await apiRequest<{ items: unknown[] }>(user, `/me/book-files/${id}`)
        if (live && !manualMode.current && result.items.length) setOriginal(true)
      }
    })().catch(() => {})
    return () => {
      live = false
    }
  }, [id, scope, user?.uid, user?.emailVerified])
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [selection, setSelection] = useState<{
    quote: string
    start: number
    end: number
  } | null>(null)
  const [note, setNote] = useState('')
  const article = useRef<HTMLElement>(null)
  const current = pages[page]
  const text = book?.content.slice(current?.start ?? 0, current?.end ?? 0) ?? ''
  const annotations = saved?.annotations ?? []
  useEffect(() => {
    setPercent(saved?.percent ?? 0)
  }, [saved?.percent])
  useEffect(() => {
    setPage(
      saved?.locator !== undefined
        ? pageAt(pages, saved.locator)
        : Math.min(saved?.page ?? 0, Math.max(0, pages.length - 1)),
    )
    setSelection(null)
    manualMode.current = false
    setOriginal(
      Boolean(
        saved?.epubLocator ||
        (scope === 'personal' && book?.metadata?.source?.startsWith('EPUB importado')),
      ),
    )
  }, [id])
  useEffect(() => {
    document.addEventListener('selectionchange', selected)
    return () => document.removeEventListener('selectionchange', selected)
  }, [book?.id, current?.start])
  const matches = useMemo(() => {
    if (!book || query.trim().length < 2) return []
    const needle = query.toLocaleLowerCase()
    const haystack = book.content.toLocaleLowerCase()
    const result: { offset: number; preview: string }[] = []
    for (
      let offset = haystack.indexOf(needle);
      offset >= 0 && result.length < 50;
      offset = haystack.indexOf(needle, offset + needle.length)
    )
      result.push({
        offset,
        preview: book.content.slice(Math.max(0, offset - 30), offset + needle.length + 80),
      })
    return result
  }, [query, book?.content])
  if (!book)
    return (
      <Card>
        <h1>Escolha uma leitura</h1>
        <Link to="/app/library">Voltar à biblioteca</Link>
      </Card>
    )
  async function turn(next: number) {
    const target = pages[next]
    if (!target) return
    const ok = await act({
      type: 'reading.update',
      id: book!.id,
      page: next,
      locator: target.start,
      percent: Math.round((target.end / book!.content.length) * 100),
      expectedRevision: saved?.revision ?? 0,
    })
    if (ok) {
      setPage(next)
      setSelection(null)
      setMessage('Posição salva. Você pode continuar daqui depois.')
    }
  }
  function selected() {
    const value = window.getSelection()
    if (!value?.rangeCount || value.isCollapsed || !article.current) return
    const range = value.getRangeAt(0)
    if (
      !article.current.contains(range.startContainer) ||
      !article.current.contains(range.endContainer)
    )
      return
    const quote = value.toString()
    if (quote.length > 280) {
      setMessage('Selecione um trecho de até 280 caracteres.')
      setSelection(null)
      return
    }
    const prefix = range.cloneRange()
    prefix.selectNodeContents(article.current)
    prefix.setEnd(range.startContainer, range.startOffset)
    const start = (current?.start ?? 0) + prefix.toString().length
    if (book!.content.slice(start, start + quote.length) === quote)
      setSelection({ quote, start, end: start + quote.length })
  }
  const pageMarks = annotations
    .filter((item) => current && item.start >= current.start && item.end <= current.end)
    .sort((a, b) => a.start - b.start)
  const segments: React.ReactNode[] = []
  let last = 0
  for (const mark of pageMarks) {
    const from = mark.start - (current?.start ?? 0),
      to = mark.end - (current?.start ?? 0)
    if (from < last) continue
    segments.push(
      text.slice(last, from),
      <mark key={mark.id} title={mark.note || 'Destaque privado'}>
        {text.slice(from, to)}
      </mark>,
    )
    last = to
  }
  segments.push(text.slice(last))
  return (
    <div
      className={`reading-room reading-room--${preferences.theme} reading-room--${preferences.margin}`}
      style={readerStyle(preferences)}
    >
      <div className="reading-progress" role="progressbar" aria-label="Progresso da leitura" aria-valuenow={saved?.percent ?? 0} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${saved?.percent ?? 0}%` }} />
      </div>
      <Link className="reading-room-back" to="/app/library">
        <ArrowLeft size={17} aria-hidden="true" /> Biblioteca
      </Link>
      <Button
        className="reader-focus-toggle"
        variant="ghost"
        onClick={() => setFocused((value) => !value)}
      >
        {focused ? <Minimize size={18} /> : <Expand size={18} />}{' '}
        {focused ? 'Mostrar menu' : 'Tela cheia'}
      </Button>
      <header className="reading-room-title">
        <h1>{book.title}</h1>
        <p>
          {book.author}
          <span className="reading-room-percent">{saved?.percent ?? 0}% lido</span>
        </p>
      </header>
      <ReaderSettings />
      {scope === 'personal' && (
        <div className="reader-mode" role="group" aria-label="Modo de leitura">
          <button
            type="button"
            aria-pressed={!original}
            onClick={() => {
              manualMode.current = true
              setOriginal(false)
            }}
          >
            Texto
          </button>
          <button
            type="button"
            aria-pressed={original}
            onClick={() => {
              manualMode.current = true
              setOriginal(true)
            }}
          >
            Livro original
          </button>
        </div>
      )}
      {original && scope === 'personal' ? (
        <Suspense fallback={<p role="status" className="t-caption">Abrindo o livro…</p>}>
          <EpubReader key={book.id} bookId={book.id} title={book.title} author={book.author} />
        </Suspense>
      ) : pages.length > 0 ? (
        <>
          <div className="reader-settings-grid">
            <label>
              Sumário
              <select
                aria-label="Sumário"
                disabled={busy}
                value={current?.chapter ?? 0}
                onChange={(e) => {
                  const index = pages.findIndex((page) => page.chapter === Number(e.target.value))
                  void turn(index)
                }}
              >
                {(book.chapters?.length ? book.chapters : [{ title: 'Texto completo' }]).map(
                  (chapter, i) => (
                    <option key={i} value={i}>
                      {chapter.title}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              <Search size={16} />
              Pesquisar no livro
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Pelo menos 2 caracteres"
              />
            </label>
          </div>
          {query.trim().length >= 2 && (
            <div className="reader-search-results" aria-label="Resultados no livro">
              <p>
                {matches.length}
                {matches.length === 50 ? '+' : ''} resultado(s)
              </p>
              {matches.map((match) => (
                <button
                  key={match.offset}
                  disabled={busy}
                  onClick={() => {
                    void turn(pageAt(pages, match.offset))
                    setQuery('')
                  }}
                >
                  {match.preview}
                </button>
              ))}
            </div>
          )}
          <p className="reader-chapter-label">
            {book.chapters?.[current?.chapter ?? 0]?.title ?? 'Sua leitura'} · página {page + 1} de{' '}
            {pages.length}
          </p>
          <article
            ref={article}
            className="reader-prose"
            onMouseUp={selected}
            onKeyUp={selected}
            onTouchEnd={selected}
            style={{
              fontSize: preferences.size,
              fontFamily: readerFont(preferences.font),
            }}
          >
            {segments}
          </article>
          {selection && (
            <Card>
              <h2>
                <Highlighter size={18} /> Guardar um trecho
              </h2>
              <blockquote>{selection.quote}</blockquote>
              <label>
                Anotação privada
                <textarea maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <Button
                disabled={busy}
                onClick={() =>
                  void act({
                    type: 'reading.annotate',
                    id: book.id,
                    ...selection,
                    note,
                  }).then((ok) => {
                    if (ok) {
                      setSelection(null)
                      setNote('')
                      setMessage('Destaque e anotação salvos somente na sua leitura.')
                    }
                  })
                }
              >
                Salvar destaque
              </Button>
              <Button variant="ghost" onClick={() => setSelection(null)}>
                Cancelar
              </Button>
              <QuoteShare
                quote={selection.quote}
                title={book.title}
                author={book.author}
                source={`Leitura de texto · ${book.chapters?.[current?.chapter ?? 0]?.title ?? 'Trecho'}`}
              />
            </Card>
          )}
          <nav className="workspace-actions" aria-label="Navegar no livro">
            <Button disabled={busy || page === 0} onClick={() => void turn(page - 1)}>
              Anterior
            </Button>
            <label>
              Página
              <select
                aria-label="Página do livro"
                value={page}
                disabled={busy}
                onChange={(e) => void turn(Number(e.target.value))}
              >
                {pages.map((_, i) => (
                  <option key={i} value={i}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
            <Button
              disabled={busy || page === pages.length - 1}
              onClick={() => void turn(page + 1)}
            >
              Próxima
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void act({
                  type: 'reading.update',
                  id: book.id,
                  bookmark: saved?.bookmark === page ? null : page,
                  expectedRevision: saved?.revision ?? 0,
                })
              }
            >
              <Bookmark size={16} />
              {saved?.bookmark === page ? 'Remover marcador' : 'Marcar página'}
            </Button>
            {saved?.bookmark != null && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void turn(Math.min(saved.bookmark!, pages.length - 1))}
              >
                Ir ao marcador
              </Button>
            )}
          </nav>
        </>
      ) : null}
      <Card className="reading-finish">
        {!book.content && !original && (
          <form
            className="reading-manual"
            onSubmit={(e) => {
              e.preventDefault()
              void act({
                type: 'reading.update',
                id: book.id,
                percent,
                expectedRevision: saved?.revision ?? 0,
              }).then((ok) => ok && setMessage('Progresso salvo.'))
            }}
          >
            <label>
              Quanto você já leu?
              <span className="reading-manual__row">
                <input
                  aria-label="Progresso de leitura"
                  type="range"
                  min={0}
                  max={100}
                  value={percent}
                  onChange={(e) => setPercent(Number(e.target.value))}
                />
                <output>{percent}%</output>
              </span>
            </label>
            <Button disabled={busy || percent === (saved?.percent ?? 0)}>Salvar</Button>
          </form>
        )}
        <div className="reading-finish__row">
          <div className="star-rating" role="radiogroup" aria-label="Sua avaliação">
            {[1, 2, 3, 4, 5].map((stars) => (
              <button
                key={stars}
                type="button"
                role="radio"
                aria-checked={(saved?.rating ?? 0) === stars}
                aria-label={`${stars} de 5`}
                className={(saved?.rating ?? 0) >= stars ? 'is-on' : ''}
                disabled={busy}
                onClick={() =>
                  void act({
                    type: 'reading.update',
                    id: book.id,
                    rating: saved?.rating === stars ? 0 : stars,
                    expectedRevision: saved?.revision ?? 0,
                  })
                }
              >
                <Star size={22} fill={(saved?.rating ?? 0) >= stars ? 'currentColor' : 'none'} aria-hidden="true" />
              </button>
            ))}
          </div>
          <BookShare compact book={{ id: book.id, title: book.title, author: book.author, coverUrl: book.metadata?.cover }} />
          <Button
            variant={saved?.percent === 100 ? 'ghost' : 'secondary'}
            disabled={busy || saved?.percent === 100}
            onClick={() =>
              void act({
                type: 'reading.update',
                id: book.id,
                percent: 100,
                expectedRevision: saved?.revision ?? 0,
              }).then((ok) => ok && setMessage('Leitura concluída!'))
            }
          >
            <Check size={17} aria-hidden="true" />
            {saved?.percent === 100 ? 'Concluído' : 'Concluir'}
          </Button>
        </div>
      </Card>
      {message && <p role="status">{message}</p>}
      <section className="stack-lg">
        <h2>Destaques</h2>
        {!annotations.length && <p className="t-caption">Selecione um trecho do livro para destacar.</p>}
        {annotations.map((item) => (
          <Card key={item.id}>
            <blockquote>{item.quote}</blockquote>
            <p className="preserve-text">{item.note}</p>
            <div className="workspace-actions">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void turn(pageAt(pages, item.start))}
              >
                Voltar ao trecho
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void act({
                    type: 'reading.annotation.remove',
                    id: book.id,
                    annotationId: item.id,
                  })
                }
              >
                Excluir destaque
              </Button>
            </div>
            <QuoteShare
              quote={item.quote}
              title={book.title}
              author={book.author}
              source="Destaque da minha leitura"
            />
          </Card>
        ))}
      </section>
    </div>
  )
}
