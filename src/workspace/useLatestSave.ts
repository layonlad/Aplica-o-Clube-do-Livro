import { useCallback, useRef } from 'react'
import type { WorkspaceAction } from '../../server/src/workspace-model'

type Act = (
  action: WorkspaceAction,
  onSaved?: undefined,
  options?: { quiet?: boolean },
) => Promise<boolean>

/**
 * Salva a posição de leitura em segundo plano, sem travar a virada de página.
 * Guarda só o pedido mais recente; se o servidor estiver ocupado ou houver conflito de versão,
 * tenta de novo (montando o pedido outra vez, com a revisão atual).
 */
export function useLatestSave(act: Act) {
  const pending = useRef<{ build: () => WorkspaceAction; save: Act } | null>(null)
  const running = useRef(false)
  const actRef = useRef(act)
  actRef.current = act
  const flush = useCallback(async () => {
    if (running.current) return
    running.current = true
    let failures = 0
    try {
      while (pending.current) {
        const request = pending.current
        pending.current = null
        const ok = await request.save(request.build(), undefined, { quiet: true })
        if (ok) {
          failures = 0
          continue
        }
        if (!pending.current) pending.current = request
        if (++failures > 5) {
          pending.current = null
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 600 * failures))
      }
    } finally {
      running.current = false
    }
  }, [])
  return useCallback(
    (build: () => WorkspaceAction) => {
      pending.current = { build, save: actRef.current }
      void flush()
    },
    [flush],
  )
}
