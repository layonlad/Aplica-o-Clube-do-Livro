import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest } from '../auth/api'
export function notificationChanged() {
  window.dispatchEvent(new Event('notifications-changed'))
}
/** Quantidade de notificações não lidas, atualizada a cada minuto e quando algo muda. */
function usePollUnreadCount() {
  const { user } = useAuth(),
    [count, setCount] = useState(0)
  useEffect(() => {
    if (!user?.emailVerified) {
      setCount(0)
      return
    }
    let live = true,
      running = false
    const refresh = async () => {
      if (document.visibilityState === 'hidden' || running) return
      running = true
      try {
        const value = await apiRequest<{ count: number }>(user, '/me/notifications/unread')
        if (live) setCount(value.count)
      } catch {
        /* The central page shows actionable connection errors. */
      } finally {
        running = false
      }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 60000)
    const message = (event: MessageEvent) => {
      if (event.data?.type === 'notifications-changed') notificationChanged()
    }
    const changed = () => void refresh()
    window.addEventListener('notifications-changed', changed)
    window.addEventListener('focus', changed)
    document.addEventListener('visibilitychange', changed)
    navigator.serviceWorker?.addEventListener('message', message)
    return () => {
      live = false
      clearInterval(timer)
      window.removeEventListener('notifications-changed', changed)
      window.removeEventListener('focus', changed)
      document.removeEventListener('visibilitychange', changed)
      navigator.serviceWorker?.removeEventListener('message', message)
    }
  }, [user?.uid, user?.emailVerified])
  return user?.emailVerified ? count : 0
}
const UnreadCount = createContext(0)

export function UnreadProvider({ children }: { children: ReactNode }) {
  return <UnreadCount.Provider value={usePollUnreadCount()}>{children}</UnreadCount.Provider>
}

export function useUnreadCount() {
  return useContext(UnreadCount)
}

export function NotificationBell() {
  const { user } = useAuth(),
    count = useUnreadCount()
  if (!user?.emailVerified) return null
  return (
    <Link
      className="icon-button notification-bell"
      to="/app/notifications"
      aria-label={count ? `Notificações: ${count} não lidas` : 'Notificações'}
    >
      <Bell size={21} />
      {count > 0 && (
        <span aria-hidden="true" className="notification-badge">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
