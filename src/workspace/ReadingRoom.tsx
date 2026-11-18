import { ImmersiveReader, ReaderPanel } from './ImmersiveReader'
import { Sheet } from '../components/Sheet'
import { TextPages, StarRating } from './TextPages'
import { useLatestSave } from './useLatestSave'
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
      if (event.key === 'Escape' && !document.querySelector('.immersive-reader')) setFocused(false)
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [])
  const { snapshot, act, busy, scope } = useWorkspace()
  const book = snapshot!.state.books.find((book) => book.id === id)
  useEffect(() => {
    if (book?.id) rememberOpenedBook(book.id, user?.uid)
  }, [book?.id, user?.uid])
  const saved = id ? snapshot!.reading[id] : undefined
  const latestSaved = useRef(saved)
  latestSaved.current = saved
  const saveText = useLatestSave(act)
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
    setFocused(original || pages.length > 0)
  }, [id, original, pages.length])
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
  // A página muda na hora; a posição vai para a conta em segundo plano.
  async function turn(next: number) {
    const target = pages[next]
    if (!target || !book) return
    setPage(next)
    setSelection(null)
    const id = book.id,
      length = book.content.length
    saveText(() => ({
      type: 'reading.update',
      id,
      page: next,
      locator: target.start,
      percent: Math.round((target.end / length) * 100),
      expectedRevision: latestSaved.current?.revision ?? 0,
    }))
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
    // Ao focar a anotação, o navegador pode manter o Range e devolver texto vazio.
    // Preserve o trecho escolhido até salvar ou fechar o painel.
    if (!quote) return
    if (quote.length > 280) {
      setMessage('Selecione um trecho de até 280 caracteres.')
      setSelection(null)
      return
    }
    const prefix = range.cloneRange()
    prefix.selectNodeContents(article.current)
    prefix.setEnd(range.startContainer, range.startOffset)
    // Em rolagem, o artigo contém todo o capítulo, não só a página no topo.
    const origin = preferences.flow === 'scroll'
      ? pages.find((item) => item.chapter === current?.chapter)?.start ?? 0
      : current?.start ?? 0
    const start = origin + prefix.toString().length
    if (book!.content.slice(start, start + quote.length) === quote)
      setSelection({ quote, start, end: start + quote.length })
  }
  /** Texto de um trecho do livro com os destaques da pessoa marcados. */
  function renderRange(from: number, to: number) {
    const parts: React.ReactNode[] = []
    let last = from
    for (const mark of annotations
      .filter((item) => item.start >= from && item.end <= to)
      .sort((a, b) => a.start - b.start)) {
      if (mark.start < last) continue
      parts.push(
        book!.content.slice(last, mark.start),
        <mark key={mark.id} title={mark.note || 'Destaque privado'}>
          {book!.content.slice(mark.start, mark.end)}
        </mark>,
      )
      last = mark.end
    }
    parts.push(book!.content.slice(last, to))
    return parts
  }
  const segments = renderRange(current?.start ?? 0, current?.end ?? 0)
  const hasEpub = scope === 'personal'
  if (original)
    return (
      <ImmersiveReader
        title={book.title}
        preferences={preferences}
        mode={{
          label: 'Ler versão em texto',
          run: () => {
            manualMode.current = true
            setOriginal(false)
          },
        }}
      >
        <EpubReader bookId={book.id} title={book.title} author={book.author} />
        <ReaderSettings />
      </ImmersiveReader>
    )
  if (pages.length > 0)
    return (
      <ImmersiveReader
        title={book.title}
        preferences={preferences}
        mode={
          hasEpub
            ? {
                label: 'Abrir o livro original (EPUB)',
                run: () => {
                  manualMode.current = true
                  setOriginal(true)
                },
              }
            : undefined
        }
      >
        <TextPages
          pages={pages}
          page={page}
          busy={busy}
          paged={preferences.flow !== 'scroll'}
          edgeTaps={preferences.edgeTaps !== false}
          animate={preferences.pageAnimation !== false}
          chapterTitle={(index) => book.chapters?.[index]?.title ?? 'Sua leitura'}
          renderRange={renderRange}
          articleRef={article}
          onSelect={selected}
          onTurn={(next) => void turn(next)}
          style={{ fontSize: preferences.size, fontFamily: readerFont(preferences.font) }}
        />
        <ReaderSettings />
        <ReaderPanel name="contents">
          <div className="reader-contents">
            <label className="reader-search-field">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">Pesquisar no livro</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Pesquisar no livro"
              />
            </label>
            {query.trim().length >= 2 ? (
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
            ) : (
              <ol className="reader-chapters">
                {(book.chapters?.length ? book.chapters : [{ title: 'Texto completo' }]).map(
                  (chapter, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        disabled={busy}
                        aria-current={(current?.chapter ?? 0) === i ? 'true' : undefined}
                        onClick={() => void turn(Math.max(0, pages.findIndex((item) => item.chapter === i)))}
                      >
                        {chapter.title}
                      </button>
                    </li>
                  ),
                )}
              </ol>
            )}
          </div>
        </ReaderPanel>
        <ReaderPanel name="tools">
          <div className="reader-tools">
            <p className="t-caption">
              Página {page + 1} de {pages.length} · {saved?.percent ?? 0}% lido
            </p>
            <div className="reader-tools__grid">
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
                <Bookmark size={16} aria-hidden="true" />
                {saved?.bookmark === page ? 'Remover marcador' : 'Marcar página'}
              </Button>
              <Button
                variant="secondary"
                disabled={busy || saved?.bookmark == null}
                onClick={() => void turn(Math.min(saved?.bookmark ?? 0, pages.length - 1))}
              >
                Ir ao marcador
              </Button>
            </div>
            <div className="reader-tools__row">
              <StarRating
                value={saved?.rating ?? 0}
                disabled={busy}
                onChange={(stars) =>
                  void act({
                    type: 'reading.update',
                    id: book.id,
                    rating: stars,
                    expectedRevision: saved?.revision ?? 0,
                  })
                }
              />
              <BookShare
                compact
                book={{ id: book.id, title: book.title, author: book.author, coverUrl: book.metadata?.cover }}
              />
            </div>
            <Button
              className="button--wide"
              variant={saved?.percent === 100 ? 'ghost' : 'primary'}
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
              {saved?.percent === 100 ? 'Leitura concluída' : 'Concluir leitura'}
            </Button>
            {message && <p role="status">{message}</p>}
            <h3>Destaques</h3>
            {!annotations.length && (
              <p className="t-caption">Selecione um trecho do livro para destacar.</p>
            )}
            {annotations.map((item) => (
              <div className="card reader-highlight" key={item.id}>
                <blockquote>{item.quote}</blockquote>
                {item.note && <p className="preserve-text">{item.note}</p>}
                <div className="reader-tools__grid">
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void turn(pageAt(pages, item.start))}
                  >
                    Ir ao trecho
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
                    Excluir
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ReaderPanel>
        {selection && (
          <Sheet title="Guardar um trecho" className="reader-sheet" onClose={() => setSelection(null)}>
            <div className="workspace-form">
              <blockquote>{selection.quote}</blockquote>
              <label>
                Anotação privada
                <textarea maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <Button
                disabled={busy}
                onClick={() =>
                  void act({ type: 'reading.annotate', id: book.id, ...selection, note }).then(
                    (ok) => {
                      if (ok) {
                        setSelection(null)
                        setNote('')
                        setMessage('Destaque salvo só na sua leitura.')
                      }
                    },
                  )
                }
              >
                <Highlighter size={16} aria-hidden="true" /> Salvar destaque
              </Button>
              <QuoteShare
                quote={selection.quote}
                title={book.title}
                author={book.author}
                source={`Leitura de texto · ${book.chapters?.[current?.chapter ?? 0]?.title ?? 'Trecho'}`}
              />
            </div>
          </Sheet>
        )}
      </ImmersiveReader>
    )
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
