import { useCallback, useEffect, useRef, useState } from 'react'
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

/** Duração de cada variante (ms) até a interface ficar livre. */
export const introDuration: Record<Variant, number> = { full: 2600, lite: 1500, still: 700 }

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
 * Abertura do app: um livro surge, abre a capa, folheia algumas páginas e revela o nome do Clube do Livro.
 * Aparece uma vez por sessão do navegador, por cima do app (que carrega por baixo ao mesmo tempo),
 * dura cerca de 2,6 s e pode ser pulada a qualquer momento. Só usa CSS 3D (transform/opacity).
 */
export function BookOpening() {
  const [variant] = useState(initialVariant)
  const [leaving, setLeaving] = useState(false)
  const [done, setDone] = useState(variant === null)
  const skipRef = useRef<HTMLButtonElement>(null)

  const finish = useCallback(() => {
    setLeaving(true)
    window.setTimeout(() => setDone(true), 280)
  }, [])

  useEffect(() => {
    if (!variant) return
    try {
      sessionStorage.setItem(INTRO_KEY, '1')
    } catch {
      /* sem armazenamento: a abertura simplesmente não se repete nesta aba */
    }
    skipRef.current?.focus({ preventScroll: true })
    const timer = window.setTimeout(() => setDone(true), introDuration[variant])
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') finish()
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
      className={`book-intro book-intro--${variant} ${leaving ? 'is-leaving' : ''}`}
      onClick={finish}
      data-testid="book-intro"
    >
      <div className="book-intro__stage" aria-hidden="true">
        <div className="book-intro__book">
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
      <button
        ref={skipRef}
        type="button"
        className="book-intro__skip"
        onClick={(event) => {
          event.stopPropagation()
          finish()
        }}
      >
        Pular abertura
      </button>
    </div>
  )
}
