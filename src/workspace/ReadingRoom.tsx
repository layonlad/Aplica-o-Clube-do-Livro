import { QuoteShare } from '../community/QuoteShare'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Bookmark, Highlighter, Search } from 'lucide-react'
import { preferencesSchema } from '../../server/src/workspace-model'
import { Button, Card, ProgressBar } from '../components/ui'
import { useWorkspace } from './WorkspaceProvider'
import { pageAt, readingPages } from './reading-layout'
import './reading-room.css'

const EpubReader = lazy(() =>
  import('./EpubReader').then((module) => ({ default: module.EpubReader })),
)
export function ReadingRoom() {
  const { id } = useParams()
  const { snapshot, act, busy, scope } = useWorkspace()
  const book = snapshot!.state.books.find((book) => book.id === id)
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
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [selection, setSelection] = useState<{ quote: string; start: number; end: number } | null>(
    null,
  )
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
    >
      <Link className="reading-room-back" to="/app/library">← Minha biblioteca</Link>
      <header className="reading-room-title">
        <span className="eyebrow">MEU ESPAÇO DE LEITURA</span>
        <h1>{book.title}</h1>
        <p>{book.author}</p>
      </header>
      <details className="reader-settings">
        <summary>Preferências de leitura</summary>
        <div className="reader-settings-grid">
          <label>
            Tamanho da fonte
            <select
              value={preferences.size}
              disabled={busy}
              onChange={(e) =>
                void act({
                  type: 'reader.preferences',
                  reader: { ...preferences, size: Number(e.target.value) },
                })
              }
            >
              {[16, 18, 20, 22, 24, 28, 32].map((size) => (
                <option key={size} value={size}>
                  {size} px
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipografia
            <select
              value={preferences.font}
              disabled={busy}
              onChange={(e) =>
                void act({
                  type: 'reader.preferences',
                  reader: { ...preferences, font: e.target.value as 'serif' | 'sans' },
                })
              }
            >
              <option value="serif">Editorial</option>
              <option value="sans">Sem serifa</option>
            </select>
          </label>
          <label>
            Tema de leitura
            <select
              value={preferences.theme}
              disabled={busy}
              onChange={(e) =>
                void act({
                  type: 'reader.preferences',
                  reader: { ...preferences, theme: e.target.value as typeof preferences.theme },
                })
              }
            >
              <option value="light">Claro</option>
              <option value="dark">Escuro</option>
              <option value="sepia">Sépia</option>
            </select>
          </label>
          <label>
            Margens
            <select
              value={preferences.margin}
              disabled={busy}
              onChange={(e) =>
                void act({
                  type: 'reader.preferences',
                  reader: { ...preferences, margin: e.target.value as typeof preferences.margin },
                })
              }
            >
              <option value="compact">Compactas</option>
              <option value="comfortable">Confortáveis</option>
              <option value="wide">Ampliação lateral</option>
            </select>
          </label>
        </div>
      </details>
      {scope === 'personal' && (
        <div className="reader-mode" role="group" aria-label="Modo de leitura">
          <button type="button" aria-pressed={!original} onClick={() => setOriginal(false)}>
            Texto simples
          </button>
          <button type="button" aria-pressed={original} onClick={() => setOriginal(true)}>
            EPUB original
          </button>
        </div>
      )}
      {original && scope === 'personal' ? (
        <Suspense fallback={<p role="status">Abrindo leitor EPUB…</p>}>
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
              fontFamily: preferences.font === 'serif' ? 'Georgia, serif' : 'system-ui, sans-serif',
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
                  void act({ type: 'reading.annotate', id: book.id, ...selection, note }).then(
                    (ok) => {
                      if (ok) {
                        setSelection(null)
                        setNote('')
                        setMessage('Destaque e anotação salvos somente na sua leitura.')
                      }
                    },
                  )
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
      ) : (
        <p>
          Livro cadastrado para leitura física ou em outro aplicativo. O progresso pode ser
          registrado abaixo.
        </p>
      )}
      <Card>
        <form
          className="workspace-form"
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
            Progresso (%)
            <input
              aria-label="Progresso de leitura"
              type="number"
              required
              min={0}
              max={100}
              value={percent}
              onChange={(e) => setPercent(Number(e.target.value))}
            />
          </label>
          <Button disabled={busy}>Salvar progresso</Button>
        </form>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() =>
            void act({
              type: 'reading.update',
              id: book.id,
              percent: 100,
              expectedRevision: saved?.revision ?? 0,
            }).then((ok) => ok && setMessage('Leitura concluída e adicionada ao histórico.'))
          }
        >
          Concluir leitura
        </Button>
        <label>
          Sua avaliação
          <select
            aria-label="Sua avaliação"
            value={saved?.rating ?? 0}
            disabled={busy}
            onChange={(e) =>
              void act({
                type: 'reading.update',
                id: book.id,
                rating: Number(e.target.value),
                expectedRevision: saved?.revision ?? 0,
              })
            }
          >
            <option value={0}>Sem avaliação</option>
            {[1, 2, 3, 4, 5].map((stars) => (
              <option key={stars} value={stars}>
                {stars}/5
              </option>
            ))}
          </select>
        </label>
      </Card>
      <ProgressBar value={saved?.percent ?? 0} label="Seu progresso salvo" />
      {message && <p role="status">{message}</p>}
      <section className="stack-lg">
        <h2>Destaques e anotações privadas</h2>
        {!annotations.length && (
          <p>
            Selecione um pequeno trecho durante a leitura para guardar um destaque. Ele não será
            publicado no clube ou na comunidade.
          </p>
        )}
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
