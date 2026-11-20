/* Push only: never cache pages, authenticated responses or user files. */
const uuid = /^[0-9a-f-]{36}$/i
self.addEventListener('push', event => {
  let id = ''
  try { const value = event.data?.json(); if (uuid.test(value?.notificationId ?? '')) id = value.notificationId } catch {}
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clients) client.postMessage({ type: 'notifications-changed' })
    // App aberto e em uso: o aviso aparece dentro do app (banner e sino), sem repetir no sistema.
    // O Safari exige um aviso visível para cada push, então lá ele sempre aparece.
    const safari = /Safari/.test(self.navigator.userAgent) && !/Chrome|Chromium|Edg|Firefox/.test(self.navigator.userAgent)
    if (!safari && clients.some(client => client.focused && client.visibilityState === 'visible')) return
    await self.registration.showNotification('Clubes de leitura', {
      body: 'Você tem uma nova atividade. Abra o aplicativo para ver.',
      icon: '/icon.svg', badge: '/icon.svg', tag: id ? 'activity:' + id : 'activity',
      data: { notificationId: id }, renotify: false,
    })
  })())
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const id = event.notification.data?.notificationId
  // Abre a notificação certa; sem sessão, o app pede login e volta para este mesmo destino.
  const url = new URL('/#/app/notifications' + (uuid.test(id ?? '') ? '?open=' + id : ''), self.location.origin).href
  event.waitUntil((async () => {
    for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.focus()
        return client.navigate ? client.navigate(url).catch(() => client.postMessage({ type: 'open-notification', url })) : undefined
      }
    }
    return self.clients.openWindow(url)
  })())
})
