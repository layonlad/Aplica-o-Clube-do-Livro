import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { notifications, useUnreadCount } from '../notifications/store'
export { notificationChanged, useUnreadCount } from '../notifications/store'

/** Liga o serviço único de notificações à conta atual (troca de conta e saída zeram tudo). */
export function UnreadProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  useEffect(() => { notifications.setUser(user) }, [user?.uid, user?.emailVerified])
  useEffect(() => notifications.retain(), [])
  return <>{children}</>
}

export function NotificationBell() {
  const { user } = useAuth(),
    count = useUnreadCount()
  if (!user?.emailVerified) return null
  return (
    <Link className="icon-button notification-bell" to="/app/notifications" aria-label={count ? `Notificações: ${count} não lidas` : 'Notificações'}>
      <Bell size={21} />
      {count > 0 && (
        <span aria-hidden="true" className="notification-badge">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
