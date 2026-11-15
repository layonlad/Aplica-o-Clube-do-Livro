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
            if (
              !(await client.query('SELECT pg_try_advisory_lock(57291106) AS locked')).rows[0]
                .locked
            )
              return
            try {
              for (let cycle = 0; cycle < 3; cycle++) {
                again = false
                await worker.run()
                if (!again) break
              }
            } finally {
              await client.query('SELECT pg_advisory_unlock(57291106)')
            }
          } finally {
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
