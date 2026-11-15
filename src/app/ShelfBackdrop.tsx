import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion'

/**
 * Fundo fixo do app: uma estante cheia de livros atrás de tudo, com um véu pastel rosa e palha por cima.
 * Fica parado ao rolar (só um leve deslocamento de profundidade, desligado com movimento reduzido).
 *
 * A imagem vem do token --shelf-image (tokens.css / base.css). Para trocar pela foto definitiva,
 * coloque o arquivo em src/assets/estante/ e aponte o token para ele; a ilustração fica como reserva.
 */
export function ShelfBackdrop() {
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll()
  const drift = useSpring(useTransform(scrollYProgress, [0, 1], [0, -28]), { stiffness: 60, damping: 22, mass: 0.6 })

  return (
    <div className="shelf-backdrop" aria-hidden="true">
      <motion.div
        className="shelf-backdrop__shelf"
        style={reduce ? undefined : { y: drift }}
        initial={reduce ? false : { opacity: 0, scale: 1.08 }}
        animate={{ opacity: 1, scale: 1.03 }}
        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
      />
      <div className="shelf-backdrop__veil" />
    </div>
  )
}
