import type { CSSProperties } from 'react'

/**
 * Adesivos decorativos da estética "Estante Rosa & Palha": laço, estrela, flor e brilho.
 * São sempre decorativos (aria-hidden) e usados com parcimônia: no máximo um ou dois por bloco.
 * O movimento (balanço leve) vem de CSS e some com prefers-reduced-motion.
 */
type StickerProps = {
  size?: number
  className?: string
  style?: CSSProperties
  /** 'float' balança devagar; 'none' fica parado. */
  motion?: 'float' | 'none'
}

function wrap(name: string, { size = 40, className = '', style, motion = 'float' }: StickerProps, svg: JSX.Element) {
  return (
    <span
      className={`sticker sticker--${name} ${motion === 'float' ? 'sticker--float' : ''} ${className}`.trim()}
      style={{ width: size, height: size, ...style }}
      aria-hidden="true"
    >
      {svg}
    </span>
  )
}

export function BowSticker(props: StickerProps) {
  return wrap('bow', props,
    <svg viewBox="0 0 64 64" fill="none">
      <path d="M32 26C24 14 8 10 7 20c-1 9 13 13 25 8Z" fill="var(--rosa-300)" stroke="var(--rosa-600)" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M32 26c8-12 24-16 25-6 1 9-13 13-25 8Z" fill="var(--rosa-300)" stroke="var(--rosa-600)" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M14 18c4-1 9 1 13 6M50 18c-4-1-9 1-13 6" stroke="var(--rosa-50)" strokeWidth="2" strokeLinecap="round" opacity=".8" />
      <path d="m30 29-9 25 6-2 3 7 4-29Z" fill="var(--rosa-400)" stroke="var(--rosa-600)" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="m34 29 9 25-6-2-3 7-4-29Z" fill="var(--rosa-400)" stroke="var(--rosa-600)" strokeWidth="1.4" strokeLinejoin="round" />
      <ellipse cx="32" cy="27" rx="6" ry="5" fill="var(--rosa-500)" stroke="var(--rosa-600)" strokeWidth="1.4" />
    </svg>)
}

export function StarSticker(props: StickerProps & { tone?: 'rosa' | 'vinho' | 'palha' }) {
  const tone = props.tone ?? 'vinho'
  const fill = tone === 'rosa' ? 'var(--rosa-300)' : tone === 'palha' ? 'var(--palha-400)' : 'var(--vinho-500)'
  const edge = tone === 'rosa' ? 'var(--rosa-600)' : tone === 'palha' ? 'var(--palha-700)' : 'var(--vinho-700)'
  return wrap('star', props,
    <svg viewBox="0 0 64 64" fill="none">
      <path d="M32 5l7.6 16.6 18.2 2-13.6 12.3 3.9 17.9L32 44.6l-16.1 9.2 3.9-17.9L6.2 23.6l18.2-2Z" fill={fill} stroke={edge} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M32 13l4.6 10" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity=".45" />
    </svg>)
}

export function FlowerSticker(props: StickerProps) {
  return wrap('flower', props,
    <svg viewBox="0 0 64 64" fill="none">
      {[0, 72, 144, 216, 288].map((angle) => (
        <ellipse key={angle} cx="32" cy="17" rx="9" ry="13" fill="var(--rosa-200)" stroke="var(--rosa-500)" strokeWidth="1.6" transform={`rotate(${angle} 32 32)`} />
      ))}
      <circle cx="32" cy="32" r="6" fill="var(--palha-400)" stroke="var(--palha-700)" strokeWidth="1.4" />
    </svg>)
}

export function SparkleSticker(props: StickerProps) {
  return wrap('sparkle', props,
    <svg viewBox="0 0 64 64" fill="none">
      <path d="M32 4c2 16 8 24 26 28-18 4-24 12-26 28-2-16-8-24-26-28 18-4 24-12 26-28Z" fill="var(--rosa-400)" />
    </svg>)
}
