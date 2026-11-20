import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import { destinationFor } from './destination'
import { notificationChanged, notifications } from './store'
import type { Notification } from './types'

/** Abre o destino de uma notificação: confere se ainda existe, marca como lida e navega para o conteúdo. */
export function useOpenNotification() {
  const { setScope, scope } = useWorkspace()
  const navigate = useNavigate()
  return async (notice: Pick<Notification, 'id'> & Partial<Notification>): Promise<'opened' | 'gone' | 'no-destination'> => {
    const current = await notifications.verify(notice.id)
    if (!current) return 'gone'
    const destination = destinationFor({ ...(notice as Notification), ...current })
    void notifications.markRead(notice.id).then(notificationChanged).catch(() => undefined)
    if (!destination) return 'no-destination'
    if (destination.scope && destination.scope !== scope) setScope(destination.scope)
    navigate(destination.path)
    return 'opened'
  }
}
