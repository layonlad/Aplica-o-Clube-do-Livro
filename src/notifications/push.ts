import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, readableError } from '../auth/api'

/**
 * Push do aparelho (Web Push com chave VAPID da API). Funciona em Chrome/Edge/Firefox no computador e no Android,
 * e no iPhone/iPad (iOS 16.4+) só com o app adicionado à Tela de Início. Não há app nativo: nada aqui usa APNs/FCM nativo.
 */
export function pushSupport() {
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const installed =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone
  if (ios && !installed)
    return {
      available: false,
      ios: true,
      reason: 'No iPhone, adicione o aplicativo à Tela de Início e abra por lá para ativar os avisos.',
    }
  return {
    available: window.isSecureContext && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window,
    ios,
    reason: 'Este navegador não oferece notificações push. Os avisos continuam na central do aplicativo.',
  }
}

const keyBytes = (key: string) =>
  Uint8Array.from(atob(key.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(key.length / 4) * 4, '=')), (c) => c.charCodeAt(0))

export type PushStatus = 'unsupported' | 'unavailable' | 'denied' | 'off' | 'on' | 'loading'

/** Estado e ações do push neste aparelho: ativar (registerPushToken) e desativar (unregisterPushToken). */
export function usePush() {
  const { user } = useAuth()
  const [config, setConfig] = useState<{ enabled: boolean; publicKey: string | null } | null>(null)
  const [permission, setPermission] = useState<NotificationPermission | 'unavailable'>(() =>
    'Notification' in window ? Notification.permission : 'unavailable',
  )
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [checked, setChecked] = useState(false)
  const support = pushSupport()

  useEffect(() => {
    if (!user?.emailVerified) return
    let live = true
    setChecked(false)
    apiRequest<{ enabled: boolean; publicKey: string | null }>(user, '/me/push/config')
      .then((value) => live && setConfig(value))
      .catch((err) => live && setError(readableError(err)))
    if (support.available)
      void navigator.serviceWorker
        .getRegistration('/')
        .then(async (registration) => {
          const subscription = await registration?.pushManager.getSubscription()
          if (subscription) {
            const status = await apiRequest<{ enabled: boolean }>(user, '/me/push/status', 'POST', { endpoint: subscription.endpoint })
            if (live) setEnabled(status.enabled)
          } else if (live) setEnabled(false)
        })
        .catch(() => {})
        .finally(() => live && setChecked(true))
    else setChecked(true)
    const refresh = () => setPermission('Notification' in window ? Notification.permission : 'unavailable')
    window.addEventListener('focus', refresh)
    return () => {
      live = false
      window.removeEventListener('focus', refresh)
    }
  }, [user?.uid, user?.emailVerified, support.available])

  async function enable() {
    if (!user || !config?.publicKey) return
    setBusy(true)
    setError('')
    // O pedido de permissão sai direto do toque, antes de qualquer espera de rede (exigência do Safari).
    const decision = permission === 'default' ? Notification.requestPermission() : Promise.resolve(Notification.permission)
    let created: PushSubscription | undefined
    try {
      const result = await decision
      setPermission(result)
      if (result !== 'granted') return
      const registration = await navigator.serviceWorker.register('/push-sw.js', { scope: '/', updateViaCache: 'none' })
      if (!registration.active) await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        const status = await apiRequest<{ enabled: boolean }>(user, '/me/push/status', 'POST', { endpoint: subscription.endpoint })
        // Endereço novo para não herdar o registro de outra conta no mesmo navegador.
        if (!status.enabled) {
          await subscription.unsubscribe()
          subscription = null
        }
      }
      subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(config.publicKey) })
      created = subscription
      await apiRequest(user, '/me/push/subscriptions', 'POST', subscription.toJSON())
      setEnabled(true)
    } catch (err) {
      if (created) await created.unsubscribe().catch(() => {})
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }
  async function disable() {
    if (!user) return
    setBusy(true)
    setError('')
    try {
      const registration = await navigator.serviceWorker.getRegistration('/'),
        subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        await apiRequest(user, '/me/push/subscriptions', 'DELETE', { endpoint: subscription.endpoint })
        await subscription.unsubscribe()
      }
      setEnabled(false)
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }
  const status: PushStatus = !support.available
    ? 'unsupported'
    : !checked || !config
      ? 'loading'
      : !config.enabled
        ? 'unavailable'
        : permission === 'denied'
          ? 'denied'
          : enabled && permission === 'granted'
            ? 'on'
            : 'off'
  return { support, config, permission, enabled, busy, error, status, enable, disable }
}

const ASK_KEY = 'clube-livro-push-convite'
/** O convite para ativar o push só reaparece 30 dias depois de "Agora não". */
export function pushInviteDismissed(uid: string) {
  try {
    const value = Number(localStorage.getItem(`${ASK_KEY}:${uid}`))
    return Number.isFinite(value) && Date.now() - value < 30 * 86400000
  } catch {
    return false
  }
}
export function dismissPushInvite(uid: string) {
  try { localStorage.setItem(`${ASK_KEY}:${uid}`, String(Date.now())) } catch { /* sem armazenamento: volta a aparecer na próxima visita */ }
}
