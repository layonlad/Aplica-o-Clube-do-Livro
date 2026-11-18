import { useEffect, useState } from 'react'
import type { CatalogEntry } from '../../server/src/catalog'
import { publicRequest, readableError } from '../auth/api'

/** Debounce maior que a janela de 1,1 s do catálogo; respostas antigas não substituem a busca atual. */
export function useCatalogSearch(
  query: string,
  author: string,
  genre: string,
  enabled: boolean,
  retry: number,
) {
  const [items, setItems] = useState<CatalogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const filters = new URLSearchParams({
    ...(query.trim().length >= 2 ? { q: query.trim() } : {}),
    ...(author.trim().length >= 2 ? { author: author.trim() } : {}),
    ...(genre.trim().length >= 2 ? { genre: genre.trim() } : {}),
  }).toString()
  useEffect(() => {
    let live = true
    setItems([])
    setError('')
    setLoading(enabled && !!filters)
    if (!enabled || !filters) return
    const timer = window.setTimeout(() => {
      void publicRequest<{ items: CatalogEntry[] }>('/catalog?' + filters)
        .then((value) => {
          if (live) setItems(value.items)
        })
        .catch((err) => {
          if (live) setError(readableError(err))
        })
        .finally(() => {
          if (live) setLoading(false)
        })
    }, 1200)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [filters, enabled, retry])
  return { items, loading, error }
}
