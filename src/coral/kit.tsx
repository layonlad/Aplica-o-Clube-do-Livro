import type { CSSProperties, ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Bell, Search } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useUnreadCount } from '../community/NotificationBell'
import { CoverArt } from '../components/ui'
import { PrivateBookCover } from '../workspace/PrivateBookCover'

/** Cabeçalho em gradiente coral das telas principais. O conteúdo da tela vem dentro de <SheetBody>. */
export function Hero({
  title,
  subtitle,
  leading,
  actions,
  children,
  small = false,
  subtitleBelow = false,
}: {
  title: ReactNode
  subtitle?: ReactNode
  leading?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  small?: boolean
  /** Subtítulo em linha inteira, abaixo do título e dos botões (como em Explorar). */
  subtitleBelow?: boolean
}) {
  return (
    <header className="hero">
      <div className="hero__row">
        <div className="hero__identity">
          {leading}
          <div className="hero__text">
            <h1 className={`hero__title ${small ? 'hero__title--sm' : ''}`}>{title}</h1>
            {subtitle && !subtitleBelow && <p className="hero__subtitle">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="hero__actions">{actions}</div>}
      </div>
      {subtitle && subtitleBelow && <p className="hero__subtitle hero__subtitle--below">{subtitle}</p>}
      {children}
    </header>
  )
}

export function SheetBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`page-sheet ${className}`}>{children}</div>
}

/** Botão redondo translúcido do cabeçalho. Vira link quando recebe `to`. */
export function HeroIcon({
  label,
  to,
  onClick,
  children,
  dot = false,
  badge,
  expanded,
}: {
  label: string
  to?: string
  onClick?: () => void
  children: ReactNode
  dot?: boolean
  badge?: number
  expanded?: boolean
}) {
  const content = (
    <>
      {children}
      {badge ? (
        <span className="hero-badge" aria-hidden="true">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : dot ? (
        <span className="hero-icon__dot" aria-hidden="true" />
      ) : null}
    </>
  )
  return to ? (
    <Link className="hero-icon" to={to} aria-label={label}>
      {content}
    </Link>
  ) : (
    <button type="button" className="hero-icon" aria-label={label} aria-expanded={expanded} onClick={onClick}>
      {content}
    </button>
  )
}

/** Sino do cabeçalho: abre a central de notificações e mostra um ponto quando há novidades. */
export function HeroBell() {
  const { user } = useAuth(),
    count = useUnreadCount()
  if (!user?.emailVerified) return null
  return (
    <HeroIcon to="/app/notifications" label={count ? `Notificações: ${count} não lidas` : 'Notificações'} dot={count > 0}>
      <Bell size={21} strokeWidth={1.9} />
    </HeroIcon>
  )
}
export function HeroSearch({ to = '/app/explore?busca=1' }: { to?: string }) {
  return (
    <HeroIcon to={to} label="Pesquisar">
      <Search size={21} strokeWidth={1.9} />
    </HeroIcon>
  )
}

/** Barra compacta em gradiente das telas internas (voltar + título). */
export function AppBar({
  title,
  subtitle,
  back,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  back?: string | (() => void)
  actions?: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <header className="app-bar">
      <button
        type="button"
        className="hero-icon"
        aria-label="Voltar"
        onClick={() => {
          if (typeof back === 'function') back()
          else if (back) navigate(back)
          else if (window.history.length > 1) navigate(-1)
          else navigate('/app')
        }}
      >
        <ArrowLeft size={20} />
      </button>
      <h1 className="app-bar__title">
        {title}
        {subtitle && <small>{subtitle}</small>}
      </h1>
      {actions}
    </header>
  )
}

/** Título de seção com o link "Ver todos →" à direita. */
export function SectionHead({
  title,
  to,
  linkLabel = 'Ver todos',
  onLink,
  id,
  aside,
}: {
  title: ReactNode
  to?: string
  linkLabel?: string
  onLink?: () => void
  id?: string
  aside?: ReactNode
}) {
  return (
    <div className="section-head">
      <h2 id={id}>{title}</h2>
      {aside}
      {to ? (
        <Link className="section-head__link" to={to}>
          {linkLabel} <ArrowRight size={16} aria-hidden="true" />
        </Link>
      ) : onLink ? (
        <button type="button" className="section-head__link" onClick={onLink}>
          {linkLabel} <ArrowRight size={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

/**
 * Capa de livro: a imagem do EPUB da pessoa (biblioteca pessoal), a capa do catálogo ou a capa ilustrada.
 * `width` em px; `ratio` é largura/altura.
 */
export function BookCover({
  title,
  author,
  bookId,
  image,
  width = 96,
  ratio = 0.8,
  rank,
  className = '',
}: {
  title: string
  author?: string
  bookId?: string
  image?: string | null
  width?: number
  ratio?: number
  rank?: number
  className?: string
}) {
  const style = { '--cover-w': `${width}px`, '--cover-ratio': ratio } as CSSProperties
  return (
    <span className={`cover ${className}`} style={style}>
      {bookId ? (
        <PrivateBookCover id={bookId} title={title} author={author ?? ''} fallback={image ?? undefined} />
      ) : image ? (
        <img src={image} alt={`Capa de ${title}`} loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <CoverArt title={title} author={author} />
      )}
      {rank !== undefined && <span className="cover__rank">#{rank}</span>}
    </span>
  )
}

/** Data relativa curta: "há 2 h", "há 3 d". */
export function ago(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.round(hours / 24)
  if (days < 7) return `há ${days} d`
  return new Date(value).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
}

/** "18,4 mil" para números grandes, como nas referências. */
export function compact(value: number) {
  return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}
