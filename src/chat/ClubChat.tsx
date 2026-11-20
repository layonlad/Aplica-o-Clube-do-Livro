import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BookOpen, Ellipsis, EyeOff, MoreHorizontal, SendHorizontal } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import {
  apiRequest,
  authenticatedResponse,
  ApiError,
  readableError,
} from '../auth/api'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import { BookCover } from '../coral/kit'
import { ClubForum } from '../forum/ClubForum'
import { UserAvatar } from '../components/UserAvatar'
import type { Member } from '../../server/src/contracts'
import './chat.css'

type Settings = {
  chapter: string
  role: string
  muted: boolean
  enabled: boolean
  preference: string
  slow: number
  pins: number
}
type Message = {
  id: string
  name: string
  text: string
  avatarId: string | null
  own: boolean
  authorId: string
  createdAt: string
  replyTo: string | null
  spoiler: boolean
  chapter: string
  pinned: boolean
  reactions: Record<string, number> | null
  mine: string | null
}
type Page = {
  items: Message[]
  before: string | null
  version: string
  pins: string[]
  retryAfterMs?: number
  unchanged?: boolean
}
type Draft = {
  id: string
  room: string
  text: string
  mentions: string[]
  spoiler: boolean
  replyTo: string | null
  failed?: boolean
}
const rooms = [
  ['general', 'Geral'],
  ['reading', 'Leitura atual'],
  ['spoilers', 'Com spoilers'],
]
const preferences = [
  ['all', 'Todas as mensagens'],
  ['mentions', 'Menções e respostas'],
  ['announcements', 'Comunicados'],
  ['silent', 'Silenciado'],
]
export default function ClubChat() {
  const { scope } = useWorkspace()
  return scope === 'personal' ? (
    <Link to="/app/clubs">Escolher um clube</Link>
  ) : (
    <Conversation key={scope} club={scope} />
  )
}
function Conversation({ club }: { club: string }) {
  const { user } = useAuth(),
    { scopeName, snapshot } = useWorkspace(),
    [params] = useSearchParams()
  const [tab, setTab] = useState(params.get('tab')==='members'?'Membros':'Chat'),
    [room, setRoom] = useState('general'),
    [settings, setSettings] = useState<Settings | null>(null)
  const [members, setMembers] = useState<Member[]>([]),
    [count, setCount] = useState(0),
    [menu, setMenu] = useState(false),
    [error, setError] = useState('')
  const [reports, setReports] = useState<
    { id: string; room: string; reason: string }[]
  >([])
  const shell = useRef<HTMLElement>(null)
  useEffect(() => {
    const viewport = window.visualViewport
    const resize = () =>
      shell.current?.style.setProperty(
        '--chat-height',
        (viewport?.height ?? window.innerHeight) + 'px',
      )
    resize()
    viewport?.addEventListener('resize', resize)
    return () => viewport?.removeEventListener('resize', resize)
  }, [])
  const path = '/clubs/' + club + '/chat'
  const request = <T,>(suffix: string, data?: unknown) =>
    apiRequest<T>(
      user!,
      path + suffix,
      data === undefined ? 'GET' : 'POST',
      data,
    )
  const book = snapshot?.state.books.find(
    (b) => b.id === snapshot.state.currentBookId,
  )
  const target = params.get('message')
  useEffect(() => {
    if (!target) return
    let live = true
    request<{ room: string }>('/locate/' + encodeURIComponent(target))
      .then((r) => {
        if (live) setRoom(r.room)
      })
      .catch((e) => live && setError(readableError(e)))
    return () => {
      live = false
    }
  }, [target, path])
  const [membersNext, setMembersNext] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    Promise.all([
      request<Settings>('/settings'),
      apiRequest<{
        members: Member[]
        memberCount: number
        membersNextCursor?: string
      }>(user!, '/clubs/' + club),
    ])
      .then(([s, d]) => {
        if (live) {
          setSettings(s)
          setMembers(d.members.filter((m) => m.status === 'active'))
          setCount(d.memberCount)
          setMembersNext(d.membersNextCursor ?? null)
        }
      })
      .catch((e) => live && setError(readableError(e)))
    return () => {
      live = false
    }
  }, [club, user?.uid])
  async function change(data: unknown) {
    try {
      await request('/settings', data)
      setSettings(await request('/settings'))
      setError('')
    } catch (e) {
      setError(readableError(e))
    }
  }
  return (
    <section className="chat-shell" ref={shell}>
      <header className="chat-head">
        <span className="chat-head__icon" aria-hidden="true">
          <BookOpen size={22} />
        </span>
        <div className="chat-head__text">
          <strong>{scopeName}</strong>
          <small>
            {count} {count === 1 ? 'membro' : 'membros'} • Leitura atual
          </small>
        </div>
        <button
          className="chat-head__menu"
          onClick={() => setMenu(!menu)}
          aria-label="Opções do chat"
          aria-expanded={menu}
        >
          <Ellipsis size={22} />
        </button>
      </header>
      {book && (
        <Link className="chat-book" to="/app/library">
          <BookCover
            title={book.title}
            author={book.author}
            image={book.metadata?.cover}
            width={56}
          />
          <span className="chat-book__text">
            <strong>{book.title}</strong>
            <small>
              {settings?.chapter ? settings.chapter : 'Leitura do clube'}
            </small>
          </span>
          <span className="chat-book__badge">Em leitura</span>
        </Link>
      )}
      {menu && settings && (
        <section className="chat-options">
          <Link to="/app">Voltar ao clube</Link>
          <label>
            Conversa
            <select
              value={room}
              onChange={(e) => {
                setRoom(e.target.value)
                setTab('Chat')
                setMenu(false)
              }}
            >
              {rooms.map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            Notificações
            <select
              value={settings.preference}
              onChange={(e) =>
                void change({ type: 'preference', value: e.target.value })
              }
            >
              {preferences.map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {['owner', 'admin'].includes(settings.role) && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const f = new FormData(e.currentTarget)
                void change({
                  type: 'settings',
                  chapter: f.get('chapter'),
                  enabled: f.has('enabled'),
                  pins: Number(f.get('pins')),
                  slow: Number(f.get('slow')),
                })
              }}
            >
              <label>
                Etapa da leitura
                <input
                  name="chapter"
                  defaultValue={settings.chapter}
                  maxLength={100}
                />
              </label>
              <label>
                Intervalo entre mensagens em segundos
                <input
                  name="slow"
                  type="number"
                  min="1"
                  max="300"
                  defaultValue={settings.slow}
                />
              </label>
              <label>
                Limite de fixadas
                <input
                  type="number"
                  name="pins"
                  min="1"
                  max="10"
                  defaultValue={settings.pins}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={settings.enabled}
                />{' '}
                Chat ativo
              </label>
              <button>Salvar</button>
            </form>
          )}
          {settings.role !== 'member' && (
            <>
              <button
                onClick={() =>
                  void request<typeof reports>('/reports')
                    .then(setReports)
                    .catch((e) => setError(readableError(e)))
                }
              >
                Ver denúncias
              </button>
              {reports.map((r, i) => (
                <div key={r.id + i}>
                  {r.reason}{' '}
                  <button
                    onClick={() =>
                      void request('/' + r.id + '/action', { type: 'remove' })
                        .then(() =>
                          setReports((v) => v.filter((x) => x.id !== r.id)),
                        )
                        .catch((e) => setError(readableError(e)))
                    }
                  >
                    Remover mensagem
                  </button>
                </div>
              ))}
            </>
          )}
        </section>
      )}
      <nav className="chat-tabs" aria-label="Seções do clube">
        {['Chat', 'Debates', 'Membros'].map((t) => (
          <button key={t} aria-pressed={t === tab} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      {error && <p role="alert">{error}</p>}
      {tab === 'Debates' ? (
        <ClubForum clubId={club} />
      ) : tab === 'Membros' ? (
        <section>
          {members.map((m) => (
            <p key={m.id}>
              <UserAvatar name={m.name} avatarId={m.avatarId} size="xs" />{' '}
              {m.name} · {m.role}
              {settings?.role !== 'member' && m.role === 'member' && (
                <>
                  <button
                    onClick={() =>
                      void change({ type: 'mute', member: m.id, on: true })
                    }
                  >
                    Silenciar
                  </button>
                  <button
                    onClick={() =>
                      void change({ type: 'mute', member: m.id, on: false })
                    }
                  >
                    Permitir envio
                  </button>
                </>
              )}
            </p>
          ))}
          {membersNext && (
            <button
              onClick={() =>
                void apiRequest<{ items: Member[]; nextCursor: string | null }>(
                  user!,
                  '/clubs/' +
                    club +
                    '/members?cursor=' +
                    encodeURIComponent(membersNext),
                )
                  .then((p) => {
                    setMembers((v) => [
                      ...v,
                      ...p.items.filter((m) => m.status === 'active'),
                    ])
                    setMembersNext(p.nextCursor)
                  })
                  .catch((e) => setError(readableError(e)))
              }
            >
              Mais membros
            </button>
          )}
        </section>
      ) : settings?.enabled ? (
        <>
          {room !== 'general' && (
            <button className="chat-room" onClick={() => setRoom('general')}>
              {rooms.find(([v]) => v === room)?.[1]} · voltar para Geral
            </button>
          )}
          <Timeline
            key={room}
            {...{ room, path, settings }}
            focus={params.get('message')}
          />
        </>
      ) : (
        <p role="status">
          {settings ? 'Chat desativado' : 'Carregando conversa…'}
        </p>
      )}
    </section>
  )
}
function Timeline({
  room,
  path,
  settings,
  focus,
}: {
  room: string
  path: string
  settings: Settings
  focus: string | null
}) {
  const { user } = useAuth(),
    [items, setItems] = useState<Message[]>([]),
    [older, setOlder] = useState<Message[]>([]),
    [cursor, setCursor] = useState<string | null>(null)
  const [pins, setPins] = useState<string[]>([]),
    [peek, setPeek] = useState<Message | null>(null),
    [drafts, setDrafts] = useState<Draft[]>([]),
    [text, setText] = useState(''),
    [spoiler, setSpoiler] = useState(false),
    [reply, setReply] = useState<Message | null>(null),
    [mentions, setMentions] = useState<string[]>([])
  const [revealed, setRevealed] = useState<string[]>([]),
    [tools, setTools] = useState(''),
    [error, setError] = useState(''),
    [fresh, setFresh] = useState(false)
  const list = useRef<HTMLDivElement>(null),
    bottom = useRef(true),
    alive = useRef(true)
  const previousPages = useRef<string[]>([])
  const loadingMore = useRef(false)
  const base = path + '?room=' + room
  async function show(id: string) {
    try {
      const p = await apiRequest<Page>(user!, base + '&focus=' + id)
      setPeek(p.items[0] ?? null)
      if (!p.items.length) setError('Mensagem indisponível.')
    } catch (e) {
      setError(readableError(e))
    }
  }
  useEffect(() => {
    if (focus) void show(focus)
  }, [focus])
  useEffect(() => {
    const controller = new AbortController()
    alive.current = true
    async function sync() {
      let version = ''
      while (!controller.signal.aborted) {
        try {
          const result = await authenticatedResponse(
            user!,
            base + (version ? '&since=' + version : ''),
            'GET',
            undefined,
            controller.signal,
          )
          const p: Page = await result.json()
          if (controller.signal.aborted) return
          if (!p.unchanged) {
            const anchor = list.current
              ?.querySelector('[data-chat-id]')
              ?.getAttribute('data-chat-id')
            let extra: Message[] = []
            let next = p.before
            for (const _page of previousPages.current) {
              if (!next || controller.signal.aborted) break
              const res = await authenticatedResponse(
                user!,
                base + '&before=' + next,
                'GET',
                undefined,
                controller.signal,
              )
              const prior: Page = await res.json()
              extra = [...prior.items, ...extra]
              next = prior.before
              if (extra.some((m) => m.id === anchor)) break
            }
            if (controller.signal.aborted) return
            setItems(p.items)
            setOlder(extra)
            setCursor(next)
            setPins(p.pins)
            if (version) setPeek(null)
            setDrafts((d) =>
              d.filter((x) => !p.items.some((m) => m.id === x.id)),
            )
            if (bottom.current)
              requestAnimationFrame(() =>
                list.current?.scrollTo(0, list.current.scrollHeight),
              )
            else if (version) setFresh(true)
          }
          version = p.version
          setError('')
          if (p.retryAfterMs)
            await new Promise((r) => setTimeout(r, p.retryAfterMs))
        } catch (e) {
          if (controller.signal.aborted) return
          setError(readableError(e))
          if (e instanceof ApiError && [401, 403, 404].includes(e.status)) {
            setItems([])
            setOlder([])
            setPins([])
            setPeek(null)
            setDrafts([])
            setReply(null)
            return
          }
          await new Promise((r) => setTimeout(r, 1800))
        }
      }
    }
    void sync()
    return () => {
      alive.current = false
      controller.abort()
    }
  }, [user?.uid, base])
  async function send(d: Draft) {
    setDrafts((v) => [
      ...v.filter((x) => x.id !== d.id),
      { ...d, failed: false },
    ])
    try {
      const { failed, ...payload } = d
      await apiRequest(user!, path, 'POST', payload)
    } catch (e) {
      if (alive.current) {
        setDrafts((v) =>
          v.map((x) => (x.id === d.id ? { ...x, failed: true } : x)),
        )
        setError(readableError(e))
      }
    }
  }
  async function act(id: string, data: unknown) {
    try {
      await apiRequest(user!, path + '/' + id + '/action', 'POST', data)
      setTools('')
    } catch (e) {
      setError(readableError(e))
    }
  }
  async function more() {
    if (!cursor || loadingMore.current) return
    loadingMore.current = true
    try {
      const p = await apiRequest<Page>(user!, base + '&before=' + cursor),
        height = list.current?.scrollHeight ?? 0
      previousPages.current.push(cursor)
      setOlder((x) => [...p.items, ...x])
      setCursor(p.before)
      requestAnimationFrame(() =>
        list.current?.scrollBy(0, list.current.scrollHeight - height),
      )
    } catch (e) {
      setError(readableError(e))
    } finally {
      loadingMore.current = false
    }
  }
  const all = [...older, ...items],
    token = text.match(/(?:^|\s)@([^\s@]*)$/)?.[1]
  const [matches, setMatches] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    let live = true
    setMatches([])
    if (token === undefined) return
    const timer = setTimeout(() => {
      apiRequest<typeof matches>(
        user!,
        path + '/members?q=' + encodeURIComponent(token),
      )
        .then((v) => {
          if (live) setMatches(v)
        })
        .catch(() => {})
    }, 160)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [token, path, user?.uid])
  const content = (m: Message) =>
    m.spoiler && !revealed.includes(m.id) ? (
      <button onClick={() => setRevealed((v) => [...v, m.id])}>
        Revelar spoiler {m.chapter}
      </button>
    ) : (
      m.text
    )
  return (
    <>
      {pins.length > 0 && (
        <div>
          {pins.map((id, i) => (
            <button key={id} onClick={() => void show(id)}>
              📌 Fixada {i + 1}
            </button>
          ))}
        </div>
      )}
      {peek && (
        <aside>
          <strong>{peek.name}</strong> {content(peek)}{' '}
          <button onClick={() => setPeek(null)}>Fechar</button>
        </aside>
      )}
      <div
        className="chat-list"
        ref={list}
        onScroll={(e) => {
          const n = e.currentTarget
          bottom.current = n.scrollHeight - n.clientHeight - n.scrollTop < 48
          if (bottom.current) setFresh(false)
        }}
      >
        {cursor && (
          <button onClick={() => void more()}>Mensagens anteriores</button>
        )}
        {all.map((m, i) => (
          <div key={m.id} data-chat-id={m.id}>
            {(!i ||
              new Date(m.createdAt).toDateString() !==
                new Date(all[i - 1].createdAt).toDateString()) && (
              <small className="chat-day">{dayLabel(m.createdAt)}</small>
            )}
            <article className={'chat-bubble' + (m.own ? ' chat-own' : '')}>
              <header className="chat-bubble__head">
                <UserAvatar name={m.name} avatarId={m.avatarId} size="xs" />
                <strong>{m.own ? 'Você' : m.name}</strong>
                {m.pinned && <span aria-label="Fixada">📌</span>}
                <button
                  className="chat-bubble__more"
                  aria-label="Ações da mensagem"
                  aria-expanded={tools === m.id}
                  onClick={() => setTools(tools === m.id ? '' : m.id)}
                >
                  <MoreHorizontal size={16} />
                </button>
              </header>
              {m.replyTo && (
                <button className="chat-quote" onClick={() => void show(m.replyTo!)}>
                  {(() => {
                    const quoted = all.find((x) => x.id === m.replyTo)
                    return quoted
                      ? quoted.name +
                          ' · ' +
                          (quoted.spoiler
                            ? 'Spoiler'
                            : quoted.text.slice(0, 60))
                      : 'Ver mensagem respondida'
                  })()}
                </button>
              )}
              <div className="chat-bubble__text">{content(m)}</div>
              <time className="chat-bubble__time">
                {new Date(m.createdAt).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
              {Object.keys(m.reactions ?? {}).length > 0 && <div className="chat-reactions">{Object.entries(m.reactions ?? {}).map(([emoji, n]) => (
                <button
                  key={emoji}
                  onClick={() =>
                    void act(m.id, {
                      type: 'react',
                      emoji: m.mine === emoji ? null : emoji,
                    })
                  }
                >
                  {emoji} {n}
                </button>
              ))}</div>}
              {tools === m.id && (
                <div className="chat-actions">
                  <button
                    onClick={() => {
                      setReply(m)
                      setTools('')
                    }}
                  >
                    Responder
                  </button>
                  {['❤️', '👍', '📚', '😂', '😮'].map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() =>
                        void act(m.id, {
                          type: 'react',
                          emoji: m.mine === emoji ? null : emoji,
                        })
                      }
                    >
                      {emoji}
                    </button>
                  ))}
                  {settings.role !== 'member' && (
                    <button
                      onClick={() =>
                        void act(m.id, { type: 'pin', on: !m.pinned })
                      }
                    >
                      {m.pinned ? 'Desafixar' : 'Fixar'}
                    </button>
                  )}
                  {(m.own || settings.role !== 'member') && (
                    <button onClick={() => void act(m.id, { type: 'remove' })}>
                      Excluir mensagem
                    </button>
                  )}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      void act(m.id, {
                        type: 'report',
                        reason: new FormData(e.currentTarget).get('reason'),
                      })
                    }}
                  >
                    <input
                      name="reason"
                      aria-label="Motivo da denúncia"
                      placeholder="Motivo da denúncia"
                      required
                      minLength={3}
                      maxLength={400}
                    />
                    <button>Denunciar</button>
                  </form>
                </div>
              )}
            </article>
          </div>
        ))}
        {drafts.map((d) => (
          <article className="chat-bubble chat-own" key={d.id}>
            <header className="chat-bubble__head"><strong>Você</strong></header>
            <div className="chat-bubble__text">{d.text}</div>
            <small className="chat-bubble__time">
              {d.failed ? (
                <button onClick={() => void send(d)}>Tentar novamente</button>
              ) : (
                'Enviando…'
              )}
            </small>
          </article>
        ))}
      </div>
      {fresh && (
        <button
          onClick={() => list.current?.scrollTo(0, list.current.scrollHeight)}
        >
          Novas mensagens ↓
        </button>
      )}
      {error && <small role="alert">{error}</small>}
      <form
        className="chat-compose"
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          void send({
            id: crypto.randomUUID(),
            text: text.trim(),
            room,
            mentions,
            spoiler,
            replyTo: reply?.id ?? null,
          })
          setText('')
          setReply(null)
          setMentions([])
          setSpoiler(false)
        }}
      >
        {reply && (
          <button type="button" onClick={() => setReply(null)}>
            Respondendo a {reply.name} ×
          </button>
        )}
        {token !== undefined && matches.length > 0 && <div className="chat-mention-list" role="group" aria-label="Sugestões de menção">
          {matches.map((m) => (
            <button
              type="button"
              key={m.id}
              onClick={() => {
                setText(
                  text.slice(0, text.length - token.length) + m.name + ' ',
                )
                setMentions((v) => [...new Set([...v, m.id])])
              }}
            >
              @{m.name}
            </button>
          ))}</div>}
        <div className="chat-compose__row">
          <div className="chat-compose__field">
            <input
              autoComplete="off"
              aria-label="Mensagem para o clube"
              placeholder="Mensagem para o clube..."
              maxLength={2000}
              value={text}
              enterKeyHint="send"
              onChange={(e) => setText(e.target.value)}
            />
            <button
              type="button"
              className="chat-compose__spoiler"
              aria-pressed={spoiler}
              aria-label={spoiler ? 'Mensagem marcada como spoiler' : 'Marcar como spoiler'}
              title="Spoiler"
              onClick={() => setSpoiler(!spoiler)}
            >
              <EyeOff size={18} />
            </button>
          </div>
          <button
            className="chat-compose__send"
            aria-label="Enviar"
            disabled={!text.trim() || settings.muted}
          >
            <SendHorizontal size={20} />
          </button>
        </div>
      </form>
    </>
  )
}

/** "Hoje", "Ontem" ou a data, como nos aplicativos de mensagem. */
function dayLabel(value: string) {
  const day = new Date(value),
    today = new Date()
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (same(day, today)) return 'Hoje'
  if (same(day, yesterday)) return 'Ontem'
  return day.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })
}
