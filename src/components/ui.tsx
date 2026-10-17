import { Star } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { Book } from '../types/domain'

export function DemoBadge() {
  return <span className="demo-badge">Demonstração</span>
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <button className={`button button--${variant} ${className}`} {...props} />
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

export function Rating({ value }: { value: number }) {
  return <span className="rating"><Star size={14} fill="currentColor" aria-hidden="true" /> {value.toFixed(1)}</span>
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div className="progress-block">
      {label && <div className="progress-label"><span>{label}</span><strong>{value}%</strong></div>}
      <div className="progress-track" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

export function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return <div className="empty-state"><span>{icon}</span><h3>{title}</h3><p>{body}</p></div>
}
