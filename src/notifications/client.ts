import type { User } from 'firebase/auth'
import { ApiError, apiRequest, authenticatedResponse } from '../auth/api'
import type {
  NotificationDevice,
  NotificationPage,
  NotificationPreferences,
  NotificationSnapshot,
  UnreadNotificationCount,
} from '../../server/src/notification-contracts'
export type * from '../../server/src/notification-contracts'

const installationKey = (user: User) => 'notification-device:' + user.uid
export function unlinkPushOnLogout(user: User) {
  let id: string | null
  try {
    id = localStorage.getItem(installationKey(user))
  } catch {
    return
  }
  if (!id) return
  return authenticatedResponse(
    user,
    '/me/push/devices/' + encodeURIComponent(id),
    'DELETE',
    undefined,
    AbortSignal.timeout(3000),
  ).then(() => localStorage.removeItem(installationKey(user)))
}

/** Share one client per signed-in session. Unsubscribing the last observer closes the request. */
export function notificationClient(user: User) {
  const request = <T>(path: string, method = 'GET', body?: unknown) =>
    apiRequest<T>(user, path, method, body)
  const observers = new Set<(snapshot: NotificationSnapshot) => void>()
  let controller: AbortController | undefined,
    latest: NotificationSnapshot | undefined
  async function observe(signal: AbortSignal) {
    let delay = 1000
    while (!signal.aborted) {
      try {
        const response = await authenticatedResponse(
          user,
          '/me/notifications/sync' +
            (latest ? '?revision=' + latest.revision : ''),
          'GET',
          undefined,
          signal,
        )
        const next = (await response.json()) as NotificationSnapshot
        if (signal.aborted) return
        if (next.revision !== latest?.revision) {
          latest = next
          for (const notify of observers) notify(next)
        }
        delay = next.retryAfterMs ?? 2000
      } catch (error) {
        if (
          signal.aborted ||
          (error instanceof ApiError && [401, 403].includes(error.status))
        )
          return
        delay = Math.min(30000, delay * 2)
      }
      await new Promise<void>((done) => {
        const finish = () => {
          clearTimeout(timer)
          signal.removeEventListener('abort', finish)
          done()
        }
        const timer = setTimeout(finish, delay)
        signal.addEventListener('abort', finish, { once: true })
      })
    }
  }
  function subscribe(callback: (snapshot: NotificationSnapshot) => void) {
    observers.add(callback)
    if (latest) callback(latest)
    if (!controller) {
      controller = new AbortController()
      void observe(controller.signal)
    }
    return () => {
      observers.delete(callback)
      if (!observers.size) {
        controller?.abort()
        controller = undefined
        latest = undefined
      }
    }
  }
  return {
    subscribeToNotifications: (cb: (page: NotificationPage) => void) =>
      subscribe((s) => cb(s.page)),
    subscribeToUnreadCount: (cb: (value: UnreadNotificationCount) => void) =>
      subscribe((s) => cb(s.unread)),
    listNotifications: (cursor?: string, limit = 20) =>
      request<NotificationPage>(
        '/me/notifications?' +
          new URLSearchParams({
            limit: String(limit),
            ...(cursor ? { cursor } : {}),
          }),
      ),
    markNotificationAsRead: (id: string) =>
      request('/me/notifications/read', 'POST', { id }),
    markAllNotificationsAsRead: () =>
      request('/me/notifications/read', 'POST', {}),
    getNotificationPreferences: () =>
      request<NotificationPreferences>('/me/notification-settings'),
    updateNotificationPreferences: (patch: Partial<NotificationPreferences>) =>
      request<NotificationPreferences>(
        '/me/notification-settings',
        'POST',
        patch,
      ),
    registerPushToken: async (
      token: string,
      platform: NotificationDevice['platform'],
      installationId: string,
      previousWebEndpoint?: string,
    ) => {
      const device = await request<NotificationDevice>(
        '/me/push/devices',
        'POST',
        { token, platform, installationId, previousWebEndpoint },
      )
      localStorage.setItem(installationKey(user), device.id)
      return device
    },
    unregisterPushToken: async (token: string) => {
      await request('/me/push/devices', 'DELETE', { token })
    },
  }
}
