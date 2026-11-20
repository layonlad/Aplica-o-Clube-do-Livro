import { useEffect, useRef, useState } from 'react'
import './notifications.css'
import { AnimatePresence, motion } from 'framer-motion'
import { useLocation, useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { UserAvatar } from '../components/UserAvatar'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import { describe } from './destination'
import { useOpenNotification } from './open'
import { notifications } from './store'
import type { Notification } from './types'

const KEY = 'clube-livro-avisos-no-app'
/** Preferência deste aparelho (não da conta): mostrar ou não o aviso no topo da tela. */
export function bannersEnabled() {
  try { return localStorage.getItem(KEY) !== 'off' } catch { return true }
}
export function setBannersEnabled(on: boolean) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* sem armazenamento: segue o padrão (ligado) */ }
}

const VISIBLE_MS = 6000

/**
 * Aviso discreto no topo quando chega uma notificação com o app aberto. Nunca empilha: notificações que chegam
 * juntas viram um só aviso ("3 novidades"). Não aparece no leitor, na própria central nem para o chat que já está
 * aberto na tela (a conversa se atualiza sozinha). A central continua com o histórico completo.
 */
export function NotificationBanner() {
  const { pathname } = useLocation()
  const { scope } = useWorkspace()
  const navigate = useNavigate()
  const open = useOpenNotification()
  const [items, setItems] = useState<Notification[]>([])
  const [paused, setPaused] = useState(false)
  const where = useRef({ pathname, scope })
  where.current = { pathname, scope }

  useEffect(() => notifications.onArrival((arrived) => {
    const { pathname, scope } = where.current
    if (!bannersEnabled() || document.visibilityState !== 'visible') return
    if (pathname.startsWith('/app/reader') || pathname.startsWith('/app/notifications')) return
    const relevant = arrived.filter((item) => !(item.targetType === 'chat' && pathname === '/app/chat' && item.clubId === scope))
    if (relevant.length) setItems((current) => [...relevant, ...current].slice(0, 20))
  }), [])
  // Toque num push com o app aberto em aba que o worker não controla: ele pede para abrir aqui.
  useEffect(() => {
    const message = (event: MessageEvent) => {
      if (event.data?.type !== 'open-notification' || typeof event.data.url !== 'string') return
      const hash = new URL(event.data.url, window.location.origin).hash.slice(1)
      if (/^\/app\/notifications(\?open=[0-9a-f-]{36})?$/i.test(hash)) navigate(hash)
    }
    navigator.serviceWorker?.addEventListener('message', message)
    return () => navigator.serviceWorker?.removeEventListener('message', message)
  }, [])
  // Entrar no leitor ou na central fecha o aviso.
  useEffect(() => { if (pathname.startsWith('/app/reader') || pathname.startsWith('/app/notifications')) setItems([]) }, [pathname])
  useEffect(() => {
    if (!items.length || paused) return
    const timer = setTimeout(() => setItems([]), VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [items, paused])

  const first = items[0]
  const grouped = items.length > 1
  const info = first ? describe(first) : null
  function activate() {
    const target = items
    setItems([])
    if (target.length === 1) void open(target[0]).then((result) => { if (result !== 'opened') navigate('/app/notifications') }).catch(() => navigate('/app/notifications'))
    else navigate('/app/notifications')
  }
  return (
    <div className="notif-banner-host" aria-live="polite" aria-atomic="true">
      <AnimatePresence>
        {first && info && (
          <motion.div
            key="banner"
            className="notif-banner"
            role="status"
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -24, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.6, bottom: 0 }}
            onDragEnd={(_, gesture) => { if (gesture.offset.y < -30) setItems([]) }}
            onPointerEnter={() => setPaused(true)}
            onPointerLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
          >
            <button type="button" className="notif-banner__open" onClick={activate}>
              <UserAvatar name={first.actorName} avatarId={first.actorAvatarId} size="sm" />
              <span className="notif-banner__text">
                <strong>{grouped ? `${items.length} novidades` : info.system ? info.text : `${first.actorName} ${info.text}`}</strong>
                <small>{grouped ? `${first.actorName} e mais ${items.length - 1} · Toque para ver` : `${first.clubName ? `${first.clubName} · ` : ''}Agora`}</small>
              </span>
            </button>
            <button type="button" className="notif-banner__close" aria-label="Dispensar aviso" onClick={() => setItems([])}><X size={18} /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
