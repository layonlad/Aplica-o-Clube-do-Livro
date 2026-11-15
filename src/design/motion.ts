import type { Transition, Variants } from 'framer-motion'

/**
 * Movimento compartilhado (framer-motion). Os valores seguem os tokens --dur-* e --ease-* de tokens.css.
 * Regra: só transform e opacity. Os componentes que usam isto respeitam prefers-reduced-motion
 * (MotionConfig reducedMotion="user" em main.tsx).
 */
export const ease = {
  out: [0.22, 1, 0.36, 1] as const,
  page: [0.2, 0.8, 0.2, 1] as const,
}

/** Mola macia para marcadores e elementos que "assentam" no lugar. */
export const settle: Transition = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 }

/** Virar a página: a tela nova entra girando de leve sobre a lombada (borda esquerda). */
export const pageTurn: Variants = {
  initial: { opacity: 0, x: 22, rotateY: -8, transformPerspective: 1400 },
  enter: { opacity: 1, x: 0, rotateY: 0, transition: { duration: 0.46, ease: ease.page } },
}

/** Lista que entra em cascata (use em um container com staggerChildren). */
export const cascade: Variants = {
  initial: {},
  enter: { transition: { staggerChildren: 0.055, delayChildren: 0.06 } },
}
export const riseIn: Variants = {
  initial: { opacity: 0, y: 12, rotate: -0.6 },
  enter: { opacity: 1, y: 0, rotate: 0, transition: { duration: 0.42, ease: ease.out } },
}
