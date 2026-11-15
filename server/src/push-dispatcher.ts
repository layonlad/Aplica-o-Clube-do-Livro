import type { Pool } from 'pg'
import { PushWorker } from './push-worker.js'
/** Fast delivery only after social writes; no polling that would keep Neon awake. */
export function createNotificationDispatcher(pool: Pool, env: NodeJS.ProcessEnv = process.env) {
  if (!env.PUSH_PUBLIC_KEY || !env.PUSH_PRIVATE_KEY || !env.PUSH_SUBJECT) return undefined
  let running = false,
    again = false
  const worker = new PushWorker(pool, {
    publicKey: env.PUSH_PUBLIC_KEY,
    privateKey: env.PUSH_PRIVATE_KEY,
    subject: env.PUSH_SUBJECT,
  })
  return () => {
    if (running) {
      again = true
      return
    }
    running = true
    setImmediate(
      () =>
        void (async () => {
          const client = await pool.connect()
          try {
            // PgBouncer pins the connection for this transaction. Session locks would leak
            // across pooled statements or be unlocked on a different PostgreSQL session.
            await client.query('BEGIN')
            if (
              !(await client.query('SELECT pg_try_advisory_xact_lock(57291106) AS locked')).rows[0]
                .locked
            )
              return
            for (let cycle = 0; cycle < 3; cycle++) {
              again = false
              await worker.run()
              if (!again) break
            }
          } finally {
            await client.query('ROLLBACK').catch(() => {})
            client.release()
          }
        })()
          .catch(() => console.error('A fila de notificações será retomada pelo executor externo.'))
          .finally(() => {
            running = false
          }),
    )
  }
}
