import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { ease, LEAF_DURATION } from '../design/motion'

/**
 * Ao trocar de aba, uma folha de papel gira sobre a lombada e revela a tela nova,
 * como folhear um livro. Indo para uma aba à direita, a folha vira da direita para a esquerda;
 * voltando, vira no sentido contrário. Com movimento reduzido, não aparece.
 */
export function PageLeaf({ turnKey, order }: { turnKey: string; order: number }) {
  const reduce = useReducedMotion()
  const previous = useRef<{ key: string; order: number } | null>(null)
  const [leaf, setLeaf] = useState<{ id: number; forward: boolean } | null>(null)
  useEffect(() => {
    const last = previous.current
    previous.current = { key: turnKey, order }
    if (!last || last.key === turnKey || reduce) return
    setLeaf({ id: Date.now(), forward: order >= last.order })
  }, [turnKey, order, reduce])
  return (
    <AnimatePresence>
      {leaf && (
        <motion.div
          key={leaf.id}
          className={`page-leaf ${leaf.forward ? 'page-leaf--forward' : 'page-leaf--back'}`}
          aria-hidden="true"
          initial={{ rotateY: 0, opacity: 1 }}
          animate={{ rotateY: leaf.forward ? -178 : 178, opacity: [1, 1, 0.85, 0] }}
          transition={{ duration: LEAF_DURATION, ease: ease.page, opacity: { duration: LEAF_DURATION, times: [0, 0.45, 0.8, 1] } }}
          style={{ transformPerspective: 1800 }}
          onAnimationComplete={() => setLeaf(null)}
        >
          <span className="page-leaf__shade" />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
