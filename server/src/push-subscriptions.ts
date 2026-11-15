import type { Pool } from 'pg'
import { ECDH } from 'node:crypto'
import { z } from 'zod'
import type { UserProfile } from './contracts.js'
import { transaction } from './database.js'
import { HttpError } from './errors.js'
/** Never let subscription registration become an arbitrary HTTP/SSRF proxy. */
export function trustedPushEndpoint(value: string) {
  try {
    const u = new URL(value)
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.hash &&
      (!u.port || u.port === '443') &&
      (u.hostname === 'fcm.googleapis.com' ||
        u.hostname === 'updates.push.services.mozilla.com' ||
        u.hostname === 'web.push.apple.com' ||
        /^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname))
    )
  } catch {
    return false
  }
}
const encoded = z
  .string()
  .max(100)
  .regex(/^[A-Za-z0-9_-]+={0,2}$/)
export const subscriptionInput = z
  .object({
    expirationTime: z.number().nullable().optional(),
    endpoint: z.string().max(2048).refine(trustedPushEndpoint),
    keys: z.object({ p256dh: encoded, auth: encoded }).strict(),
  })
  .strict()
  .refine((value) => {
    try {
      const key = Buffer.from(value.keys.p256dh, 'base64url')
      return (
        key.length === 65 &&
        key[0] === 4 &&
        Buffer.from(value.keys.auth, 'base64url').length === 16 &&
        ECDH.convertKey(key, 'prime256v1').length === 65
      )
    } catch {
      return false
    }
  })
export type WebSubscription = z.infer<typeof subscriptionInput>
export class PushSubscriptions {
  constructor(
    private pool: Pool,
    private publicKey?: string,
  ) {}
  config() {
    return { enabled: !!this.publicKey, publicKey: this.publicKey ?? null }
  }
  async register(user: UserProfile, input: WebSubscription) {
    if (!this.publicKey)
      throw new HttpError(
        503,
        'PUSH_UNAVAILABLE',
        'As notificações neste aparelho ainda não foram ativadas no serviço.',
      )
    return transaction(this.pool, async (client) => {
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id])
      const count = (
        await client.query(
          "SELECT count(*) FILTER(WHERE revoked_at IS NULL AND endpoint<>$2) AS active,count(*) FILTER(WHERE created_at>now()-interval '24 hours') AS daily FROM push_subscriptions WHERE user_id=$1",
          [user.id, input.endpoint],
        )
      ).rows[0]
      if (Number(count.active) >= 5 || Number(count.daily) >= 30)
        throw new HttpError(
          429,
          'PUSH_QUOTA',
          'Sua conta atingiu o limite de aparelhos. Desative um deles antes de continuar.',
        )
      const row = (
        await client.query(
          `INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth) VALUES($1,$2,$3,$4) ON CONFLICT(endpoint) DO UPDATE SET p256dh=$3,auth=$4,revoked_at=NULL,last_seen_at=now() WHERE push_subscriptions.user_id=$1 RETURNING id`,
          [user.id, input.endpoint, input.keys.p256dh, input.keys.auth],
        )
      ).rows[0]
      if (!row)
        throw new HttpError(
          409,
          'PUSH_DEVICE_IN_USE',
          'Desative as notificações da outra conta neste aparelho antes de continuar.',
        )
      return { enabled: true, id: row.id }
    })
  }
  status(user: UserProfile, endpoint: string) {
    return this.pool
      .query(
        'SELECT EXISTS(SELECT 1 FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2 AND revoked_at IS NULL) AS enabled',
        [user.id, endpoint],
      )
      .then((r) => r.rows[0] as { enabled: boolean })
  }
  revoke(user: UserProfile, endpoint: string) {
    return transaction(this.pool, async (client) => {
      const row = (
        await client.query(
          'UPDATE push_subscriptions SET revoked_at=now() WHERE user_id=$1 AND endpoint=$2 RETURNING id',
          [user.id, endpoint],
        )
      ).rows[0]
      if (row)
        await client.query(
          "UPDATE push_deliveries SET status='cancelled',leased_at=NULL WHERE subscription_id=$1 AND status IN ('pending','leased')",
          [row.id],
        )
      return { enabled: false }
    })
  }
}
