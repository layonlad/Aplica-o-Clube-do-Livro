import type { Pool } from 'pg'

// Chat and inbox share one waiting request per API instance. The other Cloud Run slot accepts writes.
const occupied = new WeakSet<Pool>()
export function reserveWait(pool: Pool) {
  if (occupied.has(pool)) return undefined
  occupied.add(pool)
  return () => occupied.delete(pool)
}
