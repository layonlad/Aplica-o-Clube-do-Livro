import { MediaCarousel } from './MediaCarousel'
import { SharedBookComposer } from './SharedBookComposer'
import { Sheet } from '../components/Sheet'
import { ShareAction } from '../components/ShareAction'
import { ConfirmAction } from './ConfirmAction'
export { ConfirmAction } from './ConfirmAction'
import { ReportAction } from './ReportAction'
import { postBase, socialRead } from './social-api'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Bookmark,
  Heart,
  MessageCircle,
  MessageSquare,
  PenLine,
  Send,
  MoreHorizontal,
  ImagePlus,
} from 'lucide-react'
import type { Page, PostDto, CommentDto, PostMedia } from '../../server/src/community-contracts'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, readableError } from '../auth/api'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import { Button } from '../components/ui'
import { UserAvatar, UserIdentity, useOwnAvatar } from '../components/UserAvatar'
import { MediaPicker } from './PrivateMedia'
import './community.css'
export const kindLabels = {
  reflection: 'Reflexão',
  review: 'Resenha',
  quote: 'Citação',
  question: 'Pergunta',
  poll: 'Enquete',
  meeting: 'Encontro',
  recommendation: 'Indicação',
  achievement: 'Conquista',
  announcement: 'Comunicado',
} as const
const date = (value: string) =>
  new Date(value).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })
export function ClubWall() {
  const { scope, scopeName } = useWorkspace()
  return scope === 'personal' ? (
    <div className="library-empty">
      <MessageSquare size={36} />
      <h1>Uma conversa entre leitores</h1>
      <p>
        O mural reúne apenas as pessoas de cada clube. Escolha um clube no seletor para participar.
      </p>
      <Link to="/clubs">Meus clubes →</Link>
    </div>
  ) : (
    <WallRoom key={scope} clubId={scope} name={scopeName} />
  )
}
function WallRoom({ clubId, name }: { clubId: string | null; name: string }) {
  const { user } = useAuth(),
    [params] = useSearchParams(),
    selected = params.get('post')
  const [page, setPage] = useState<Page<PostDto>>({ items: [], nextCursor: null }),
    [kind, setKind] = useState(''),
    [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [from, setFrom] = useState(''),
    [until, setUntil] = useState('')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0)
  const filters = new URLSearchParams({
    ...(kind ? { kind } : {}),
    ...(search ? { q: search } : {}),
    ...(from ? { from: new Date(from + 'T00:00:00').toISOString() } : {}),
    ...(until ? { until: new Date(until + 'T23:59:59.999').toISOString() } : {}),
  }).toString()
  useEffect(() => {
    let live = true
    setBusy(true)
    setError('')
    setPage({ items: [], nextCursor: null })
    const request = selected
      ? apiRequest<PostDto>(user!, `/clubs/${clubId}/posts/${selected}`).then((post) => ({
          items: [post],
          nextCursor: null,
        }))
      : apiRequest<Page<PostDto>>(user!, `/clubs/${clubId}/posts?${filters}`)
    request
      .then((value) => live && setPage(value))
      .catch((err) => live && setError(readableError(err)))
      .finally(() => live && setBusy(false))
    return () => {
      live = false
    }
  }, [user?.uid, user?.emailVerified, clubId, filters, revision, selected])
  async function more() {
    setBusy(true)
    setError('')
    try {
      const next = await apiRequest<Page<PostDto>>(
        user!,
        `/clubs/${clubId}/posts?${filters}&cursor=${encodeURIComponent(page.nextCursor!)}`,
      )
      setPage((value) => ({ items: [...value.items, ...next.items], nextCursor: next.nextCursor }))
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="social-room stack-lg">
      <header className="social-heading">
        <span className="eyebrow">SOMENTE NESTE CLUBE</span>
        <h1>Entre páginas e encontros</h1>
        <p>O mural de {name}. As publicações ficam com quem participa do grupo.</p>
      </header>
      {!selected && (
        <>
          <SharedBookComposer clubId={clubId} onPublished={() => setRevision((value) => value + 1)} />
          <PostComposer clubId={clubId} onPublished={() => setRevision((value) => value + 1)} />
        </>
      )}
      <div className="wall-filters">
        <form
          className="workspace-actions"
          onSubmit={(event) => {
            event.preventDefault()
            setSearch(query.trim())
          }}
        >
          <input
            aria-label="Pesquisar no mural"
            placeholder="Um assunto, livro ou #hashtag"
            minLength={2}
            maxLength={100}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button disabled={busy} variant="secondary">
            Pesquisar
          </Button>
        </form>
        <label>
          Tipo de publicação
          <select value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="">Todas as conversas</option>
            {Object.entries(kindLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Desde
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          Até
          <input type="date" value={until} onChange={(event) => setUntil(event.target.value)} />
        </label>
      </div>
      {selected && <Link to="/app/wall">← Voltar ao mural</Link>}
      {error && (
        <div role="alert">
          {error}{' '}
          <Button variant="ghost" onClick={() => setRevision((value) => value + 1)}>
            Atualizar mural
          </Button>
        </div>
      )}
      {busy && !page.items.length && (
        <div className="social-skeleton" role="status">
          Abrindo as conversas…
        </div>
      )}
      <div className="social-feed">
        {page.items.map((post) => (
          <PostCard
            key={post.id}
            clubId={clubId}
            post={post}
            onChanged={(value) =>
              setPage((page) => ({
                ...page,
                items: page.items.map((item) => (item.id === value.id ? value : item)),
              }))
            }
            onRemoved={() =>
              setPage((page) => ({
                ...page,
                items: page.items.filter((item) => item.id !== post.id),
              }))
            }
          />
        ))}
      </div>
      {!busy && !error && !page.items.length && (
        <div className="library-empty">
          <PenLine size={34} />
          <h2>A primeira conversa começa com você</h2>
          <p>Compartilhe uma descoberta, uma pergunta ou um registro do encontro.</p>
        </div>
      )}
      {page.nextCursor && (
        <Button variant="secondary" disabled={busy} onClick={() => void more()}>
          Ler mais publicações
        </Button>
      )}
    </div>
  )
}
export function PostComposer({
  clubId,
  onPublished,
}: {
  clubId: string | null
  onPublished: () => void
}) {
  const ownAvatar = useOwnAvatar(),
    { user } = useAuth()
  const [open, setOpen] = useState(false),
    [poll, setPoll] = useState(false),
    [body, setBody] = useState(''),
    [options, setOptions] = useState('')
  const [media, setMedia] = useState<PostMedia[]>([]),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState('')
  const sending = useRef(false),
    request = useRef({ payload: '', id: '' })
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!user || sending.current) return
    sending.current = true
    setBusy(true)
    setError('')
    const input = {
      body,
      kind: poll ? 'poll' : 'reflection',
      mediaIds: media.map((item) => item.id),
      options: poll
        ? options
            .split('\n')
            .map((v) => v.trim())
            .filter(Boolean)
        : [],
    }
    const serialized = JSON.stringify(input)
    if (request.current.payload !== serialized)
      request.current = { payload: serialized, id: crypto.randomUUID() }
    try {
      await apiRequest(user, postBase(clubId), 'POST', {
        ...input,
        clientRequestId: request.current.id,
      })
      setBody('')
      setOptions('')
      setMedia([])
      setOpen(false)
      setPoll(false)
      request.current = { payload: '', id: '' }
      onPublished()
    } catch (err) {
      setError(readableError(err))
    } finally {
      sending.current = false
      setBusy(false)
    }
  }
  return (
    <section className="post-composer">
      <button
        className="composer-prompt"
        type="button"
        aria-expanded={open}
        onClick={() => {
          setPoll(false)
          setOpen(!open)
        }}
      >
        <UserAvatar name={user?.displayName || 'Leitor'} avatarId={ownAvatar} size="md" />
        <span>O que você está pensando sobre sua leitura?</span>
        <PenLine size={18} />
      </button>
      {open && (
        <form className="workspace-form simple-composer" onSubmit={submit}>
          <p className="composer-audience">
            {clubId === null ? 'Publicação pública' : 'Somente integrantes deste clube'}
          </p>
          {poll && <h3>Criar enquete</h3>}
          <label>
            <span className="sr-only">Sua mensagem</span>
            <textarea
              rows={4}
              required
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="O que você está pensando sobre sua leitura?"
            />
          </label>
          {poll && (
            <label>
              Opções da enquete
              <textarea
                rows={3}
                required
                value={options}
                onChange={(event) => setOptions(event.target.value)}
                placeholder="Uma opção por linha"
              />
            </label>
          )}
          <MediaPicker
            clubId={clubId}
            value={media}
            onChange={setMedia}
            onBusy={setUploading}
            imagesOnly
          />
          {error && <p role="alert">{error}</p>}
          <div className="workspace-actions">
            <Button disabled={busy || uploading}>{busy ? 'Publicando…' : 'Publicar'}</Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy || uploading}
              onClick={() => setOpen(false)}
            >
              Fechar rascunho
            </Button>
          </div>
        </form>
      )}
      {!open && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setPoll(true)
            setOpen(true)
          }}
        >
          Criar enquete
        </Button>
      )}
    </section>
  )
}
export function PostCard({
  post,
  clubId,
  onChanged,
  onRemoved,
}: {
  post: PostDto
  clubId: string | null
  onChanged: (post: PostDto) => void
  onRemoved: () => void
}) {
  const { user } = useAuth(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [comments, setComments] = useState(false),
    [edit, setEdit] = useState(false),
    [draft, setDraft] = useState(post.body),
    [quote, setQuote] = useState(post.quote),
    [source, setSource] = useState(post.source)
  const { addToPersonal } = useWorkspace(),
    [bookMessage, setBookMessage] = useState('')
  const path = `${postBase(clubId)}/${post.id}`
  async function act(suffix: string, body?: unknown, method = 'POST') {
    setBusy(true)
    setError('')
    try {
      await apiRequest(user!, path + suffix, method, body)
      if (method === 'DELETE') {
        onRemoved()
        return
      }
      onChanged(await apiRequest<PostDto>(user!, path))
      setEdit(false)
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }
  const total = post.options.reduce((sum, option) => sum + option.votes, 0)
  return (
    <article className="social-post">
      <header className="post-heading">
        <div>
          <UserIdentity
            id={post.author.id}
            name={post.author.name}
            avatarId={post.author.avatarId}
            meta={
              <>
                {kindLabels[post.kind]} · {date(post.createdAt)}
                {post.version > 0 ? ' · Editado' : ''}
              </>
            }
          />
        </div>
        <details className="post-options">
          <summary aria-label="Opções da publicação">•••</summary>
          <div className="social-menu">
            {post.canEdit && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setDraft(post.body)
                  setQuote(post.quote)
                  setSource(post.source)
                  setEdit(!edit)
                }}
              >
                Editar publicação
              </Button>
            )}
            <ReportAction kind="post" id={post.id} />
            {post.canDelete && (
              <ConfirmAction
                label="Excluir publicação"
                disabled={busy}
                onConfirm={() => act('', undefined, 'DELETE')}
              />
            )}
            {clubId === null && user?.emailVerified && (
              <ConfirmAction
                label="Compartilhar na comunidade"
                confirmLabel="Publicar compartilhamento público"
                disabled={busy}
                onConfirm={async () => {
                  setBusy(true)
                  setError('')
                  try {
                    await apiRequest(user, path + '/share', 'POST', { body: '' })
                    setError('Compartilhamento publicado na comunidade.')
                  } catch (err) {
                    setError(readableError(err))
                  } finally {
                    setBusy(false)
                  }
                }}
              />
            )}
          </div>
        </details>
      </header>
      {edit ? (
        <form
          className="workspace-form"
          onSubmit={(event) => {
            event.preventDefault()
            void act('/edit', { body: draft, quote, source, version: post.version })
          }}
        >
          <label>
            Mensagem
            <textarea
              required={!quote.trim()}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          {post.quote && (
            <>
              <label>
                Trecho
                <textarea
                  maxLength={280}
                  value={quote}
                  onChange={(event) => setQuote(event.target.value)}
                />
              </label>
              <label>
                Origem
                <input
                  maxLength={500}
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                />
              </label>
            </>
          )}
          <div className="workspace-actions">
            <Button disabled={busy}>Salvar alteração</Button>
            <Button type="button" variant="ghost" onClick={() => setEdit(false)}>
              Cancelar edição
            </Button>
          </div>
        </form>
      ) : (
        <>
          <p className="post-body">{post.body}</p>
          {post.sharedPostId && (
            <Link to={`/app/community?post=${post.sharedPostId}`}>
              Abrir publicação compartilhada →
            </Link>
          )}
          {post.quote && (
            <blockquote className="literary-quote">
              <p>“{post.quote}”</p>
              <cite>
                {post.bookTitle}
                {post.bookAuthor ? ' · ' + post.bookAuthor : ''}
                {post.source ? ' — ' + post.source : ''}
              </cite>
            </blockquote>
          )}
          {post.bookTitle && !post.quote && (
            <div className="post-book-reference">
              <small>ENTRE ESSAS PÁGINAS</small>
              <strong>{post.bookTitle}</strong>
              <span>{post.bookAuthor}</span>
            </div>
          )}
          <>
            {post.bookTitle && (
              <div>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void addToPersonal({ title: post.bookTitle, author: post.bookAuthor }).then(
                      (ok) => ok && setBookMessage('Título adicionado à sua biblioteca pessoal.'),
                    )
                  }
                >
                  Adicionar à minha biblioteca
                </Button>
                {bookMessage && <p role="status">{bookMessage}</p>}
              </div>
            )}
          </>
          <MediaCarousel
            media={post.media}
            publicMedia={clubId === null}
            alt={post.body.slice(0, 100) || post.bookTitle || 'Registro do clube'}
          />
          {post.options.length > 0 && (
            <div className="post-poll" role="group" aria-label="Votar na enquete">
              {post.options.map((option) => (
                <Button
                  key={option.id}
                  variant={option.selected ? 'primary' : 'secondary'}
                  disabled={busy || !user?.emailVerified}
                  onClick={() => void act('/vote', { optionId: option.id })}
                >
                  {option.label}
                  <span>
                    {total ? Math.round((option.votes / total) * 100) : 0}% · {option.votes}
                    {option.selected ? ' · Seu voto' : ''}
                  </span>
                </Button>
              ))}
              <small>{total} voto(s) · uma escolha por pessoa</small>
            </div>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <footer className="post-interactions social-actions">
        <Button
          variant="ghost"
          className={post.liked ? 'is-liked' : ''}
          aria-label={`${post.liked ? 'Descurtir' : 'Curtir'} publicação`}
          aria-pressed={post.liked}
          disabled={busy || !user?.emailVerified}
          onClick={() => void act('/like', { value: !post.liked })}
        >
          <Heart size={19} fill={post.liked ? 'currentColor' : 'none'} />
          {post.likes}
        </Button>
        <Button
          variant="ghost"
          aria-label="Comentários da publicação"
          aria-expanded={comments}
          onClick={() => setComments(!comments)}
        >
          <MessageCircle size={19} />
          {post.comments}
        </Button>
        <ShareAction
          path={clubId ? `/space/${clubId}?post=${post.id}` : `/app/community?post=${post.id}`}
          privateContent={clubId !== null}
        />
        <Button
          variant="ghost"
          aria-label={post.saved ? 'Retirar publicação dos salvos' : 'Salvar publicação'}
          aria-pressed={post.saved}
          disabled={busy || !user?.emailVerified}
          onClick={() => void act('/save', { value: !post.saved })}
        >
          <Bookmark size={19} fill={post.saved ? 'currentColor' : 'none'} />
        </Button>
      </footer>
      {!user?.emailVerified && clubId === null && (
        <p>
          <Link to="/account">Entre para curtir, salvar e conversar</Link>.
        </p>
      )}
      {comments && (
        <PostComments
          clubId={clubId}
          postId={post.id}
          onClose={() => setComments(false)}
          onCountChanged={() =>
            void apiRequest<PostDto>(user!, path)
              .then(onChanged)
              .catch((err) => setError(readableError(err)))
          }
        />
      )}
    </article>
  )
}
export function PostComments({
  clubId,
  postId,
  onClose = () => {},
  onCountChanged = () => {},
}: {
  clubId: string | null
  postId: string
  onClose?: () => void
  onCountChanged?: () => void
}) {
  const { user } = useAuth(),
    [page, setPage] = useState<Page<CommentDto>>({ items: [], nextCursor: null }),
    [body, setBody] = useState('')
  const [parent, setParent] = useState<CommentDto | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const [media, setMedia] = useState<PostMedia[]>([]),
    [uploading, setUploading] = useState(false),
    [attachments, setAttachments] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null),
    scroll = useRef<HTMLDivElement>(null),
    sending = useRef(false),
    commentRequest = useRef({ payload: '', id: '' })
  const path = `${postBase(clubId)}/${postId}/comments`
  useEffect(() => {
    let live = true
    setLoading(true)
    setError('')
    setPage({ items: [], nextCursor: null })
    socialRead<Page<CommentDto>>(user, path)
      .then((value) => live && setPage(value))
      .catch((err) => live && setError(readableError(err)))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [user?.uid, user?.emailVerified, path])
  useEffect(() => {
    const element = field.current
    if (element) {
      element.style.height = 'auto'
      element.style.height = `${Math.min(120, element.scrollHeight)}px`
    }
  }, [body])
  async function refreshOne(id: string, insert = false) {
    const item = await socialRead<CommentDto>(user, `${path}/${id}`)
    setPage((value) => ({
      ...value,
      items: value.items.some((c) => c.id === id)
        ? value.items.map((c) => (c.id === id ? item : c))
        : insert
          ? [item, ...value.items]
          : value.items,
    }))
  }
  async function change(comment: CommentDto, suffix: string, payload?: unknown, method = 'POST') {
    setBusy(true)
    setError('')
    try {
      await apiRequest(user!, `${path}/${comment.id}${suffix}`, method, payload)
      await refreshOne(comment.id)
      if (method === 'DELETE') onCountChanged()
      return true
    } catch (err) {
      setError(readableError(err))
      return false
    } finally {
      setBusy(false)
    }
  }
  async function more() {
    setBusy(true)
    try {
      const next = await socialRead<Page<CommentDto>>(
        user,
        `${path}?cursor=${encodeURIComponent(page.nextCursor!)}`,
      )
      setPage((value) => ({
        items: [
          ...value.items,
          ...next.items.filter((c) => !value.items.some((old) => old.id === c.id)),
        ],
        nextCursor: next.nextCursor,
      }))
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }
  const roots = page.items.filter((c) => !c.parentId),
    orphans = page.items.filter(
      (c) => c.parentId && !page.items.some((root) => root.id === c.parentId),
    )
  function reply(comment: CommentDto) {
    setParent(comment)
    field.current?.focus()
  }
  function row(comment: CommentDto) {
    return (
      <CommentRow
        key={comment.id}
        comment={comment}
        busy={busy}
        signedIn={!!user?.emailVerified}
        publicMedia={clubId === null}
        onReply={() => reply(comment)}
        onLike={() => void change(comment, '/like', { value: !comment.liked })}
        onDelete={() => change(comment, '', undefined, 'DELETE')}
        onEdit={(text) => change(comment, '/edit', { body: text, version: comment.version })}
      />
    )
  }
  return (
    <Sheet title="Comentários" onClose={onClose} className="comments-sheet">
      <section className="post-comments" aria-label="Comentários da publicação">
        <div className="comments-scroll" ref={scroll}>
          {error && <p role="alert">{error}</p>}
          {loading && <p role="status">Abrindo comentários…</p>}
          {roots.map((root) => (
            <div className="comment-thread" key={root.id}>
              {row(root)}
              <div className="comment-replies">
                {page.items
                  .filter((c) => c.parentId === root.id)
                  .slice()
                  .reverse()
                  .map(row)}
              </div>
            </div>
          ))}
          {orphans.map((comment) => (
            <div className="comment-thread" key={comment.id}>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void refreshOne(comment.parentId!, true).catch((err) =>
                    setError(readableError(err)),
                  )
                }
              >
                Ver comentário original
              </Button>
              <div className="comment-replies">{row(comment)}</div>
            </div>
          ))}
          {page.nextCursor && (
            <Button variant="ghost" disabled={busy} onClick={() => void more()}>
              Mais comentários
            </Button>
          )}
          {!loading && !page.items.length && (
            <p className="comments-empty">Seja a primeira pessoa a comentar.</p>
          )}
        </div>
        {user?.emailVerified ? (
          <form
            className="comment-composer"
            onSubmit={(event) => {
              event.preventDefault()
              if (sending.current || uploading || !body.trim()) return
              sending.current = true
              setBusy(true)
              setError('')
              const input = {
                  body,
                  mediaIds: media.map((item) => item.id),
                  ...(parent ? { parentId: parent.id } : {}),
                },
                payload = JSON.stringify(input)
              if (commentRequest.current.payload !== payload)
                commentRequest.current = { payload, id: crypto.randomUUID() }
              void apiRequest<{ id: string }>(user, path, 'POST', {
                ...input,
                clientRequestId: commentRequest.current.id,
              })
                .then(async (result) => {
                  await refreshOne(result.id, true)
                  setBody('')
                  setParent(null)
                  setMedia([])
                  setAttachments(false)
                  commentRequest.current = { payload: '', id: '' }
                  onCountChanged()
                })
                .catch((err) => setError(readableError(err)))
                .finally(() => {
                  sending.current = false
                  setBusy(false)
                })
            }}
          >
            {parent && (
              <div className="comment-reply-target">
                <span>Respondendo a {parent.author?.name ?? 'Leitor'}</span>
                <Button type="button" variant="ghost" onClick={() => setParent(null)}>
                  Cancelar resposta
                </Button>
              </div>
            )}
            {attachments && (
              <div className="comment-attachments-panel">
                <MediaPicker
                  compact
                  imagesOnly
                  clubId={clubId}
                  value={media}
                  onChange={setMedia}
                  onBusy={setUploading}
                />
              </div>
            )}
            <button
              type="button"
              className="social-action"
              aria-label="Adicionar fotos ao comentário"
              aria-expanded={attachments}
              onClick={() => setAttachments(!attachments)}
            >
              <ImagePlus size={20} />
            </button>
            <label className="comment-field">
              <span className="sr-only">{parent ? 'Sua resposta' : 'Seu comentário'}</span>
              <textarea
                ref={field}
                required
                rows={1}
                placeholder={
                  parent
                    ? `Respondendo a ${parent.author?.name ?? 'Leitor'}…`
                    : 'Adicione um comentário…'
                }
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="social-action"
              aria-label="Publicar comentário"
              disabled={busy || uploading || !body.trim()}
            >
              <Send size={21} />
            </button>
          </form>
        ) : (
          <p className="comments-login">
            <Link to="/account">Entre para comentar</Link>
          </p>
        )}
      </section>
    </Sheet>
  )
}
export function relativeTime(value: string) {
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return ''
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  const unit =
    seconds < 60 ? 'second' : seconds < 3600 ? 'minute' : seconds < 86400 ? 'hour' : 'day'
  const divisor = unit === 'second' ? 1 : unit === 'minute' ? 60 : unit === 'hour' ? 3600 : 86400
  return new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto', style: 'short' }).format(
    -Math.floor(seconds / divisor),
    unit,
  )
}
function CommentRow({
  comment,
  busy,
  signedIn,
  publicMedia,
  onReply,
  onLike,
  onDelete,
  onEdit,
}: {
  comment: CommentDto
  busy: boolean
  signedIn: boolean
  publicMedia: boolean
  onReply: () => void
  onLike: () => void
  onDelete: () => Promise<boolean>
  onEdit: (text: string) => Promise<boolean>
}) {
  const [edit, setEdit] = useState(false),
    [draft, setDraft] = useState(comment.body)
  if (comment.deleted)
    return <article className="post-comment comment-tombstone">Comentário excluído.</article>
  return (
    <article className="post-comment">
      <Link
        className="comment-avatar"
        to={`/app/people/${comment.author?.id}`}
        aria-label={`Perfil de ${comment.author?.name ?? 'Leitor'}`}
      >
        <UserAvatar
          name={comment.author?.name ?? 'Leitor'}
          avatarId={comment.author?.avatarId}
          size="sm"
        />
      </Link>
      <div className="comment-content">
        {edit ? (
          <form
            className="comment-edit"
            onSubmit={(event) => {
              event.preventDefault()
              void onEdit(draft).then((ok) => ok && setEdit(false))
            }}
          >
            <label>
              <span className="sr-only">Editar comentário</span>
              <textarea required value={draft} onChange={(event) => setDraft(event.target.value)} />
            </label>
            <Button disabled={busy}>Salvar comentário</Button>
            <Button type="button" variant="ghost" onClick={() => setEdit(false)}>
              Cancelar edição
            </Button>
          </form>
        ) : (
          <p className="comment-copy">
            <Link to={`/app/people/${comment.author?.id}`}>
              <strong>{comment.author?.name ?? 'Leitor'}</strong>
            </Link>{' '}
            {comment.body}
          </p>
        )}
        {!!comment.media?.length && (
          <MediaCarousel media={comment.media} alt="Foto do comentário" publicMedia={publicMedia} />
        )}
        <div className="comment-meta">
          <time dateTime={comment.createdAt} title={date(comment.createdAt)}>
            {relativeTime(comment.createdAt)}
          </time>
          {comment.version > 0 && <span>Editado</span>}
          {
            <span className="comment-like-count">
              {comment.likes} curtida{comment.likes === 1 ? '' : 's'}
            </span>
          }
          {signedIn && (
            <button type="button" onClick={onReply}>
              Responder
            </button>
          )}
          <details className="social-more">
            <summary className="social-action" aria-label="Opções do comentário">
              <MoreHorizontal size={17} />
            </summary>
            <div className="social-menu">
              {comment.canEdit && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDraft(comment.body)
                    setEdit(true)
                  }}
                >
                  Editar comentário
                </Button>
              )}
              <ReportAction kind="comment" id={comment.id} />
              {comment.canDelete && (
                <ConfirmAction
                  label="Excluir comentário"
                  disabled={busy}
                  onConfirm={async () => {
                    await onDelete()
                  }}
                />
              )}
            </div>
          </details>
        </div>
      </div>
      <button
        className="comment-like social-action"
        type="button"
        aria-label={comment.liked ? 'Descurtir comentário' : 'Curtir comentário'}
        aria-pressed={comment.liked}
        disabled={busy || !signedIn}
        onClick={onLike}
      >
        <Heart size={16} fill={comment.liked ? 'currentColor' : 'none'} />
      </button>
    </article>
  )
}
