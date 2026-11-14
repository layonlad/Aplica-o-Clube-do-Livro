import { ConfirmAction } from './ConfirmAction'
export { ConfirmAction } from './ConfirmAction'
import { ReportAction } from './ReportAction'
import { postBase, socialRead } from './social-api'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bookmark, Heart, MessageCircle, MessageSquare, PenLine } from 'lucide-react'
import type { Page, PostDto, CommentDto, PostMedia } from '../../server/src/community-contracts'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, readableError } from '../auth/api'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import { Button } from '../components/ui'
import { MediaPicker, PrivateMedia } from './PrivateMedia'
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
        <PostComposer clubId={clubId} onPublished={() => setRevision((value) => value + 1)} />
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
  const { user } = useAuth(),
    { snapshot } = useWorkspace(),
    [open, setOpen] = useState(false),
    [kind, setKind] = useState<keyof typeof kindLabels>('reflection'),
    [body, setBody] = useState(''),
    [quote, setQuote] = useState(''),
    [source, setSource] = useState(''),
    [bookId, setBookId] = useState(''),
    [options, setOptions] = useState(''),
    [media, setMedia] = useState<PostMedia[]>([])
  const [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!user) return
    setBusy(true)
    setError('')
    try {
      const book = snapshot?.state.books.find((item) => item.id === bookId)
      await apiRequest(user, postBase(clubId), 'POST', {
        kind,
        body,
        quote,
        source,
        bookTitle: book?.title ?? '',
        bookAuthor: book?.author ?? '',
        mediaIds: media.map((item) => item.id),
        options:
          kind === 'poll'
            ? options
                .split('\n')
                .map((value) => value.trim())
                .filter(Boolean)
            : [],
      })
      setBody('')
      setQuote('')
      setSource('')
      setOptions('')
      setMedia([])
      setOpen(false)
      onPublished()
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="post-composer">
      <button
        className="composer-prompt"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="social-initial">{user?.displayName?.[0] ?? 'L'}</span>
        <span>O que sua leitura despertou hoje?</span>
        <PenLine size={18} />
      </button>
      {open && (
        <form className="workspace-form" onSubmit={submit}>
          <p className="composer-audience">
            {clubId === null
              ? 'Publicação pública · qualquer pessoa poderá ver'
              : 'Publicação privada · integrantes deste clube'}
          </p>
          <label>
            Tipo
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as keyof typeof kindLabels)}
            >
              {Object.entries(kindLabels)
                .filter(
                  ([value]) =>
                    value !== 'announcement' ||
                    (clubId !== null && ['owner', 'admin'].includes(snapshot?.role ?? 'member')),
                )
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Sua mensagem
            <textarea
              rows={4}
              required={!quote.trim()}
              maxLength={5000}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Uma ideia que merece encontrar outros leitores…"
            />
          </label>
          {kind === 'quote' && (
            <>
              <label>
                Citação curta · até 280 caracteres
                <textarea
                  required
                  maxLength={280}
                  value={quote}
                  onChange={(event) => setQuote(event.target.value)}
                />
              </label>
              <label>
                Origem do trecho
                <input
                  required
                  maxLength={500}
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  placeholder="Livro, edição e página, quando disponível"
                />
              </label>
            </>
          )}
          <label>
            Livro relacionado
            <select value={bookId} onChange={(event) => setBookId(event.target.value)}>
              <option value="">Sem livro relacionado</option>
              {snapshot?.state.books.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title} · {book.author}
                </option>
              ))}
            </select>
          </label>
          {kind === 'poll' && (
            <label>
              Opções da enquete · duas a seis, uma por linha
              <textarea
                required
                rows={3}
                maxLength={605}
                value={options}
                onChange={(event) => setOptions(event.target.value)}
              />
            </label>
          )}
          <MediaPicker clubId={clubId} value={media} onChange={setMedia} onBusy={setUploading} />
          {error && <p role="alert">{error}</p>}
          <div className="workspace-actions">
            <Button disabled={busy || uploading}>
              {busy
                ? 'Publicando…'
                : clubId === null
                  ? 'Publicar na comunidade'
                  : 'Publicar no clube'}
            </Button>
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
        <span className="social-initial">
          {clubId === null && post.author.avatarId ? (
            <PrivateMedia
              publicMedia
              media={{
                id: post.author.avatarId,
                kind: 'image',
                width: 1,
                height: 1,
                duration: null,
              }}
              alt={post.author.name}
            />
          ) : (
            post.author.name[0]
          )}
        </span>
        <div>
          {clubId === null ? (
            <Link to={`/app/people/${post.author.id}`}>
              <strong>{post.author.name}</strong>
            </Link>
          ) : (
            <strong>{post.author.name}</strong>
          )}
          <small>
            {kindLabels[post.kind]} · {date(post.createdAt)}
            {post.version > 0 ? ' · Editado' : ''}
          </small>
        </div>
        <details className="post-options">
          <summary aria-label="Opções da publicação">•••</summary>
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
              maxLength={5000}
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
          <div className="post-media-grid">
            {post.media.map((media) => (
              <PrivateMedia
                publicMedia={clubId === null}
                key={media.id}
                media={media}
                alt={post.body.slice(0, 100) || post.bookTitle || 'Registro do clube'}
              />
            ))}
          </div>
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
      <footer className="post-interactions">
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
        <Button variant="ghost" aria-expanded={comments} onClick={() => setComments(!comments)}>
          <MessageCircle size={19} />
          {post.comments} comentário(s)
        </Button>
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
      )}{' '}
      {comments && (
        <PostComments
          clubId={clubId}
          postId={post.id}
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
  onCountChanged = () => {},
}: {
  clubId: string | null
  postId: string
  onCountChanged?: () => void
}) {
  const { user } = useAuth(),
    [page, setPage] = useState<Page<CommentDto>>({ items: [], nextCursor: null }),
    [body, setBody] = useState(''),
    [parent, setParent] = useState<CommentDto | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0)
  const path = `${postBase(clubId)}/${postId}/comments`
  useEffect(() => {
    let live = true
    setPage({ items: [], nextCursor: null })
    setError('')
    setBusy(true)
    socialRead<Page<CommentDto>>(user, path)
      .then((value) => live && setPage(value))
      .catch((err) => live && setError(readableError(err)))
      .finally(() => live && setBusy(false))
    return () => {
      live = false
    }
  }, [user?.uid, user?.emailVerified, path, revision])
  async function action(suffix: string, body?: unknown, method = 'POST') {
    setBusy(true)
    setError('')
    try {
      await apiRequest(user!, path + suffix, method, body)
      setRevision((value) => value + 1)
      onCountChanged()
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
      setPage((value) => ({ items: [...value.items, ...next.items], nextCursor: next.nextCursor }))
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="post-comments" aria-label="Comentários da publicação">
      {error && <p role="alert">{error}</p>}
      {busy && !page.items.length && <p role="status">Abrindo comentários…</p>}
      {page.items.map((comment) => (
        <article
          key={comment.id}
          className={comment.parentId ? 'post-comment post-comment--reply' : 'post-comment'}
        >
          {comment.deleted ? (
            <p>Comentário excluído.</p>
          ) : (
            <>
              <strong>{comment.author?.name}</strong>
              <small>
                {date(comment.createdAt)}
                {comment.parentId ? ' · Resposta na conversa' : ''}
              </small>
              <p className="preserve-text">{comment.body}</p>
              <div className="workspace-actions">
                <Button
                  variant="ghost"
                  disabled={busy || !user?.emailVerified}
                  aria-pressed={comment.liked}
                  onClick={() => void action(`/${comment.id}/like`, { value: !comment.liked })}
                >
                  <Heart size={15} fill={comment.liked ? 'currentColor' : 'none'} />
                  {comment.likes}
                </Button>
                {user?.emailVerified && !comment.parentId && (
                  <Button variant="ghost" onClick={() => setParent(comment)}>
                    Responder
                  </Button>
                )}
                <ReportAction kind="comment" id={comment.id} />
                {comment.canDelete && (
                  <ConfirmAction
                    label="Excluir comentário"
                    disabled={busy}
                    onConfirm={async () => {
                      await action(`/${comment.id}`, undefined, 'DELETE')
                    }}
                  />
                )}
              </div>
            </>
          )}
        </article>
      ))}
      {page.nextCursor && (
        <Button variant="ghost" disabled={busy} onClick={() => void more()}>
          Mais comentários
        </Button>
      )}
      {user?.emailVerified && (
        <form
          className="workspace-form"
          onSubmit={(event) => {
            event.preventDefault()
            void action('', { body, ...(parent ? { parentId: parent.id } : {}) }).then((ok) => {
              if (ok) {
                setBody('')
                setParent(null)
              }
            })
          }}
        >
          {parent && (
            <div className="workspace-actions">
              <span>Respondendo a {parent.author?.name}</span>
              <Button type="button" variant="ghost" onClick={() => setParent(null)}>
                Cancelar resposta
              </Button>
            </div>
          )}
          <label>
            {parent ? 'Sua resposta' : 'Seu comentário'}
            <textarea
              required
              maxLength={2000}
              rows={2}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </label>
          <Button disabled={busy}>Comentar</Button>
        </form>
      )}
    </section>
  )
}
