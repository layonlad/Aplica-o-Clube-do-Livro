import { AnimatePresence, motion } from 'framer-motion'
import { Star } from 'lucide-react'
import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { useReaderChrome } from './ImmersiveReader'
import { readingGesture, type ReadingGesture } from './reader-gestures'
import type { ReadingPage } from './reading-layout'
import { ease } from '../design/motion'

/**
 * Versão em texto do livro, em tela cheia.
 * Páginas: arraste para o lado (ou toque nas bordas) e a página passa.
 * Rolagem: o capítulo inteiro numa coluna; a posição é salva quando a rolagem para.
 * Toque no meio da tela mostra ou esconde os controles.
 */
export function TextPages({
  pages,
  page,
  busy,
  paged,
  edgeTaps,
  animate,
  chapterTitle,
  renderRange,
  articleRef,
  onSelect,
  onTurn,
  style,
}: {
  pages: ReadingPage[]
  page: number
  busy: boolean
  paged: boolean
  edgeTaps: boolean
  animate: boolean
  chapterTitle: (index: number) => string
  renderRange: (from: number, to: number) => ReactNode[]
  articleRef: RefObject<HTMLElement | null>
  onSelect: () => void
  onTurn: (next: number) => void
  style: CSSProperties
}) {
  const chrome = useReaderChrome()
  const gesture = useRef<ReadingGesture | null>(null)
  const direction = useRef(1)
  const scroller = useRef<HTMLDivElement>(null)
  const fromScroll = useRef(false)
  const current = pages[page]
  const chapter = current?.chapter ?? 0
  const chapterPages = pages
    .map((item, index) => ({ ...item, index }))
    .filter((item) => item.chapter === chapter)
  const firstOfChapter = chapterPages[0]?.index ?? 0
  const lastOfChapter = chapterPages.at(-1)?.index ?? 0

  function go(next: number) {
    if (next < 0 || next >= pages.length || next === page) return
    direction.current = next > page ? 1 : -1
    onTurn(next)
  }

  // Rolagem: ao escolher um capítulo ou trecho no painel, leva a página até o topo.
  useEffect(() => {
    if (paged) return
    if (fromScroll.current) {
      fromScroll.current = false
      return
    }
    scroller.current
      ?.querySelector<HTMLElement>(`[data-page="${page}"]`)
      ?.scrollIntoView({ block: 'start' })
  }, [page, paged])

  // Rolagem: salva a página que está no topo quando a pessoa para de rolar.
  useEffect(() => {
    if (paged) return
    const box = scroller.current
    if (!box) return
    let timer = 0
    const onScroll = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const top = box.getBoundingClientRect().top
        const blocks = Array.from(box.querySelectorAll<HTMLElement>('[data-page]'))
        const visible = blocks.find((block) => block.getBoundingClientRect().bottom > top + 40)
        const index = visible ? Number(visible.dataset.page) : page
        if (index !== page) {
          fromScroll.current = true
          onTurn(index)
        }
      }, 700)
    }
    box.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.clearTimeout(timer)
      box.removeEventListener('scroll', onScroll)
    }
  }, [paged, page, onTurn])

  const pointer = {
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      if (
        !event.isPrimary ||
        (event.target instanceof Element && event.target.closest('a,button,input,select,textarea'))
      ) {
        gesture.current = null
        return
      }
      const rect = event.currentTarget.getBoundingClientRect()
      gesture.current = {
        x: event.clientX - rect.left,
        y: event.clientY,
        at: performance.now(),
        width: rect.width,
      }
    },
    onPointerCancel: () => {
      gesture.current = null
    },
    onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => {
      const start = gesture.current
      gesture.current = null
      if (!start || window.getSelection()?.isCollapsed === false) return
      const action = readingGesture(
        start,
        {
          x: event.clientX - event.currentTarget.getBoundingClientRect().left,
          y: event.clientY,
          at: performance.now(),
        },
        paged && edgeTaps && event.pointerType !== 'mouse',
      )
      if (action === 'controls') chrome?.setControls(!chrome.controls)
      else if (paged && action) go(page + (action === 'next' ? 1 : -1))
    },
  }

  if (!paged)
    return (
      <div
        ref={scroller}
        className="text-scroll-viewport"
        {...pointer}
        tabIndex={0}
        role="region"
        aria-label="Texto do livro"
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || event.key !== 'Enter') return
          event.preventDefault()
          chrome?.setControls(!chrome.controls)
        }}
      >
        <article
          ref={articleRef as RefObject<HTMLElement>}
          className="reader-prose text-prose"
          style={style}
          onMouseUp={onSelect}
          onKeyUp={onSelect}
          onTouchEnd={onSelect}
        >
          {chapterPages.map((item) => (
            <div key={item.index} data-page={item.index} className="text-scroll-block">
              {renderRange(item.start, item.end)}
            </div>
          ))}
        </article>
        <nav className="text-chapter-nav" aria-label="Capítulos">
          <button type="button" className="button button--ghost" disabled={firstOfChapter === 0} onClick={() => go(firstOfChapter - 1)}>
            ← Capítulo anterior
          </button>
          <button
            type="button"
            className="button button--secondary"
            disabled={lastOfChapter >= pages.length - 1}
            onClick={() => go(lastOfChapter + 1)}
          >
            Próximo capítulo →
          </button>
        </nav>
      </div>
    )

  return (
    <>
      <div
        className="text-page-viewport"
        {...pointer}
        tabIndex={0}
        role="region"
        aria-label="Páginas do livro"
        onKeyDown={(event) => {
          if (event.target instanceof Element && event.target.closest('input,textarea,select,button,a')) return
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            chrome?.setControls(!chrome.controls)
            return
          }
          if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault()
            go(page + (event.key === 'ArrowRight' ? 1 : -1))
          }
        }}
      >
        <AnimatePresence initial={false} custom={direction.current} mode="popLayout">
          <motion.article
            key={page}
            ref={articleRef as RefObject<HTMLElement>}
            className="reader-prose text-prose text-page"
            style={{ ...style, transformPerspective: 1600 }}
            custom={direction.current}
            variants={animate ? leaf : still}
            initial="enter"
            animate="center"
            exit="exit"
            onMouseUp={onSelect}
            onKeyUp={onSelect}
            onTouchEnd={onSelect}
          >
            {current && renderRange(current.start, current.end)}
          </motion.article>
        </AnimatePresence>
      </div>
      <p className="text-page-status" aria-live="polite">
        {chapterTitle(chapter)} · {page + 1} de {pages.length}
      </p>
    </>
  )
}

/** A página que sai gira sobre a lombada; a que entra desliza por baixo. */
const leaf = {
  enter: (dir: number) => ({ x: dir > 0 ? '22%' : '-22%', opacity: 0, rotateY: 0 }),
  center: { x: 0, opacity: 1, rotateY: 0, transition: { duration: 0.55, ease: ease.page } },
  exit: (dir: number) => ({
    x: dir > 0 ? '-40%' : '40%',
    opacity: 0,
    rotateY: dir > 0 ? 35 : -35,
    transition: { duration: 0.5, ease: ease.page },
  }),
}
const still = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
}

export function StarRating({
  value,
  disabled,
  onChange,
}: {
  value: number
  disabled: boolean
  onChange: (stars: number) => void
}) {
  return (
    <div className="star-rating" role="radiogroup" aria-label="Sua avaliação">
      {[1, 2, 3, 4, 5].map((stars) => (
        <button
          key={stars}
          type="button"
          role="radio"
          aria-checked={value === stars}
          aria-label={`${stars} de 5`}
          className={value >= stars ? 'is-on' : ''}
          disabled={disabled}
          onClick={() => onChange(value === stars ? 0 : stars)}
        >
          <Star size={22} fill={value >= stars ? 'currentColor' : 'none'} aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}
