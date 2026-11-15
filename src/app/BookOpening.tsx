import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import './book-opening.css'

export const INTRO_KEY = 'clube-livro-intro-seen'

type Variant = 'full' | 'lite' | 'still'

/** Decide se e como a abertura aparece. Exportado para testes. */
export function introVariant(env: {
  seen: boolean
  reducedMotion: boolean
  cores?: number
  saveData?: boolean
}): Variant | null {
  if (env.seen) return null
  if (env.reducedMotion) return 'still'
  if (env.saveData || (env.cores !== undefined && env.cores <= 2)) return 'lite'
  return 'full'
}

/**
 * Duração de cada variante (ms) até a interface ficar livre.
 * Fica abaixo de 5 s: movimento automático mais longo exigiria um controle de pausa (WCAG 2.2.2).
 */
export const introDuration: Record<Variant, number> = { full: 4800, lite: 2800, still: 900 }

/**
 * Quanto a página da direita precisa crescer para cobrir a tela inteira (com folga para as bordas).
 * `width` e `height` são as medidas de uma página. Exportado para testes.
 */
export function introZoom(page: { width: number; height: number }, viewport: { width: number; height: number }) {
  if (!page.width || !page.height) return 6
  const cover = Math.max(viewport.width / page.width, viewport.height / page.height)
  return Math.max(1.5, Math.round(cover * 1.12 * 100) / 100)
}

function initialVariant(): Variant | null {
  try {
    const seen = sessionStorage.getItem(INTRO_KEY) === '1'
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    return introVariant({
      seen,
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
      cores: navigator.hardwareConcurrency,
      saveData: connection?.saveData,
    })
  } catch {
    return null
  }
}

/**
 * Abertura do app: um livro grande surge, abre a capa devagar, folheia algumas páginas, mostra o nome
 * do Clube do Livro e então a câmera entra na página até o papel tomar a tela inteira e virar o app.
 * Aparece uma vez por sessão do navegador, por cima do app (que carrega por baixo ao mesmo tempo),
 * e dura cerca de 4,8 s. Não tem botão de pular; Esc encerra para quem navega pelo teclado.
 * Só usa transform/opacity (CSS 3D).
 */
export function BookOpening() {
  const [variant] = useState(initialVariant)
  const [leaving, setLeaving] = useState(false)
  const [done, setDone] = useState(variant === null)
  const root = useRef<HTMLDivElement>(null)
  const book = useRef<HTMLDivElement>(null)

  const finish = useCallback(() => {
    setLeaving(true)
    window.setTimeout(() => setDone(true), 320)
  }, [])

  // Mede o livro antes do primeiro desenho para o zoom final cobrir exatamente esta tela.
  useLayoutEffect(() => {
    if (!variant || !root.current || !book.current) return
    const zoom = introZoom(
      { width: book.current.offsetWidth, height: book.current.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    )
    root.current.style.setProperty('--zoom', String(zoom))
  }, [variant])

  useEffect(() => {
    if (!variant) return
    try {
      sessionStorage.setItem(INTRO_KEY, '1')
    } catch {
      /* sem armazenamento: a abertura simplesmente não se repete nesta aba */
    }
    const timer = window.setTimeout(() => setDone(true), introDuration[variant])
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('keydown', onKey)
    }
  }, [variant, finish])

  if (done || !variant) return null
  return (
    <div
      ref={root}
      className={`book-intro book-intro--${variant} ${leaving ? 'is-leaving' : ''}`}
      aria-hidden="true"
      data-testid="book-intro"
    >
      <div className="book-intro__stage">
        <div className="book-intro__book" ref={book}>
          <div className="book-intro__page book-intro__page--left">
            <span className="book-intro__lines" />
          </div>
          <div className="book-intro__page book-intro__page--right">
            <div className="book-intro__title">
              <span className="book-intro__mark">CL</span>
              <strong>Clube do Livro</strong>
              <em>Leituras que aproximam</em>
              <span className="book-intro__spines" />
            </div>
          </div>
          {variant === 'full' && (
            <>
              <div className="book-intro__leaf book-intro__leaf--1" />
              <div className="book-intro__leaf book-intro__leaf--2" />
              <div className="book-intro__leaf book-intro__leaf--3" />
            </>
          )}
          <div className="book-intro__cover">
            <div className="book-intro__cover-front">
              <span className="book-intro__ribbon" />
              <span className="book-intro__emboss">CL</span>
            </div>
            <div className="book-intro__cover-back" />
          </div>
          {variant === 'full' && (
            <>
              <span className="book-intro__bird book-intro__bird--1" />
              <span className="book-intro__bird book-intro__bird--2" />
              <span className="book-intro__bird book-intro__bird--3" />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
