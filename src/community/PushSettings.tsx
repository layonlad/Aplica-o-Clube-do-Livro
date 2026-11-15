import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, readableError } from '../auth/api'
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
      reason:
        'No iPhone, adicione o aplicativo à Tela de Início e abra por lá para ativar os avisos.',
    }
  return {
    available:
      window.isSecureContext &&
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window,
    reason:
      'Este navegador não oferece notificações push. Os avisos continuam na central do aplicativo.',
  }
}
const keyBytes = (key: string) =>
  Uint8Array.from(
    atob(
      key
        .replaceAll('-', '+')
        .replaceAll('_', '/')
        .padEnd(Math.ceil(key.length / 4) * 4, '='),
    ),
    (c) => c.charCodeAt(0),
  )
export function PushSettings() {
  const { user } = useAuth(),
    [config, setConfig] = useState<{ enabled: boolean; publicKey: string | null } | null>(null)
  const [permission, setPermission] = useState<NotificationPermission | 'unavailable'>(() =>
    'Notification' in window ? Notification.permission : 'unavailable',
  )
  const [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const support = pushSupport()
  useEffect(() => {
    if (!user?.emailVerified) return
    let live = true
    apiRequest<{ enabled: boolean; publicKey: string | null }>(user, '/me/push/config')
      .then((value) => live && setConfig(value))
      .catch((err) => live && setError(readableError(err)))
    if (support.available)
      void navigator.serviceWorker
        .getRegistration('/')
        .then(async (registration) => {
          const subscription = await registration?.pushManager.getSubscription()
          if (subscription) {
            const status = await apiRequest<{ enabled: boolean }>(user, '/me/push/status', 'POST', {
              endpoint: subscription.endpoint,
            })
            if (live) setEnabled(status.enabled)
          }
        })
        .catch(() => {})
    const refresh = () =>
      setPermission('Notification' in window ? Notification.permission : 'unavailable')
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
    // Request permission directly in this explicit user gesture, before any network/registration await.
    const decision =
      permission === 'default'
        ? Notification.requestPermission()
        : Promise.resolve(Notification.permission)
    let created: PushSubscription | undefined
    try {
      const result = await decision
      setPermission(result)
      if (result !== 'granted') return
      const registration = await navigator.serviceWorker.register('/push-sw.js', {
        scope: '/',
        updateViaCache: 'none',
      })
      if (!registration.active) await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        const status = await apiRequest<{ enabled: boolean }>(user, '/me/push/status', 'POST', {
          endpoint: subscription.endpoint,
        })
        // A fresh endpoint prevents sharing a previous account's registration in a shared browser.
        if (!status.enabled) {
          await subscription.unsubscribe()
          subscription = null
        }
      }
      subscription ??= await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(config.publicKey),
      })
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
        await apiRequest(user, '/me/push/subscriptions', 'DELETE', {
          endpoint: subscription.endpoint,
        })
        await subscription.unsubscribe()
      }
      setEnabled(false)
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }
  const state = !support.available
    ? 'Indisponível'
    : permission === 'denied'
      ? 'Bloqueado'
      : permission === 'default'
        ? 'Não solicitado'
        : enabled
          ? 'Permitido · ativado neste aparelho'
          : 'Permitido · desativado neste aparelho'
  return (
    <section className="card push-settings">
      <h2>Receber notificações</h2>
      <p>
        Acompanhe respostas, menções e encontros mesmo com o aplicativo fechado. O conteúdo das
        conversas fica dentro do app.
      </p>
      {!user?.emailVerified ? (
        <p>
          <Link to="/account">Entre para configurar os avisos</Link>.
        </p>
      ) : (
        <>
          <label className="workspace-check">
            <input
              type="checkbox"
              checked={enabled && permission === 'granted'}
              disabled={busy || !support.available || !config?.enabled || permission === 'denied'}
              onChange={(event) => void (event.target.checked ? enable() : disable())}
            />
            Receber notificações neste aparelho
          </label>
          <p className="t-caption" role="status">
            {state}
          </p>
          {!support.available && <p>{support.reason}</p>}
          {permission === 'denied' && enabled && (
            <button
              type="button"
              className="button button--ghost"
              disabled={busy}
              onClick={() => void disable()}
            >
              Desativar neste aparelho
            </button>
          )}
          {permission === 'denied' && (
            <p>
              Permita notificações nas configurações do navegador ou do sistema e volte a esta tela.
            </p>
          )}
          {support.available && config && !config.enabled && (
            <p>
              O envio push ainda aguarda ativação. Suas notificações internas continuam disponíveis.
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <Link to="/app/notifications">Central e preferências de notificações →</Link>
        </>
      )}
    </section>
  )
}
