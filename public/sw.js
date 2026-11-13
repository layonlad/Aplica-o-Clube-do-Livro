const CACHE = 'clube-aurora-demo-v2'
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith('clube-aurora-') && key !== CACHE).map((key) => caches.delete(key))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  const scope = new URL(self.registration.scope)
  const path = url.pathname.slice(scope.pathname.length)
  // Only known public assets are eligible; all API/auth traffic bypasses the worker.
  if (event.request.method !== 'GET' || event.request.headers.has('Authorization') || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname) || url.search) return
  const asset = /^(assets\/[^/]+\.(js|css)|icon\.svg|manifest\.webmanifest)$/.test(path)
  const navigation = event.request.mode === 'navigate' && (path === '' || path === 'index.html')
  if (!asset && !navigation) return
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok && !/no-store|private/i.test(response.headers.get('Cache-Control') || '')) {
      const copy = response.clone()
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)))
    }
    return response
  }).catch(async () => (await caches.match(event.request)) || (navigation ? await caches.match('./index.html') : undefined) || Response.error()))
})
