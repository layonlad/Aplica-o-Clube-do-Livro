import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './book-opener.css'

/**
 * Abertura de um livro da biblioteca: a capa sai do lugar onde foi tocada, vai ao centro da tela,
 * abre como um livro e a página cresce até cobrir a tela inteira (celular, tablet ou computador).
 * O leitor é montado por baixo no meio do movimento, para a troca não ter espera.
 * Com movimento reduzido, abre direto.
 */
interface Request {
  rect: DOMRect
  image: string
  title: string
  go: () => void
}

let show: ((request: Request) => void) | null = null

export function openBook(
  event: { preventDefault: () => void; currentTarget: Element },
  options: { title: string; go: () => void },
) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const cover =
    event.currentTarget.querySelector<HTMLElement>('img, .cover-art') ??
    (event.currentTarget.closest('article')?.querySelector<HTMLElement>('.library-cover') as HTMLElement | null)
  // Sem a API de animações (navegadores antigos) ou com movimento reduzido, abre direto.
  if (reduce || !show || !cover || typeof Element.prototype.animate !== 'function') return
  event.preventDefault()
  show({
    rect: cover.getBoundingClientRect(),
    image: cover instanceof HTMLImageElement ? cover.currentSrc || cover.src : '',
    title: options.title,
    go: options.go,
  })
}

/** Duração total (ms). Exportada para testes. */
export const OPEN_DURATION = 1700

export function BookOpenerLayer() {
  const [request, setRequest] = useState<Request | null>(null)
  const book = useRef<HTMLDivElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  useEffect(() => {
    show = setRequest
    return () => {
      show = null
    }
  }, [])
  useEffect(() => {
    if (!request || !book.current || !layer.current) return
    const node = book.current
    const { rect } = request
    // Tamanho do livro no centro: o maior que cabe com folga, na proporção da capa.
    const height = Math.min(window.innerHeight * 0.62, (window.innerWidth * 0.42) * 1.5)
    const width = height / 1.5
    const left = window.innerWidth / 2 - width / 2
    const top = window.innerHeight / 2 - height / 2
    Object.assign(node.style, { width: `${width}px`, height: `${height}px`, left: `${left}px`, top: `${top}px` })
    const from = `translate(${rect.left - left}px, ${rect.top - top}px) scale(${rect.width / width}, ${rect.height / height})`
    // A página da direita precisa cobrir a tela: centraliza a página e amplia.
    const cover = Math.max(window.innerWidth / width, window.innerHeight / height) * 1.08
    const ease = 'cubic-bezier(0.45, 0, 0.15, 1)'
    const animations = [
      layer.current.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1 }], {
        duration: OPEN_DURATION - 250,
        fill: 'forwards',
      }),
      node.animate(
        [
          { transform: from, offset: 0 },
          { transform: 'translate(0, 0) scale(1)', offset: 0.35, easing: ease },
          { transform: 'translate(0, 0) scale(1)', offset: 0.6, easing: 'cubic-bezier(0.55, 0, 0.2, 1)' },
          { transform: `translate(0, 0) scale(${cover})`, offset: 1 },
        ],
        { duration: OPEN_DURATION - 250, easing: 'linear', fill: 'forwards' },
      ),
      node.querySelector('.book-opener__cover')!.animate(
        [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-165deg)' }],
        { duration: 650, delay: (OPEN_DURATION - 250) * 0.3, easing: ease, fill: 'both' },
      ),
    ]
    // Monta o leitor por baixo quando a página já cobre quase tudo.
    const go = window.setTimeout(request.go, OPEN_DURATION - 450)
    const fade = window.setTimeout(() => {
      layer.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' })
    }, OPEN_DURATION - 250)
    const done = window.setTimeout(() => setRequest(null), OPEN_DURATION + 20)
    return () => {
      for (const animation of animations) animation.cancel()
      window.clearTimeout(go)
      window.clearTimeout(fade)
      window.clearTimeout(done)
    }
  }, [request])
  if (!request) return null
  return createPortal(
    <div className="book-opener" ref={layer} aria-hidden="true" data-testid="book-opener">
      <div className="book-opener__book" ref={book}>
        <div className="book-opener__page">
          <span className="book-opener__lines" />
        </div>
        <div className="book-opener__cover">
          {request.image ? (
            <img src={request.image} alt="" />
          ) : (
            <span className="book-opener__drawn">{request.title}</span>
          )}
          <span className="book-opener__inside" />
        </div>
      </div>
    </div>,
    document.body,
  )
}
