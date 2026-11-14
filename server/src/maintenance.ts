import type { Pool } from 'pg'
import type { PrivateStorage } from './private-storage.js'
import { PrivateFiles } from './private-files.js'
import { ClubFiles } from './club-files.js'
import { MediaService } from './media-service.js'
export async function maintain(pool: Pool, storage?: PrivateStorage) {
  const client = await pool.connect()
  try {
    if (!(await client.query('SELECT pg_try_advisory_lock(57291104) AS locked')).rows[0].locked)
      return { skipped: true }
    try {
      const removed = await pool.query(
        "DELETE FROM notifications WHERE id IN(SELECT id FROM notifications WHERE created_at<now()-interval '90 days' ORDER BY created_at LIMIT 500 FOR UPDATE SKIP LOCKED)",
      )
      return {
        notifications: removed.rowCount,
        ...(storage
          ? {
              personal: await new PrivateFiles(pool, storage).cleanup(5),
              club: await new ClubFiles(pool, storage).cleanup(5),
              social: await new MediaService(pool, storage).cleanup(5),
            }
          : {}),
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock(57291104)')
    }
  } finally {
    client.release()
  }
}
export function startMaintenance(
  pool: Pool,
  storage: PrivateStorage | undefined,
  enabled: boolean,
) {
  if (!enabled) return () => {}
  let stopped = false,
    running = false
  const run = async () => {
    if (stopped || running) return
    running = true
    try {
      await maintain(pool, storage)
    } catch {
      console.error('A manutenção privada será repetida no próximo ciclo.')
    } finally {
      running = false
    }
  }
  const initial = setTimeout(() => void run(), 60000),
    interval = setInterval(() => void run(), 30 * 60000)
  initial.unref()
  interval.unref()
  return () => {
    stopped = true
    clearTimeout(initial)
    clearInterval(interval)
  }
}
