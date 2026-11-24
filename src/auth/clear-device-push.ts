import type { User } from 'firebase/auth'
import { authenticatedResponse } from './api'

export function clearDevicePush(user: User) {
  if (!navigator.serviceWorker) return undefined
  return (async () => {
    const registration = await navigator.serviceWorker.getRegistration('/')
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) return
    // Clearing the browser endpoint also stops delivery when logout happens offline.
    await Promise.allSettled([
      subscription.unsubscribe(),
      authenticatedResponse(user, '/me/push/subscriptions', 'DELETE', { endpoint: subscription.endpoint }, AbortSignal.timeout(2500)),
    ])
  })()
}
