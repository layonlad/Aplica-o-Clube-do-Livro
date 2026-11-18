import { Sheet } from '../components/Sheet'
import { Search } from 'lucide-react'
import { ReaderPanel, useReaderChrome } from './ImmersiveReader'
import { useLatestSave } from './useLatestSave'
import { readingGesture, type ReadingGesture } from './reader-gestures'
import { preparePageTurn } from './page-turn'
import { Fragment, createElement, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, authenticatedResponse, readableError } from '../auth/api'
import { useWorkspace } from './WorkspaceProvider'
import { Button } from '../components/ui'
import { readEpub, epubPath, type EpubArchive } from './epub-archive'
import { localEpub, saveEpub, removeEpub } from './epub-storage'
import { uploadOriginal } from './book-files'
import { preferencesSchema } from '../../server/src/workspace-model'
import { QuoteShare } from '../community/QuoteShare'
import { readerFont } from './ReaderSettings'
import { useEpubPagination } from './useEpubPagination'
const tags = new Set(
    'p div section h1 h2 h3 h4 h5 h6 span strong em b i small sub sup br hr ul ol li blockquote table tbody thead tfoot tr th td figure figcaption pre code a img'.split(
      ' ',
    ),
  ),
  drop = new Set('script style head iframe object svg math embed link meta base'.split(' '))
export function EpubReader({
  bookId,
  title,
  author,
}: {
  bookId: string
  title: string
  author: string
}) {
  const chrome = useReaderChrome()
  const gesture = useRef<(ReadingGesture & { pointerId: number }) | null>(null),
    turning = useRef(false)
  const { user } = useAuth(),
    { snapshot, act, busy } = useWorkspace(),
    namespace = user?.emailVerified ? user.uid : 'visitor',
    saved = snapshot!.reading[bookId],
    prefs = chrome?.preview ?? preferencesSchema.parse(snapshot!.preferences).reader
  const [archive, setArchive] = useState<EpubArchive | null>(null),
    [urls, setUrls] = useState<Map<string, string>>(new Map()),
    [chapter, setChapter] = useState(0),
    [query, setQuery] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [loading, setLoading] = useState(false),
    [revision, setRevision] = useState(0),
    [selected, setSelected] = useState<{
      quote: string
      start: number
      end: number
    } | null>(null),
    [note, setNote] = useState(''),
    [pendingOffset, setPendingOffset] = useState<{ offset: number; element?: number; commit?: boolean } | null>(null),
    [confirmRemove, setConfirmRemove] = useState(false),
    [pendingFragment, setPendingFragment] = useState<string | null>(null)
  const article = useRef<HTMLElement>(null),
    viewport = useRef<HTMLDivElement>(null),

    latest = useRef(saved)
  const saveLatest = useLatestSave(act)
  const paged = prefs.flow !== 'scroll'
  const pagination = useEpubPagination(
    article,
    viewport,
    paged,
    `${archive?.hash ?? ''}:${chapter}`,
    JSON.stringify(prefs),
  )
  latest.current = saved
  async function load(file: Blob, filename: string) {
    const value = await readEpub(file),
      cover = value.coverPath ? value.images.get(value.coverPath) : undefined
    await saveEpub(
      namespace,
      bookId,
      file,
      filename,
      cover ? new Blob([new Uint8Array(cover.bytes)], { type: cover.mime }) : undefined,
    )
    setRevision((n) => n + 1)
    // Escolhido uma vez aqui, o arquivo vai para a conta e não é pedido de novo em outro aparelho.
    if (user?.emailVerified)
      void uploadOriginal(user, bookId, file, filename).catch((err) =>
        setMessage('Livro aberto, mas não foi salvo na conta: ' + readableError(err)),
      )
  }
  useEffect(() => {
    let live = true
    const resources: string[] = []
    setArchive(null)
    setPendingOffset(null)
    setSelected(null)
    setQuery('')
    setError('')
    setLoading(true)
    void (async () => {
      try {
        let record = await localEpub(namespace, bookId).catch(() => undefined)
        if (!record && user?.emailVerified) {
          const list = await apiRequest<{
            items: { id: string; filename: string }[]
          }>(user, `/me/book-files/${bookId}`)
          if (list.items[0]) {
            const response = await authenticatedResponse(user, `/me/files/${list.items[0].id}/content`)
            const file = await response.blob()
            if (!live) return
            await saveEpub(namespace, bookId, file, list.items[0].filename, undefined, user).catch(() => {})
            record = {
              key: namespace + ':' + bookId,
              namespace,
              bookId,
              file,
              filename: list.items[0].filename,
              downloadCache: true,
            }
          }
        }
        if (!record) {
          if (live) setMessage('')
          return
        }
        const value = await readEpub(record.file)
        if (!live) return
        const cover = value.coverPath ? value.images.get(value.coverPath) : undefined
        if (cover && !record.cover)
          void saveEpub(
            namespace,
            bookId,
            record.file,
            record.filename,
            new Blob([new Uint8Array(cover.bytes)], { type: cover.mime }),
            record.downloadCache ? user ?? undefined : undefined,
          ).catch(() => {})
        const images = new Map<string, string>()
        for (const [path, image] of value.images) {
          const url = URL.createObjectURL(
            new Blob([new Uint8Array(image.bytes)], { type: image.mime }),
          )
          resources.push(url)
          images.set(path, url)
        }
        const position = latest.current?.epubLocator
        if (position?.hash === value.hash) {
          setChapter(Math.min(position.chapter, value.chapters.length - 1))
          setPendingOffset({ offset: position.offset, element: position.element })
        } else setChapter(0)
        setUrls(images)
        setArchive(value)
        setMessage('')
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : readableError(err))
      } finally {
        if (live) setLoading(false)
      }
    })()
    return () => {
      live = false
      for (const url of resources) URL.revokeObjectURL(url)
    }
  }, [user?.uid, user?.emailVerified, namespace, bookId, revision])
  useLayoutEffect(() => {
    if (!archive || pendingOffset === null || !article.current) return
    pagination.revealOffset(pendingOffset.offset, pendingOffset.element)
    if (pendingOffset.commit) {
      const point = pagination.visibleLocator()
      savePosition(chapter, point.offset, point.element)
    }
    setPendingOffset(null)
  }, [archive, chapter, pendingOffset, paged, pagination.revealOffset])
  useEffect(() => {
    if (!pendingFragment) return
    const element = document.getElementById(pendingFragment)
    if (element) {
      if (paged) pagination.revealElement(element)
      else element.scrollIntoView({ block: 'center' })
    }
    setPendingFragment(null)
  }, [pendingFragment, chapter, paged, pagination.revealElement])
  function select() {
    const value = window.getSelection()
    if (!value?.rangeCount || value.isCollapsed || !article.current) return
    const range = value.getRangeAt(0)
    if (
      !article.current.contains(range.startContainer) ||
      !article.current.contains(range.endContainer)
    )
      return
    const quote = value.toString()
    if (!quote || quote.length > 280) {
      setSelected(null)
      setMessage('Selecione até 280 caracteres.')
      return
    }
    const prefix = range.cloneRange()
    prefix.selectNodeContents(article.current)
    prefix.setEnd(range.startContainer, range.startOffset)
    setSelected({
      quote,
      start: prefix.toString().length,
      end: prefix.toString().length + quote.length,
    })
  }
  function savePosition(target: number, offset: number, element?: number) {
    if (!archive || !archive.chapters[target]) return
    const lengths = archive.chapters.map((chapter) => chapter.text.length)
    const total = lengths.reduce((sum, length) => sum + length, 0)
    const done = lengths.slice(0, target).reduce((sum, length) => sum + length, 0)
      + Math.min(offset, lengths[target])
    const hash = archive.hash
    saveLatest(() => ({
      type: 'reading.update',
      id: bookId,
      epubLocator: {
        hash, chapter: target, offset: Math.min(offset, 3000000),
        ...(element === undefined ? {} : { element }),
      },
      percent: Math.min(99, Math.round((done / Math.max(1, total)) * 100)),
      expectedRevision: latest.current?.revision ?? 0,
    }))
  }

  async function position(target: number, offset = 0, element?: number) {
    if (!archive || !archive.chapters[target]) return false
    setChapter(target)
    setSelected(null)
    setPendingOffset({ offset, element, commit: true })
    setMessage('')
    return true
  }

  function saveVisible() {
    if (!archive || !article.current || paged || pendingOffset || chrome?.panel) return
    if (document.querySelector('.reading-room .reader-settings[open]')) return
    const { offset, element } = pagination.visibleLocator()
    const previous = latest.current?.epubLocator
    if (previous?.hash === archive.hash && previous.chapter === chapter &&
      previous.offset === offset && previous.element === element) return
    savePosition(chapter, offset, element)
  }
  const saveRef = useRef(saveVisible)
  saveRef.current = saveVisible
  useEffect(() => {
    if (!archive || paged) return
    const host = viewport.current
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(() => saveRef.current(), 350)
    }
    host?.addEventListener('scroll', schedule, { passive: true })
    return () => {
      host?.removeEventListener('scroll', schedule)
      clearTimeout(timer)
    }
  }, [archive, chapter, paged])
  async function turnPage(direction: number) {
    if (!archive) return false
    const next = pagination.page + direction
    if (next < 0) {
      if (chapter > 0) return position(chapter - 1, 3000000)
      return false
    }
    if (next >= pagination.count) {
      if (chapter + 1 < archive.chapters.length) return position(chapter + 1)
      return false
    }
    if (!pagination.go(next)) {
      if (direction > 0 && chapter + 1 < archive.chapters.length) return position(chapter + 1)
      if (direction < 0 && chapter > 0) return position(chapter - 1, 3000000)
      return false
    }
    const point = pagination.visibleLocator()
    savePosition(chapter, point.offset, point.element)
    return true
  }
  async function navigatePage(direction: number) {
    if (turning.current || pendingOffset || !viewport.current || !article.current) return
    turning.current = true
    const finish = preparePageTurn(
      viewport.current,
      article.current,
      direction,
      prefs.pageAnimation !== false,
    )
    try {
      const moved = await turnPage(direction)
      finish(!!moved)
    } finally {
      turning.current = false
    }
  }
  // Save the current scroll position while the viewport is still attached.
  useEffect(() => {
    const save = () => saveRef.current()
    const visibility = () => {
      if (document.visibilityState === 'hidden') save()
    }
    window.addEventListener('pagehide', save)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      save()
      window.removeEventListener('pagehide', save)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [bookId])
  useEffect(() => {
    if (chrome && archive) viewport.current?.focus({ preventScroll: true })
  }, [archive])
  // Rendering creates only a small allowlist of React elements. EPUB scripts, styles,
  // event handlers, remote URLs and arbitrary attributes are never attached to DOM.
  const marks = (saved?.epubAnnotations ?? []).filter((mark) => mark.hash === archive?.hash)
  let nodeCount = 0,
    textOffset = 0
  function render(node: Node | null | undefined, depth = 0): ReactNode {
    if (!node) return null
    if (++nodeCount > 30000 || depth > 40) return null
    if (node.nodeType === 3) {
      const text = node.textContent ?? '',
        start = textOffset
      textOffset += text.length
      const active = marks
        .filter((mark) => mark.chapter === chapter && mark.start < textOffset && mark.end > start)
        .sort((a, b) => a.start - b.start)
      let last = 0
      const parts: ReactNode[] = []
      for (const mark of active) {
        const from = Math.max(last, mark.start - start, 0),
          to = Math.min(text.length, mark.end - start)
        if (to <= from) continue
        parts.push(
          text.slice(last, from),
          <mark key={mark.id} title={mark.note || 'Destaque privado'}>
            {text.slice(from, to)}
          </mark>,
        )
        last = to
      }
      parts.push(text.slice(last))
      return parts
    }
    if (node.nodeType !== 1) return null
    const element = node as Element,
      tag = element.localName.toLowerCase()
    if (tag === 'svg') {
      return Array.from(element.getElementsByTagNameNS('*', 'image'))
        .slice(0, 8)
        .map((image, index) => {
          const path = epubPath(
            image.getAttribute('href') ??
              image.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ??
              '',
            archive!.chapters[chapter].path,
          )?.path
          const url = path ? urls.get(path) : undefined,
            info = path ? archive!.images.get(path) : undefined
          return url ? (
            <img
              key={index}
              src={url}
              alt="Ilustração do livro"
              width={info?.width}
              height={info?.height}
            />
          ) : null
        })
    }
    if (drop.has(tag)) return null
    const children = Array.from(node.childNodes).map((child, index) =>
      createElement(Fragment, { key: index }, render(child, depth + 1)),
    )
    if (!tags.has(tag)) return children
    if (tag === 'img') {
      const path = epubPath(
          element.getAttribute('src') ?? '',
          archive!.chapters[chapter].path,
        )?.path,
        url = path ? urls.get(path) : null
      return url ? (
        <img
          src={url}
          width={path ? archive!.images.get(path)?.width : undefined}
          height={path ? archive!.images.get(path)?.height : undefined}
          alt={(element.getAttribute('alt') ?? 'Ilustração do livro').slice(0, 200)}
          loading="lazy"
        />
      ) : null
    }
    const id = element.getAttribute('id'),
      props: Record<string, unknown> = {
        ...(id ? { id: `epub-${chapter}-${id.slice(0, 200)}` } : {}),
      }
    if (tag === 'a') {
      const link = epubPath(element.getAttribute('href') ?? '', archive!.chapters[chapter].path)
      props.href = '#'
      props.onClick = (event: React.MouseEvent) => {
        event.preventDefault()
        if (!link) return
        const target = archive!.chapters.findIndex((c) => c.path === link.path)
        if (target < 0) return
        void position(target).then((ok) => {
          if (ok && link.fragment)
            setPendingFragment(`epub-${target}-${link.fragment.slice(0, 200)}`)
        })
      }
    }
    if (tag === 'br' || tag === 'hr') return createElement(tag, props)
    return createElement(tag, props, children)
  }
  const matches =
    archive && query.trim().length >= 2
      ? archive.chapters
          .flatMap((item, index) => {
            const result: { chapter: number; offset: number; text: string }[] = []
            let offset = item.text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase())
            while (offset >= 0 && result.length < 10) {
              result.push({
                chapter: index,
                offset,
                text: item.text.slice(Math.max(0, offset - 30), offset + query.length + 70),
              })
              offset = item.text
                .toLocaleLowerCase()
                .indexOf(query.toLocaleLowerCase(), offset + query.length)
            }
            return result
          })
          .slice(0, 50)
      : []
  const fileButton = (
    <label className="file-button">
      {archive ? 'Trocar arquivo' : 'Escolher EPUB'}
      <input
        type="file"
        accept=".epub"
        disabled={busy || loading}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            setLoading(true)
            setError('')
            void load(file, file.name)
              .catch((err) => setError((err as Error).message))
              .finally(() => setLoading(false))
          }
          event.target.value = ''
        }}
      />
    </label>
  )
  return (
    <section className="epub-original stack-lg">
      {!archive && (
        <header className="epub-original__empty">
          <h2>Falta o arquivo deste livro</h2>
          <p>
            Escolha o EPUB uma vez. Ele fica salvo
            {user?.emailVerified ? ' na sua conta' : ' neste aparelho'}.
          </p>
        </header>
      )}
      {loading && (
        <p role="status" className="t-caption">
          Abrindo o livro…
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {!archive && fileButton}
      {archive && (
        <>
          {chrome && (
            <ReaderPanel name="contents">
              <div className="reader-contents">
                <label className="reader-search-field">
                  <Search size={16} aria-hidden="true" />
                  <span className="sr-only">Pesquisar no livro</span>
                  <input
                    type="search"
                    maxLength={100}
                    value={query}
                    placeholder="Pesquisar no livro"
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                {query.trim().length >= 2 ? (
                  <div className="reader-search-results">
                    <p>
                      {matches.length}
                      {matches.length === 50 ? '+' : ''} resultado(s)
                    </p>
                    {matches.map((match, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          void position(match.chapter, match.offset)
                          setQuery('')
                          chrome.setPanel(null)
                        }}
                      >
                        {match.text}
                      </button>
                    ))}
                  </div>
                ) : (
                  <ol className="reader-chapters">
                    {archive.chapters.map((c, index) => (
                      <li key={c.path}>
                        <button
                          type="button"
                          aria-current={index === chapter ? 'true' : undefined}
                          onClick={() => {
                            void position(index)
                            chrome.setPanel(null)
                          }}
                        >
                          {c.title}
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </ReaderPanel>
          )}
          {!chrome && (
            <p className="reader-chapter-label">
              {archive.chapters[chapter]?.title} · capítulo {chapter + 1} de{' '}
              {archive.chapters.length}
            </p>
          )}
          <div
            ref={viewport}
            onPointerDown={(event) => {
              if (
                !chrome ||
                !event.isPrimary ||
                (event.target instanceof Element &&
                  event.target.closest('a,button,input,select,textarea'))
              ) {
                gesture.current = null
                return
              }
              const rect = event.currentTarget.getBoundingClientRect()
              gesture.current = {
                pointerId: event.pointerId,
                x: event.clientX - rect.left,
                y: event.clientY,
                at: performance.now(),
                width: rect.width,
              }
            }}
            onPointerCancel={() => {
              gesture.current = null
            }}
            onPointerUp={(event) => {
              const start = gesture.current
              gesture.current = null
              if (
                !start || start.pointerId !== event.pointerId ||
                !chrome ||
                turning.current ||
                window.getSelection()?.isCollapsed === false
              )
                return
              const action = readingGesture(
                start,
                {
                  x: event.clientX - event.currentTarget.getBoundingClientRect().left,
                  y: event.clientY,
                  at: performance.now(),
                },
                paged && prefs.edgeTaps !== false && event.pointerType !== 'mouse',
              )
              if (action === 'controls') chrome.setControls(!chrome.controls)
              else if (paged && action) void navigatePage(action === 'next' ? 1 : -1)
            }}
            className={paged ? 'epub-page-viewport' : 'epub-scroll-viewport'}
            tabIndex={0}
            role="region"
            aria-label={paged ? 'Páginas do EPUB' : 'Texto do EPUB'}
            onKeyDown={(event) => {
              if (
                event.target instanceof Element &&
                event.target.closest('input,textarea,select,button,a')
              )
                return
              // Teclado: Enter mostra ou esconde os controles (o toque no meio da tela faz o mesmo).
              if (chrome && event.key === 'Enter') {
                event.preventDefault()
                chrome.setControls(!chrome.controls)
                return
              }
              if (!paged) return
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault()
                void navigatePage(event.key === 'ArrowRight' ? 1 : -1)
              }
            }}
          >
            <article
              ref={article}
              className={`reader-prose epub-prose ${paged ? 'epub-prose--paged' : ''}`}
              style={{
                fontSize: prefs.size,
                fontFamily: readerFont(prefs.font),
              }}
              onMouseUp={select}
              onKeyUp={select}
              onTouchEnd={select}
            >
              {(() => {
                const document = new DOMParser().parseFromString(
                  archive.chapters[chapter].html.replace(/<!DOCTYPE[\s\S]*?>/gi, ''),
                  'application/xml',
                )
                return render(
                  document.getElementsByTagNameNS('*', 'body')[0] ?? document.documentElement,
                )
              })()}
            </article>
          </div>
          {paged && (!chrome || chrome.controls) && (
            <nav className="epub-page-controls" aria-label="Páginas EPUB">
              <Button
                variant="ghost"
                disabled={chapter === 0 && pagination.page === 0}
                onClick={() => void navigatePage(-1)}
              >
                ← Página anterior
              </Button>
              <span role="status" aria-live="polite">
                Página {pagination.page + 1} de {pagination.count}
              </span>
              <Button
                variant="ghost"
                disabled={
                  chapter === archive.chapters.length - 1 &&
                  pagination.page === pagination.count - 1
                }
                onClick={() => void navigatePage(1)}
              >
                Próxima página →
              </Button>
            </nav>
          )}
          {nodeCount > 30000 && (
            <p role="alert">
              Este capítulo excede a complexidade suportada. Use a leitura em texto para consultar
              seu conteúdo.
            </p>
          )}
          {chrome && (
            <span className="sr-only" role="status">
              Capítulo {chapter + 1}, página {pagination.page + 1} de {pagination.count}
            </span>
          )}
          {selected && (
            <SelectionPanel immersive={!!chrome} onClose={() => setSelected(null)}>
              <blockquote>{selected.quote}</blockquote>
              <label>
                Anotação privada EPUB
                <textarea
                  maxLength={2000}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <Button
                disabled={busy}
                onClick={() =>
                  void act({
                    type: 'reading.epub.annotate',
                    id: bookId,
                    locator: {
                      hash: archive.hash,
                      chapter,
                      offset: selected.start,
                    },
                    ...selected,
                    note,
                  }).then((ok) => {
                    if (ok) {
                      setSelected(null)
                      setNote('')
                    }
                  })
                }
              >
                Salvar destaque EPUB
              </Button>
              <QuoteShare
                quote={selected.quote}
                title={title}
                author={author}
                source={`EPUB · ${archive.chapters[chapter].title}`}
              />
            </SelectionPanel>
          )}
          {(
            <ReaderPanel name="tools">
              <p className="t-caption">
                Capítulo {chapter + 1} de {archive.chapters.length} · {saved?.percent ?? 0}% lido
              </p>
              <Button
                disabled={busy}
                variant="secondary"
                aria-pressed={saved?.favorite === true}
                onClick={() =>
                  void act({
                    type: 'reading.update',
                    id: bookId,
                    favorite: !saved?.favorite,
                    expectedRevision: latest.current?.revision ?? 0,
                  })
                }
              >
                {saved?.favorite ? 'Retirar dos favoritos' : 'Adicionar aos favoritos'}
              </Button>
              <nav className="workspace-actions" aria-label="Capítulos EPUB">
                <Button disabled={chapter === 0} onClick={() => void position(chapter - 1)}>
                  Capítulo anterior
                </Button>
                <Button
                  disabled={chapter === archive.chapters.length - 1}
                  onClick={() => void position(chapter + 1)}
                >
                  Próximo capítulo
                </Button>
                <Button disabled={busy} variant="secondary" onClick={saveVisible}>
                  Salvar posição atual
                </Button>
                <Button
                  disabled={busy}
                  variant="secondary"
                  onClick={() =>
                    void act({
                      type: 'reading.update',
                      id: bookId,
                      epubBookmark: {
                        hash: archive.hash,
                        chapter,
                        ...pagination.visibleLocator(),
                      },
                      expectedRevision: latest.current?.revision ?? 0,
                    })
                  }
                >
                  Marcar posição EPUB
                </Button>
                {saved?.epubBookmark?.hash === archive.hash && (
                  <>
                    <Button
                      disabled={busy}
                      variant="ghost"
                      onClick={() =>
                        void position(
                          saved.epubBookmark!.chapter,
                          saved.epubBookmark!.offset,
                          saved.epubBookmark!.element,
                        )
                      }
                    >
                      Ir ao marcador EPUB
                    </Button>
                    <Button
                      disabled={busy}
                      variant="ghost"
                      onClick={() =>
                        void act({
                          type: 'reading.update',
                          id: bookId,
                          epubBookmark: null,
                          expectedRevision: latest.current?.revision ?? 0,
                        })
                      }
                    >
                      Remover marcador EPUB
                    </Button>
                  </>
                )}
              </nav>
              <details className="reader-file">
                <summary>Arquivo deste leitor</summary>
                <p>O arquivo é privado e fica separado das publicações.</p>
                {fileButton}
              </details>
              <fieldset>
                <legend>Sua leitura</legend>
                <Button
                  onClick={() =>
                    void act({
                      type: 'reading.update',
                      id: bookId,
                      percent: 100,
                      expectedRevision: latest.current?.revision ?? 0,
                    })
                  }
                >
                  Concluir leitura
                </Button>
                <label>
                  Avaliação
                  <select
                    aria-label="Avaliação da leitura"
                    value={saved?.rating ?? 0}
                    onChange={(e) =>
                      void act({
                        type: 'reading.update',
                        id: bookId,
                        rating: Number(e.target.value),
                        expectedRevision: latest.current?.revision ?? 0,
                      })
                    }
                  >
                    {[0, 1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n ? `${n} estrelas` : 'Sem avaliação'}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
              <h3>Destaques EPUB privados</h3>
              {marks.map((mark) => (
                <div className="card" key={mark.id}>
                  <blockquote>{mark.quote}</blockquote>
                  <p className="preserve-text">{mark.note}</p>
                  <div className="workspace-actions">
                    <Button
                      disabled={busy}
                      variant="secondary"
                      onClick={() => void position(mark.chapter, mark.start)}
                    >
                      Voltar ao destaque
                    </Button>
                    <Button
                      disabled={busy}
                      variant="ghost"
                      onClick={() =>
                        void act({
                          type: 'reading.epub.annotation.remove',
                          id: bookId,
                          annotationId: mark.id,
                        })
                      }
                    >
                      Excluir destaque EPUB
                    </Button>
                  </div>
                  <QuoteShare
                    quote={mark.quote}
                    title={title}
                    author={author}
                    source={`EPUB · ${archive.chapters[mark.chapter]?.title ?? 'Trecho'}`}
                  />
                </div>
              ))}
              {confirmRemove ? (
                <div>
                  <p className="t-caption">
                    Apagar a cópia deste aparelho? Sua conta e anotações continuam.
                  </p>
                  <Button
                    variant="danger"
                    onClick={() =>
                      void removeEpub(namespace, bookId).then(() => {
                        setArchive(null)
                        setConfirmRemove(false)
                        setMessage('Cópia local removida.')
                      })
                    }
                  >
                    Apagar deste aparelho
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" onClick={() => setConfirmRemove(true)}>
                  Apagar cópia deste aparelho
                </Button>
              )}
            </ReaderPanel>
          )}
        </>
      )}
      {message && (
        <p className={chrome && !chrome.controls ? 'sr-only' : undefined} role="status">
          {message}
        </p>
      )}
    </section>
  )
}

function SelectionPanel({
  immersive,
  onClose,
  children,
}: {
  immersive: boolean
  onClose: () => void
  children: ReactNode
}) {
  return immersive ? (
    <Sheet title="Destaque e anotação" className="reader-sheet" onClose={onClose}>
      <div className="workspace-form">{children}</div>
    </Sheet>
  ) : (
    <div className="card workspace-form">{children}</div>
  )
}
