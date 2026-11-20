import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AtSign, Bell, BellRing, BookOpen, CalendarDays, CheckCheck, Heart, Mail, MessageCircle, MessagesSquare, Settings, Sparkles, UserPlus, UsersRound, type LucideIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, readableError } from '../auth/api'
import { UserAvatar } from '../components/UserAvatar'
import { AppBar, SheetBody } from '../coral/kit'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import { describe, periodOf, timeLabel, type NotificationTone } from './destination'
import { useOpenNotification } from './open'
import { dismissPushInvite, pushInviteDismissed, usePush } from './push'
import { notificationChanged, notifications, useNotifications } from './store'
import type { Notification } from './types'
import './notifications.css'

export const toneIcon: Record<NotificationTone, LucideIcon> = {
  chat: MessagesSquare,
  wall: MessageCircle,
  community: Sparkles,
  mention: AtSign,
  reply: MessageCircle,
  like: Heart,
  follow: UserPlus,
  invite: Mail,
  club: UsersRound,
  event: CalendarDays,
  reading: BookOpen,
}
const periods = [
  ['today', 'Hoje'],
  ['yesterday', 'Ontem'],
  ['earlier', 'Anteriores'],
] as const

export function NotificationCenter() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const items = useNotifications((state) => state.items)
  const status = useNotifications((state) => state.status)
  const error = useNotifications((state) => state.error)
  const unread = useNotifications((state) => state.unread)
  const nextCursor = useNotifications((state) => state.nextCursor)
  const loadingMore = useNotifications((state) => state.loadingMore)
  const [filter, setFilter] = useState<'all' | 'unread'>(params.get('filtro') === 'nao-lidas' ? 'unread' : 'all')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const open = useOpenNotification()
  const sentinel = useRef<HTMLDivElement>(null)
  // Funções estáveis para as linhas (memo): uma notificação nova não redesenha a lista inteira.
  const latest = useRef({ open, act })
  latest.current = { open, act }
  const openRow = useCallback((item: Notification) => void latest.current.act(item.id, () => latest.current.open(item)), [])

  useEffect(() => { if (user?.emailVerified) void notifications.load() }, [user?.uid, user?.emailVerified])
  // Toque numa notificação push: ?open=<id> abre o destino (depois do login, se a sessão tinha expirado).
  useEffect(() => {
    const id = params.get('open')
    if (!user?.emailVerified || !id || !/^[0-9a-f-]{36}$/i.test(id)) return
    const next = new URLSearchParams(params)
    next.delete('open')
    setParams(next, { replace: true })
    void act(id, () => open({ id }))
  }, [user?.uid, params.get('open')])
  // Rolagem infinita: a próxima página carrega ao chegar perto do fim (o botão continua como alternativa).
  useEffect(() => {
    const node = sentinel.current
    if (!node || !nextCursor || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) void notifications.loadMore() }, { rootMargin: '400px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [nextCursor, items?.length])

  async function act(id: string, run: () => Promise<'opened' | 'gone' | 'no-destination'>) {
    setBusy(id)
    setNotice('')
    try {
      const result = await run()
      if (result === 'gone') setNotice('Este conteúdo não está mais disponível. Ele pode ter sido excluído ou o seu acesso mudou.')
      if (result === 'no-destination') setNotice('Esta notificação não tem uma tela para abrir.')
    } catch (err) {
      setNotice(readableError(err))
    } finally {
      setBusy(null)
    }
  }
  async function markAll() {
    setNotice('')
    try {
      await notifications.markAllRead()
      notificationChanged()
      setNotice('Tudo marcado como lido.')
    } catch (err) {
      setNotice(readableError(err))
    }
  }

  const visible = useMemo(() => (items ?? []).filter((item) => filter === 'all' || !item.readAt), [items, filter])
  const groups = useMemo(() => {
    const now = new Date()
    return periods.map(([id, label]) => ({ id, label, items: visible.filter((item) => periodOf(item.createdAt, now) === id) })).filter((group) => group.items.length)
  }, [visible])

  const header = (
    <AppBar
      title="Notificações"
      back={() => (window.history.length > 1 ? navigate(-1) : navigate('/app'))}
      actions={user?.emailVerified ? <>
        <button type="button" className="hero-icon" aria-label="Marcar todas como lidas" title="Marcar todas como lidas" disabled={!unread} onClick={() => void markAll()}><CheckCheck size={20} /></button>
        <Link className="hero-icon" to="/app/notifications/preferencias" aria-label="Configurações de notificações" title="Configurações de notificações"><Settings size={20} /></Link>
      </> : null}
    />
  )
  if (!user?.emailVerified)
    return (
      <div className="notification-center">
        {header}
        <SheetBody>
          <div className="soft-empty">
            <Bell size={28} aria-hidden="true" />
            <h2 className="soft-empty__title">Entre para ver suas notificações</h2>
            <p>Mensagens dos clubes, respostas, convites e encontros aparecem aqui.</p>
            <Link className="pill-button pill-button--solid" to="/account">Entrar</Link>
          </div>
        </SheetBody>
      </div>
    )
  return (
    <div className="notification-center">
      {header}
      <SheetBody>
        <div className="notif-toolbar">
          <div className="pill-tabs" role="group" aria-label="Filtrar notificações">
            <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Todas</button>
            <button type="button" aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')}>Não lidas{unread ? ` (${unread > 99 ? '99+' : unread})` : ''}</button>
          </div>
          {unread > 0 && <button type="button" className="notif-toolbar__all" onClick={() => void markAll()}>Marcar todas como lidas</button>}
        </div>
        <PushInvite />
        {notice && <p className="toast-status notif-feedback" role="status">{notice}</p>}
        {status === 'error' && !items && (
          <div role="alert" className="access-error">
            {error}
            <button type="button" onClick={() => void notifications.load(true)}>Tentar novamente</button>
          </div>
        )}
        {(status === 'loading' || status === 'idle') && !items && <NoticeSkeleton />}
        {items && !visible.length && (
          filter === 'unread' && items.length ? (
            <div className="soft-empty">
              <CheckCheck size={28} aria-hidden="true" />
              <h2 className="soft-empty__title">Você está em dia</h2>
              <p>Nenhuma notificação por ler.</p>
              <button type="button" className="pill-button" onClick={() => setFilter('all')}>Ver todas</button>
            </div>
          ) : (
            <div className="soft-empty">
              <BellRing size={28} aria-hidden="true" />
              <h2 className="soft-empty__title">Nada por aqui ainda</h2>
              <p>Quando alguém falar com você, publicar nos seus clubes ou marcar um encontro, o aviso aparece aqui.</p>
            </div>
          )
        )}
        {groups.map((group) => (
          <section key={group.id} className="notif-group" aria-labelledby={`notificacoes-${group.id}`}>
            <h2 id={`notificacoes-${group.id}`} className="notif-group__title">{group.label}</h2>
            <ol className="notif-list">
              {group.items.map((item) => (
                <NoticeRow key={item.id} notice={item} busy={busy === item.id} onOpen={openRow} onChanged={setNotice} />
              ))}
            </ol>
          </section>
        ))}
        {error && items && <p className="access-error" role="alert">{error}</p>}
        {nextCursor && (
          <div className="library-add" ref={sentinel}>
            <button type="button" className="pill-button" disabled={loadingMore} aria-busy={loadingMore} onClick={() => void notifications.loadMore()}>Notificações anteriores</button>
          </div>
        )}
        {items && !nextCursor && items.length > 0 && <p className="notif-end">Guardamos as notificações dos últimos 90 dias.</p>}
      </SheetBody>
    </div>
  )
}

const NoticeRow = memo(function NoticeRow({ notice, busy, onOpen, onChanged }: { notice: Notification; busy: boolean; onOpen: (notice: Notification) => void; onChanged: (message: string) => void }) {
  const { user } = useAuth()
  const { refresh, setScope } = useWorkspace()
  const navigate = useNavigate()
  const [answering, setAnswering] = useState(false)
  const { text, tone, system } = describe(notice)
  const Icon = toneIcon[tone]
  const unread = !notice.readAt
  async function answer(accept: boolean) {
    if (!user) return
    setAnswering(true)
    try {
      if (accept) {
        const club = await apiRequest<{ id: string }>(user, `/me/invitations/${notice.targetId}/accept`, 'POST', {})
        await notifications.markRead(notice.id).catch(() => undefined)
        notificationChanged()
        await refresh()
        setScope(club.id)
        navigate('/app')
      } else {
        await apiRequest(user, `/me/invitations/${notice.targetId}/decline`, 'POST', {})
        notifications.forget(notice.id)
        notificationChanged()
        onChanged('Convite recusado.')
      }
    } catch (err) {
      onChanged(readableError(err))
    } finally {
      setAnswering(false)
    }
  }
  return (
    <li className={`notif ${unread ? 'is-unread' : ''}`}>
      <button type="button" className="notif__open" onClick={() => onOpen(notice)} disabled={busy} aria-busy={busy}
        aria-label={`${system ? text : `${notice.actorName} ${text}`}${notice.clubName ? `, ${notice.clubName}` : ''}, ${timeLabel(notice.createdAt)}${unread ? ', não lida' : ''}`}>
        <span className={`notif__avatar notif__avatar--${tone}`} aria-hidden="true">
          {system ? <span className="notif__glyph"><Icon size={20} /></span> : <UserAvatar name={notice.actorName} avatarId={notice.actorAvatarId} size="md" />}
          {!system && <span className="notif__badge"><Icon size={11} strokeWidth={2.4} /></span>}
        </span>
        <span className="notif__body" aria-hidden="true">
          <span className="notif__text">{system ? <strong>{text}</strong> : <><strong>{notice.actorName}</strong> {text}</>}</span>
          <span className="notif__meta">{notice.clubName && <span className="notif__club">{notice.clubName}</span>}<time dateTime={notice.createdAt}>{timeLabel(notice.createdAt)}</time></span>
        </span>
        {unread && <span className="notif__dot" aria-hidden="true" />}
      </button>
      {notice.targetType === 'invite' && (
        <div className="notif__actions">
          <button type="button" className="pill-button pill-button--solid" disabled={answering} aria-busy={answering} onClick={() => void answer(true)}>Aceitar</button>
          <button type="button" className="pill-button" disabled={answering} onClick={() => void answer(false)}>Recusar</button>
        </div>
      )}
    </li>
  )
})

function NoticeSkeleton() {
  return (
    <div className="notif-skeleton" aria-label="Carregando notificações" role="status">
      {[0, 1, 2, 3, 4].map((key) => (
        <span key={key} className="notif-skeleton__row" aria-hidden="true">
          <span className="skeleton notif-skeleton__avatar" />
          <span className="notif-skeleton__lines"><span className="skeleton" /><span className="skeleton" /></span>
        </span>
      ))}
    </div>
  )
}

/** Convite contextual para o push: só na central, só se o aparelho permite e só até a pessoa responder. */
function PushInvite() {
  const { user } = useAuth()
  const push = usePush()
  const [hidden, setHidden] = useState(() => (user ? pushInviteDismissed(user.uid) : true))
  if (hidden || !user || push.status !== 'off' || push.permission !== 'default') return null
  return (
    <aside className="push-invite" aria-labelledby="push-invite-title">
      <span className="push-invite__icon" aria-hidden="true"><BellRing size={20} /></span>
      <span className="push-invite__text">
        <strong id="push-invite-title">Ative as notificações</strong>
        <small>Receba avisos quando houver mensagens nos seus clubes, novas publicações e destaques da comunidade.</small>
      </span>
      <span className="push-invite__actions">
        <button type="button" className="pill-button pill-button--solid" disabled={push.busy} aria-busy={push.busy} onClick={() => void push.enable()}>Ativar notificações</button>
        <button type="button" className="pill-button pill-button--ghost" onClick={() => { dismissPushInvite(user.uid); setHidden(true) }}>Agora não</button>
      </span>
      {push.error && <small role="alert" className="push-invite__error">{push.error}</small>}
    </aside>
  )
}
