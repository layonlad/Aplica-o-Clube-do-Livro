import { Star } from 'lucide-react'
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import type { Book } from '../types/domain'

export function DemoBadge() {
  return <span className="demo-badge">Demonstração</span>
}

export function Button({ variant = 'primary', className = '', onPointerDown, onAnimationEnd, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' }) {
  return (
    <button
      className={`button button--${variant} ${className}`}
      onPointerDown={(event) => {
        // Onda de toque a partir do ponto tocado/clicado (CSS em components.css).
        const target = event.currentTarget
        const rect = target.getBoundingClientRect()
        target.style.setProperty('--press-x', `${event.clientX - rect.left}px`)
        target.style.setProperty('--press-y', `${event.clientY - rect.top}px`)
        target.classList.remove('is-pressed')
        void target.offsetWidth
        target.classList.add('is-pressed')
        onPointerDown?.(event)
      }}
      onAnimationEnd={(event) => {
        if (event.animationName === 'press-wave') event.currentTarget.classList.remove('is-pressed')
        onAnimationEnd?.(event)
      }}
      {...props}
    />
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>
}

export function Avatar({ initials, size = 'md', color }: { initials: string; size?: 'sm' | 'md' | 'lg'; color?: string }) {
  return <span className={`avatar avatar--${size}`} style={color ? { background: color } : undefined}>{initials}</span>
}

export function BookCover({ book, size = 'md' }: { book: Book; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className={`book-cover book-cover--${size}`} style={{ background: `linear-gradient(145deg, ${book.cover.from}, ${book.cover.to})` }} aria-label={`Capa de ${book.title}`}>
      <span>{book.cover.mark}</span>
      <i aria-hidden="true" />
    </div>
  )
}

/** Combinações de capa da paleta. Todas com contraste AA entre fundo e tinta. */
const coverPalettes: Array<[bg: string, ink: string, band: string]> = [
  ['#1f4d4f', '#f3e3c0', '#c98a4b'],
  ['#f6b383', '#7a2a17', '#e9845a'],
  ['#1d3557', '#f2d48f', '#2f6690'],
  ['#f7d64a', '#1b2a4a', '#efbf2a'],
  ['#3d6b73', '#f5ecd7', '#9cbcae'],
  ['#f6d3dd', '#7a2048', '#e79bb6'],
  ['#1c1c22', '#d9b56c', '#3d3226'],
  ['#f0a07a', '#fff4e8', '#b14b6b'],
  ['#e9e1d2', '#2b2b2b', '#c4d2bd'],
  ['#4b3f72', '#f7e9d4', '#c06c84'],
]

export function coverPalette(seed: string) {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  return coverPalettes[hash % coverPalettes.length]
}

/** Capa tipográfica gerada a partir do título: única por livro, sem depender de imagem. */
export function CoverArt({ title, author, size = 'md', tilt = false, className = '' }: { title: string; author?: string; size?: 'sm' | 'md' | 'lg'; tilt?: boolean; className?: string }) {
  const [bg, ink, band] = coverPalette(`${title}${author ?? ''}`)
  const style = { '--cover-bg': bg, '--cover-ink': ink, '--cover-band': band } as CSSProperties
  return (
    <div className={`cover-art cover-art--${size} ${tilt ? 'is-tilt' : ''} ${className}`} style={style} aria-hidden="true">
      <span className="cover-art__title">{title}</span>
      {author && <span className="cover-art__author">{author}</span>}
    </div>
  )
}

/** Pilha de livros ilustrada para estados vazios. */
export function BookStack() {
  return <div className="book-stack" aria-hidden="true"><i /><i /><i /><i /><i /></div>
}

export function Spines({ thin = false }: { thin?: boolean }) {
  return <span className={`spines ${thin ? 'spines--thin' : ''}`} aria-hidden="true" />
}

export function SkeletonPage({ label }: { label: string }) {
  return <div className="skeleton-page" role="status" aria-live="polite"><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /><span className="sr-only">{label}</span></div>
}

export function Rating({ value }: { value: number }) {
  return <span className="rating"><Star size={14} fill="currentColor" aria-hidden="true" /> {value.toFixed(1)}</span>
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const safe = Math.max(0, Math.min(100, Math.round(value || 0)))
  return (
    <div className="progress-block">
      {label && <div className="progress-label"><span>{label}</span><strong>{safe}%</strong></div>}
      <div className="progress-track" role="progressbar" aria-label={label ?? 'Progresso'} aria-valuenow={safe} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${safe}%` }} />
      </div>
    </div>
  )
}

export function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return <div className="empty-state"><span>{icon}</span><h3>{title}</h3><p>{body}</p></div>
}
