import { StrictMode } from 'react'
import { MotionConfig } from 'framer-motion'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { isStaging } from './app/release'
import { App } from './app/App'
import { ThemeProvider } from './app/ThemeProvider'
import { BookOpening } from './app/BookOpening'
import { ShelfBackdrop } from './app/ShelfBackdrop'
import '@fontsource-variable/inter/index.css'
import '@fontsource-variable/fraunces/opsz.css'
import '@fontsource-variable/fraunces/wght-italic.css'
import './design/tokens.css'
import './design/base.css'
import './design/components.css'
import './design/coral.css'
import './design/shell.css'
import './design/motion.css'
import './design/ornaments.css'
import './design/personalization.css'
import './styles.css'

if (isStaging) document.title = 'Staging · ' + document.title

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <MotionConfig reducedMotion="user">
        <ThemeProvider><ShelfBackdrop /><App />{import.meta.env.VITE_APP_MODE !== 'connected' && <BookOpening />}</ThemeProvider>
      </MotionConfig>
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
