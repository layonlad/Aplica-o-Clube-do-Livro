import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { App } from './app/App'
import { ThemeProvider } from './app/ThemeProvider'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ThemeProvider><App /></ThemeProvider>
    </HashRouter>
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  if (import.meta.env.VITE_APP_MODE === 'connected') {
    const scope = new URL(import.meta.env.BASE_URL, window.location.href).href
    void navigator.serviceWorker.getRegistrations().then((items) => Promise.all(items.filter((item) => item.scope === scope).map((item) => item.unregister())))
    if ('caches' in window) void caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('clube-aurora-')).map((key) => caches.delete(key))))
  } else {
    window.addEventListener('load', () => { void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}) })
  }
}
