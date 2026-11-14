import { Fragment, createElement, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, readableError } from '../auth/api'
import { useWorkspace } from './WorkspaceProvider'
import { Button } from '../components/ui'
import { readEpub, epubPath, type EpubArchive } from './epub-archive'
import { localEpub, saveEpub, removeEpub } from './epub-storage'
import { preferencesSchema } from '../../server/src/workspace-model'
import { QuoteShare } from '../community/QuoteShare'
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
    [selected, setSelected] = useState<{ quote: string; start: number; end: number } | null>(null),
    [note, setNote] = useState(''),
    [pendingOffset, setPendingOffset] = useState<number | null>(null),
    [confirmRemove, setConfirmRemove] = useState(false),
    [pendingFragment, setPendingFragment] = useState<string | null>(null)
  const article = useRef<HTMLElement>(null),
    latest = useRef(saved)
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
        let record = await localEpub(namespace, bookId)
        if (!record && user?.emailVerified) {
          const list = await apiRequest<{ items: { id: string; filename: string }[] }>(
            user,
            `/me/book-files/${bookId}`,
          )
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
            await saveEpub(namespace, bookId, file, list.items[0].filename)
            record = await localEpub(namespace, bookId)
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
    const walker = document.createTreeWalker(article.current, NodeFilter.SHOW_TEXT)
    let offset = 0,
      node: Node | null
    while ((node = walker.nextNode())) {
      if (offset + (node.textContent?.length ?? 0) >= pendingOffset) {
        node.parentElement?.scrollIntoView({ block: 'center', behavior: 'auto' })
        break
      }
      offset += node.textContent?.length ?? 0
    }
    setPendingOffset(null)
  }, [archive, chapter, pendingOffset])
  useEffect(() => {
    if (!pendingFragment) return
    document.getElementById(pendingFragment)?.scrollIntoView({ block: 'center' })
    setPendingFragment(null)
  }, [pendingFragment, chapter])
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
    const lengths = archive.chapters.map((c) => c.text.length),
      total = lengths.reduce((sum, n) => sum + n, 0),
      done = lengths.slice(0, target).reduce((sum, n) => sum + n, 0) + offset
    const ok = await act({
      type: 'reading.update',
      id: bookId,
      epubLocator: { hash: archive.hash, chapter: target, offset },
      percent: Math.min(99, Math.round((done / Math.max(1, total)) * 100)),
      expectedRevision: latest.current?.revision ?? 0,
    })
    if (ok) {
      setChapter(target)
      setSelected(null)
      setPendingOffset(offset)
      setMessage('Posição EPUB salva na sua leitura.')
    }
    return ok
  }
  function saveVisible() {
    if (!archive || !article.current) return
    const walker = document.createTreeWalker(article.current, NodeFilter.SHOW_TEXT)
    let node: Node | null,
      offset = 0
    while ((node = walker.nextNode())) {
      const range = document.createRange()
      range.selectNodeContents(node)
      if (range.getBoundingClientRect().bottom >= 80) break
      offset += node.textContent?.length ?? 0
    }
    const lengths = archive.chapters.map((c) => c.text.length),
      done = lengths.slice(0, chapter).reduce((sum, n) => sum + n, 0) + offset,
      total = lengths.reduce((sum, n) => sum + n, 0)
    void act({
      type: 'reading.update',
      id: bookId,
      epubLocator: { hash: archive.hash, chapter, offset: Math.min(offset, 3000000) },
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
    return () => {
      window.removeEventListener('scroll', save)
      if (timer) clearTimeout(timer)
    }
  }, [archive, chapter])
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
  return (
    <section className="epub-original stack-lg">
      <header>
        <h2>Ler o EPUB original</h2>
        <p>O arquivo é privado e fica separado das publicações.</p>
      </header>
      {loading && <p role="status">Abrindo o EPUB e suas ilustrações…</p>}
      {error && <p role="alert">{error}</p>}
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
      {archive && (
        <>
          <div className="reader-settings-grid">
            <label>
              Sumário EPUB
              <select
                value={chapter}
                disabled={busy}
                onChange={(event) => void position(Number(event.target.value))}
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
                  }}
                >
                  {match.text}
                </button>
              ))}
            </div>
          )}
          <p className="reader-chapter-label">
            {archive.chapters[chapter]?.title} · capítulo {chapter + 1} de {archive.chapters.length}
          </p>
          <article
            ref={article}
            className="reader-prose epub-prose"
            style={{
              fontSize: prefs.size,
              fontFamily: prefs.font === 'serif' ? 'Georgia, serif' : 'system-ui, sans-serif',
            }}
            onMouseUp={select}
            onKeyUp={select}
            onTouchEnd={select}
          >
            {render(
              new DOMParser().parseFromString(
                archive.chapters[chapter].html.replace(/<!DOCTYPE[\s\S]*?>/gi, ''),
                'application/xml',
              ).documentElement,
            )}
          </article>
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
                    locator: { hash: archive.hash, chapter, offset: selected.start },
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
