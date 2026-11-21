import type { Pool } from 'pg'
import { z } from 'zod'
import { transaction } from './database.js'
import { HttpError } from './errors.js'
import { trustedPushEndpoint } from './push-subscriptions.js'

const bool = z.boolean()
export const centerSettings = z
  .object({
    chatMessages: bool.default(true),
    clubWallPosts: bool.default(true),
    communityHighlights: bool.default(true),
    mentions: bool.default(true),
    replies: bool.default(true),
    invitations: bool.default(true),
    readingActivities: bool.default(true),
    clubEvents: bool.default(true),
    pushEnabled: bool.default(true),
    chatDeliveryMode: z
      .enum(['all', 'grouped', 'mentions', 'silent'])
      .default('mentions'),
    mutedClubIds: z.array(z.uuid()).max(200).default([]),
  })
  .strict()
// Parse patches without injecting defaults for missing keys.
export const settingsPatch = z
  .object(
    Object.fromEntries(
      Object.entries(centerSettings.shape).map(([key, schema]) => [
        key,
        schema.removeDefault().optional(),
      ]),
    ),
  )
  .strict()
export const fcmToken = z
  .string()
  .min(20)
  .max(1900)
  .regex(/^[A-Za-z0-9:_.-]+$/)
export const deviceInput = z
  .object({
    token: fcmToken,
    installationId: z.uuid(),
    platform: z.enum(['web', 'ios', 'android']),
    previousWebEndpoint: z
      .string()
      .max(2048)
      .refine(trustedPushEndpoint)
      .optional(),
  })
  .strict()
interface SettingsRow {
  controls: Record<string, unknown>
  clubs: boolean
  interactions: boolean
  mentions: boolean
  readings: boolean
  events: boolean
}
function effectiveSettings(row?: SettingsRow) {
  return centerSettings.parse({
    chatMessages: row?.clubs,
    clubWallPosts: row?.clubs,
    invitations: row?.clubs,
    replies: row?.interactions,
    communityHighlights: row?.interactions,
    clubEvents: row?.events,
    readingActivities: row?.readings,
    ...row?.controls,
    mentions: row?.mentions,
  })
}
export class NotificationCenter {
  constructor(private pool: Pool) {}
  async settings(user: string) {
    const { rows } = await this.pool.query(
      'SELECT controls,mentions,clubs,interactions,events,readings FROM notification_settings WHERE user_id=$1',
      [user],
    )
    return effectiveSettings(rows[0])
  }
  async update(user: string, patch: Record<string, unknown>) {
    const { mentions, ...controls } = patch
    const { rows } = await this.pool.query(
      `INSERT INTO notification_settings(user_id,controls,mentions) VALUES($1,$2,COALESCE($3,true))
       ON CONFLICT(user_id) DO UPDATE SET controls=notification_settings.controls||excluded.controls,
       mentions=COALESCE($3,notification_settings.mentions) RETURNING controls,mentions,clubs,interactions,events,readings`,
      [user, controls, mentions ?? null],
    )
    return effectiveSettings(rows[0])
  }
  async register(user: string, input: z.infer<typeof deviceInput>) {
    if (process.env.FCM_PUSH_ENABLED !== 'true')
      throw new HttpError(
        503,
        'FCM_DISABLED',
        'O envio por FCM está desativado.',
      )
    return transaction(this.pool, async (c) => {
      await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user])
      const endpoint = 'fcm:' + input.token
      const previous = await c.query(
        `UPDATE push_subscriptions SET revoked_at=now()
        WHERE user_id=$1 AND revoked_at IS NULL AND ((installation_id=$2 AND endpoint<>$3) OR endpoint=$4) RETURNING id`,
        [
          user,
          input.installationId,
          endpoint,
          input.previousWebEndpoint ?? null,
        ],
      )
      if (previous.rowCount)
        await c.query(
          `UPDATE push_deliveries SET status='cancelled',lease_token=NULL
        WHERE subscription_id=ANY($1::uuid[]) AND status IN ('leased','pending')`,
          [previous.rows.map((r) => r.id)],
        )
      const usage = (
        await c.query(
          `SELECT count(*) FILTER(WHERE revoked_at IS NULL AND endpoint<>$2)::int AS active,
        count(*) FILTER(WHERE created_at>now()-interval '1 day' AND endpoint<>$2)::int AS daily FROM push_subscriptions WHERE user_id=$1`,
          [user, endpoint],
        )
      ).rows[0]
      if (usage.active >= 5 || usage.daily >= 30)
        throw new HttpError(429, 'PUSH_QUOTA', 'Limite de aparelhos atingido.')
      const result = await c.query(
        `INSERT INTO push_subscriptions(user_id,endpoint,platform,installation_id) VALUES($1,$2,$3,$4)
        ON CONFLICT(endpoint) DO UPDATE SET revoked_at=NULL,last_seen_at=now()
        WHERE push_subscriptions.user_id=$1 AND push_subscriptions.installation_id=$4 AND push_subscriptions.platform=$3
        RETURNING id,platform,last_seen_at AS "lastSeenAt"`,
        [user, endpoint, input.platform, input.installationId],
      )
      if (!result.rowCount)
        throw new HttpError(
          409,
          'PUSH_DEVICE_IN_USE',
          'Registro indisponível para esta instalação.',
        )
      return { ...result.rows[0], provider: 'fcm' }
    })
  }
}
