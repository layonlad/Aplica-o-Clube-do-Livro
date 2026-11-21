import { reserveWait } from './long-poll.js'
import { createHash } from 'node:crypto'
import type { Pool, Notification as PgNotice } from 'pg'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { NotificationService } from './notification-service.js'

/** At most one request waits on each small API instance. Others receive an immediate snapshot. */
export function notificationSync(
  api: FastifyInstance,
  pool: Pool,
  service: NotificationService,
) {
  api.get('/me/notifications/sync', async (req, res) => {
    const { revision } = z
      .object({ revision: z.string().length(43).optional() })
      .strict()
      .parse(req.query)
    const snapshot = async () => {
      const { page, unread } = await service.snapshot(req.user, !revision)
      const hash = createHash('sha256')
        .update(JSON.stringify([page, unread]))
        .digest('base64url')
      return { revision: hash, page, unread }
    }
    if (!revision || pool.options.max === 1) return snapshot()
    const release = reserveWait(pool)
    if (!release) return { ...(await snapshot()), retryAfterMs: 10000 }
    const channel =
      'clube_inbox_' + z.uuid().parse(req.user.id).replaceAll('-', '')
    try {
      const c = await pool.connect()
      let resolve!: () => void
      const changed = new Promise<void>((done) => {
        resolve = done
      })
      const wake = (n: PgNotice) => {
        if (n.channel === channel) resolve()
      }
      c.on('notification', wake)
      c.on('error', resolve)
      res.raw.once('close', resolve)
      const timer = setTimeout(resolve, 8000)
      let destroy = false
      try {
        await c.query('LISTEN ' + channel)
        const current = await snapshot()
        if (current.revision !== revision) return current
        await changed
      } finally {
        clearTimeout(timer)
        res.raw.off('close', resolve)
        await c.query('UNLISTEN ' + channel).catch(() => {
          destroy = true
        })
        c.off('notification', wake)
        c.off('error', resolve)
        c.release(destroy)
      }
      return snapshot()
    } finally {
      release()
    }
  })
}
