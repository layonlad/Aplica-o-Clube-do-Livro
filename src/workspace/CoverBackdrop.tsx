import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useTheme } from '../app/ThemeProvider'
import { contrast, ensureContrast } from '../app/appearance'
import { useWorkspace } from './WorkspaceProvider'
import { BOOK_FILES_EVENT, bookCoverBlob } from './book-files'

/**
 * Cor dominante de uma capa, ignorando tons quase brancos, quase pretos e acinzentados,
 * para o app "vestir" a história. Exportada para testes.
 */
export function dominantColor(pixels: Uint8ClampedArray) {
  const buckets = new Map<string, { r: number; g: number; b: number; weight: number }>()
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b, a] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]]
    if (a < 200) continue
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b)
    const saturation = max === 0 ? 0 : (max - min) / max
    if (max < 40 || min > 225 || saturation < 0.18) continue
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, weight: 0 }
    const weight = 0.5 + saturation
    bucket.r += r * weight
    bucket.g += g * weight
    bucket.b += b * weight
    bucket.weight += weight
    buckets.set(key, bucket)
  }
  const best = [...buckets.values()].sort((a, b) => b.weight - a.weight)[0]
  if (!best) return null
  return (
    '#' +
    [best.r, best.g, best.b]
      .map((value) => Math.round(value / best.weight).toString(16).padStart(2, '0'))
      .join('')
  )
}

async function coverColor(blob: Blob) {
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 48
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(bitmap, 0, 0, 32, 48)
  bitmap.close?.()
  return dominantColor(context.getImageData(0, 0, 32, 48).data)
}

export const LAST_BOOK_KEY = 'clube-livro-last-book'

/** Guarda o último livro aberto no leitor (é a capa dele que vira fundo). */
export function rememberOpenedBook(bookId: string, uid?: string) {
  try {
    localStorage.setItem(LAST_BOOK_KEY + ':' + (uid ?? 'visitor'), bookId)
  } catch {
    /* sem armazenamento: o fundo usa a leitura em destaque */
  }
}
function lastOpenedBook(uid?: string) {
  try {
    return localStorage.getItem(LAST_BOOK_KEY + ':' + (uid ?? 'visitor'))
  } catch {
    return null
  }
}

const STYLE_KEYS = [
  '--shelf-image',
  '--shelf-size',
  '--shelf-repeat',
  '--shelf-blur',
  '--veil-tint',
  '--accent',
  '--accent-ink',
  '--accent-soft',
] as const

/**
 * Com "Capa como fundo" ligado (Biblioteca), troca a estante do fundo pela capa do livro em leitura
 * e adota a cor principal dessa capa nos destaques. Textos continuam com contraste AA.
 */
export function CoverBackdrop() {
  const { user } = useAuth()
  const { appearance } = useTheme()
  const { snapshot, scope } = useWorkspace()
  const { pathname } = useLocation()
  const enabled = !!appearance.coverBackdrop && scope === 'personal'
  const state = snapshot?.state
  const reading = snapshot?.reading
  // O livro aberto no leitor; senão o último aberto; senão o que o Início mostra em "Continue sua leitura".
  const opened = /^\/app\/reader\/([^/]+)/.exec(pathname)?.[1] ?? lastOpenedBook(user?.uid)
  const current = state
    ? (state.books.find((book) => book.id === opened) ??
      state.books.find((book) => book.id === state.currentBookId) ??
      state.books.find((book) => (reading?.[book.id]?.percent ?? 0) < 100))
    : undefined
  const bookId = current?.id
  useLayoutEffect(() => {
    const body = document.body
    const clear = () => {
      for (const key of STYLE_KEYS) body.style.removeProperty(key)
      delete document.documentElement.dataset.coverBackdrop
    }
    if (!enabled || !bookId) {
      clear()
      return
    }
    let live = true,
      href = '',
      revision = 0
    const controller = new AbortController()
    const apply = async () => {
      const mine = ++revision
      const cover = await bookCoverBlob(user, bookId, controller.signal).catch(() => undefined)
      if (!live || mine !== revision || !cover) return
      if (href) URL.revokeObjectURL(href)
      href = URL.createObjectURL(cover)
      body.style.setProperty('--shelf-image', `url("${href}")`)
      body.style.setProperty('--shelf-size', 'cover')
      body.style.setProperty('--shelf-repeat', 'no-repeat')
      body.style.setProperty('--shelf-blur', '14px')
      document.documentElement.dataset.coverBackdrop = 'on'
      const color = await coverColor(cover).catch(() => null)
      if (!live || mine !== revision || !color) return
      const background =
        getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#fbf4e8'
      const bg = /^#[0-9a-f]{6}$/i.test(background) ? background : '#fbf4e8'
      // Preenchimentos (barra de progresso, chips) usam a cor da capa; textos, uma versão legível dela.
      body.style.setProperty('--veil-tint', color)
      body.style.setProperty('--accent', color)
      body.style.setProperty('--accent-ink', ensureContrast(color, bg).color)
      body.style.setProperty(
        '--accent-soft',
        `color-mix(in srgb, ${color} ${contrast('#ffffff', bg) > 4.5 ? 22 : 14}%, var(--surface))`,
      )
    }
    void apply()
    const refresh = () => void apply()
    window.addEventListener(BOOK_FILES_EVENT, refresh)
    window.addEventListener('clube-epub-saved', refresh)
    return () => {
      live = false
      controller.abort()
      window.removeEventListener(BOOK_FILES_EVENT, refresh)
      window.removeEventListener('clube-epub-saved', refresh)
      clear()
      if (href) URL.revokeObjectURL(href)
    }
  }, [enabled, bookId, user?.uid, user?.emailVerified])
  return null
}
