import { Fragment, createElement, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, readableError } from '../auth/api'
import { useWorkspace } from './WorkspaceProvider'
import { Button } from '../components/ui'
import { readEpub, epubPath, type EpubArchive } from './epub-archive'
import { localEpub, saveEpub, removeEpub } from './epub-storage'
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
  const { user } = useAuth(),
    { snapshot, act, busy } = useWorkspace(),
    namespace = user?.emailVerified ? user.uid : 'visitor',
    saved = snapshot!.reading[bookId],
    prefs = preferencesSchema.parse(snapshot!.preferences).reader
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
    [pendingOffset, setPendingOffset] = useState<number | null>(null),
    [confirmRemove, setConfirmRemove] = useState(false),
    [pendingFragment, setPendingFragment] = useState<string | null>(null)
  const article = useRef<HTMLElement>(null),
    viewport = useRef<HTMLDivElement>(null),
    navigationTools = useRef<HTMLDetailsElement>(null),
    navigating = useRef(false),
    latest = useRef(saved)
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
  }
  useEffect(() => {
    let live = true
    const resources: string[] = []
    setArchive(null)
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
            const token = await user.getIdToken()
            const response = await fetch(
              `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/v1/me/files/${list.items[0].id}/content`,
              {
                headers: { Authorization: `Bearer ${token}` },
                credentials: 'omit',
                cache: 'no-store',
                referrerPolicy: 'no-referrer',
                signal: AbortSignal.timeout(75000),
              },
            )
            if (!response.ok) throw Error('Arquivo privado indisponível.')
            const file = await response.blob()
            await saveEpub(namespace, bookId, file, list.items[0].filename).catch(() => {})
            record = {
              key: namespace + ':' + bookId,
              namespace,
              bookId,
              file,
              filename: list.items[0].filename,
            }
          }
        }
        if (!record) {
          if (live) setMessage('Escolha seu EPUB autorizado para abrir a edição original.')
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
          setPendingOffset(position.offset)
        } else setChapter(0)
        setUrls(images)
        setArchive(value)
        setMessage(
          'Edição original aberta. Imagens são lidas do arquivo; recursos externos ficam omitidos.',
        )
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
  useEffect(() => {
    if (!archive || pendingOffset === null || !article.current) return
    if (paged) {
      pagination.revealOffset(pendingOffset)
      setPendingOffset(null)
      return
    }
    const walker = document.createTreeWalker(article.current, NodeFilter.SHOW_TEXT)
    let offset = 0,
      node: Node | null
    while ((node = walker.nextNode())) {
      if (offset + (node.textContent?.length ?? 0) >= pendingOffset) {
        node.parentElement?.scrollIntoView({
          block: 'center',
          behavior: 'auto',
        })
        break
      }
      offset += node.textContent?.length ?? 0
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
  useEffect(() => {
    const position = latest.current?.epubLocator
    if (archive && position?.hash === archive.hash && position.chapter === chapter)
      setPendingOffset(position.offset)
  }, [
    archive,
    prefs.flow,
    prefs.size,
    prefs.font,
    prefs.margin,
    prefs.lineHeight,
    prefs.weight,
    prefs.align,
  ])
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
  async function position(target: number, offset = 0) {
    if (!archive || !archive.chapters[target]) return false
    if (navigating.current) return false
    navigating.current = true
    const lengths = archive.chapters.map((c) => c.text.length),
      total = lengths.reduce((sum, n) => sum + n, 0),
      done = lengths.slice(0, target).reduce((sum, n) => sum + n, 0) + offset
    let ok = false
    try {
      ok = await act({
        type: 'reading.update',
        id: bookId,
        epubLocator: { hash: archive.hash, chapter: target, offset },
        percent: Math.min(99, Math.round((done / Math.max(1, total)) * 100)),
        expectedRevision: latest.current?.revision ?? 0,
      })
    } finally {
      navigating.current = false
    }
    if (ok) {
      setChapter(target)
      setSelected(null)
      setPendingOffset(offset)
      setMessage('Posição EPUB salva na sua leitura.')
    }
    return ok
  }
  function saveVisible() {
    if (!archive || !article.current || navigating.current) return
    if (document.querySelector('.reading-room .reader-settings[open]')) return
    if (!paged) {
      const rect = article.current.getBoundingClientRect()
      if (rect.top >= window.innerHeight || rect.bottom < 80) return
    }
    const walker = document.createTreeWalker(article.current, NodeFilter.SHOW_TEXT)
    let node: Node | null,
      offset = 0
    while ((node = walker.nextNode())) {
      const range = document.createRange()
      range.selectNodeContents(node)
      if (range.getBoundingClientRect().bottom >= 80) break
      offset += node.textContent?.length ?? 0
    }
    if (paged) offset = pagination.visibleOffset()
    const lengths = archive.chapters.map((c) => c.text.length),
      done = lengths.slice(0, chapter).reduce((sum, n) => sum + n, 0) + offset,
      total = lengths.reduce((sum, n) => sum + n, 0)
    void act({
      type: 'reading.update',
      id: bookId,
      epubLocator: {
        hash: archive.hash,
        chapter,
        offset: Math.min(offset, 3000000),
      },
      percent: Math.min(99, Math.round((done / Math.max(1, total)) * 100)),
      expectedRevision: latest.current?.revision ?? 0,
    })
  }
  useEffect(() => {
    if (!archive) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const save = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(saveVisible, 1200)
    }
    window.addEventListener('scroll', save, { passive: true })
    const host = viewport.current
    host?.addEventListener('scroll', save, { passive: true })
    return () => {
      window.removeEventListener('scroll', save)
      host?.removeEventListener('scroll', save)
      if (timer) clearTimeout(timer)
    }
  }, [archive, chapter, paged, pagination.visibleOffset])
  async function turnPage(direction: number) {
    if (busy || navigating.current || !archive) return
    const next = pagination.page + direction
    if (next < 0) {
      if (chapter > 0) await position(chapter - 1, archive.chapters[chapter - 1].text.length)
      return
    }
    if (next >= pagination.count) {
      if (chapter + 1 < archive.chapters.length) await position(chapter + 1)
      return
    }
    pagination.go(next)
    await position(chapter, pagination.visibleOffset())
  }
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
      {archive ? 'Trocar EPUB deste leitor' : 'Abrir EPUB autorizado'}
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
        <header>
          <h2>Ler o EPUB original</h2>
          <p>O arquivo é privado e fica separado das publicações.</p>
        </header>
      )}
      {loading && <p role="status">Abrindo o EPUB e suas ilustrações…</p>}
      {error && <p role="alert">{error}</p>}
      {!archive && fileButton}
      {archive && (
        <>
          <details ref={navigationTools} className="reader-navigation-tools">
            <summary>Sumário e pesquisa</summary>
            <div className="reader-settings-grid reader-toolbar-grid">
              <label>
                Sumário EPUB
                <select
                  aria-label="Sumário EPUB"
                  value={chapter}
                  disabled={busy}
                  onChange={(event) =>
                    void position(Number(event.target.value)).then((ok) => {
                      if (ok && navigationTools.current) navigationTools.current.open = false
                    })
                  }
                >
                  {archive.chapters.map((c, index) => (
                    <option value={index} key={c.path}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Pesquisar no EPUB
                <input
                  maxLength={100}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            </div>
            {query.trim().length >= 2 && (
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
                      if (navigationTools.current) navigationTools.current.open = false
                    }}
                  >
                    {match.text}
                  </button>
                ))}
              </div>
            )}
          </details>
          <p className="reader-chapter-label">
            {archive.chapters[chapter]?.title} · capítulo {chapter + 1} de {archive.chapters.length}
          </p>
          <div
            ref={viewport}
            className={paged ? 'epub-page-viewport' : 'epub-scroll-viewport'}
            tabIndex={paged ? 0 : undefined}
            role="region"
            aria-label={paged ? 'Páginas do EPUB' : 'Texto do EPUB'}
            onKeyDown={(event) => {
              if (
                !paged ||
                (event.target instanceof Element &&
                  event.target.closest('input,textarea,select,button,a'))
              )
                return
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault()
                void turnPage(event.key === 'ArrowRight' ? 1 : -1)
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
          {paged && (
            <nav className="epub-page-controls" aria-label="Páginas EPUB">
              <Button
                variant="ghost"
                disabled={busy || (chapter === 0 && pagination.page === 0)}
                onClick={() => void turnPage(-1)}
              >
                ← Página anterior
              </Button>
              <span role="status" aria-live="polite">
                Página {pagination.page + 1} de {pagination.count}
              </span>
              <Button
                variant="ghost"
                disabled={
                  busy ||
                  (chapter === archive.chapters.length - 1 &&
                    pagination.page === pagination.count - 1)
                }
                onClick={() => void turnPage(1)}
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
          {selected && (
            <div className="card workspace-form">
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
            </div>
          )}
          <nav className="workspace-actions" aria-label="Capítulos EPUB">
            <Button disabled={busy || chapter === 0} onClick={() => void position(chapter - 1)}>
              Capítulo anterior
            </Button>
            <Button
              disabled={busy || chapter === archive.chapters.length - 1}
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
                    offset: latest.current?.epubLocator?.offset ?? 0,
                  },
                  expectedRevision: latest.current?.revision ?? 0,
                })
              }
            >
              Marcar posição EPUB
            </Button>
            {saved?.epubBookmark?.hash === archive.hash && (
              <Button
                disabled={busy}
                variant="ghost"
                onClick={() =>
                  void position(saved.epubBookmark!.chapter, saved.epubBookmark!.offset)
                }
              >
                Ir ao marcador EPUB
              </Button>
            )}
          </nav>
          <details className="reader-file">
            <summary>Arquivo deste leitor</summary>
            <p>O arquivo é privado e fica separado das publicações.</p>
            {fileButton}
          </details>
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
              <p>
                Remover a cópia deste navegador? Seu arquivo guardado na conta e suas anotações
                continuam disponíveis.
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
                Confirmar remoção local
              </Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmRemove(true)}>
              Remover cópia EPUB deste navegador
            </Button>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  )
}
