import { sendFcm, fcmErrorStatus } from './fcm-delivery.js'
import type { Pool } from 'pg'
import * as webpush from 'web-push'
import { randomUUID } from 'node:crypto'
import { transaction } from './database.js'
import {
  NotificationService,
  visibleNotification,
} from './notification-service.js'
import { trustedPushEndpoint } from './push-subscriptions.js'
import { notBlocked } from './public-policy.js'
interface Delivery {
  notification_id: string
  subscription_id: string
  lease_token: string
  attempts: number
}
interface Device {
  endpoint: string
  p256dh: string
  auth: string
  user_id: string
}
interface PushOptions {
  publicKey: string
  privateKey: string
  subject: string
  sendFcm?: typeof sendFcm
  send?: (device: Device, payload: string, topic: string) => Promise<unknown>
}
export class PushWorker {
  constructor(
    private pool: Pool,
    private options: PushOptions,
  ) {}
  /** Bounded, cursor-based club fan-out can resume after worker restarts. */
  async fanout() {
    return transaction(this.pool, async (client) => {
      const job = (
        await client.query(
          'SELECT q.* FROM club_post_notices q WHERE done_at IS NULL ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED',
        )
      ).rows[0]
      if (!job) return 0
      const post = (
        await client.query(
          "SELECT id FROM social_posts WHERE id=$1 AND deleted_at IS NULL AND audience='club' AND created_at>now()-interval '7 days'",
          [job.post_id],
        )
      ).rows[0]
      if (!post) {
        await client.query(
          'UPDATE club_post_notices SET done_at=now() WHERE post_id=$1',
          [job.post_id],
        )
        return 0
      }
      const members = (
        await client.query(
          "SELECT user_id FROM club_memberships WHERE club_id=$1 AND status='active' AND joined_at<=$3 AND ($2::uuid IS NULL OR user_id>$2) ORDER BY user_id LIMIT 200",
          [job.club_id, job.after_user, job.created_at],
        )
      ).rows as { user_id: string }[]
      if (members.length) {
        await client.query(
          `INSERT INTO notifications(recipient_id,actor_id,club_id,kind,target_type,target_id,category,dedupe_key)
          SELECT m.user_id,$2,$3,'post','post',$4,'clubs','post:'||$4::uuid FROM unnest($1::uuid[]) m(user_id) LEFT JOIN notification_settings s ON s.user_id=m.user_id
          WHERE m.user_id<>$2 AND notice_allowed(s,'post','post',$3,'clubs') AND ${notBlocked('m.user_id', '$2')} ON CONFLICT(recipient_id,dedupe_key) DO NOTHING`,
          [
            members.map((m) => m.user_id),
            job.actor_id,
            job.club_id,
            job.post_id,
          ],
        )
      }
      await client.query(
        'UPDATE club_post_notices SET after_user=$2,done_at=CASE WHEN $3 THEN now() ELSE NULL END WHERE post_id=$1',
        [
          job.post_id,
          members.at(-1)?.user_id ?? job.after_user,
          members.length < 200,
        ],
      )
      return members.length
    })
  }
  private async lease(limit: number) {
    const token = randomUUID()
    return transaction(this.pool, async (client) => {
      const rows = (
        await client.query<Delivery>(
          `UPDATE push_deliveries d SET status='leased',leased_at=now(),lease_token=$2,attempts=attempts+1
        WHERE (notification_id,subscription_id) IN(SELECT notification_id,subscription_id FROM push_deliveries WHERE ((status='pending' AND available_at<=now()) OR (status='leased' AND leased_at<now()-interval '5 minutes')) AND attempts<8 ORDER BY available_at LIMIT $1 FOR UPDATE SKIP LOCKED)
        RETURNING notification_id,subscription_id,lease_token,attempts`,
          [Math.max(1, Math.min(50, limit)), token],
        )
      ).rows
      return rows
    })
  }
  private async finish(
    job: Delivery,
    status: string,
    error?: string,
    delay = 0,
  ) {
    await this.pool.query(
      "UPDATE push_deliveries SET status=$4,last_error=$5,attempts=CASE WHEN $5='RATE_LIMIT' THEN greatest(0,attempts-1) ELSE attempts END,leased_at=NULL,lease_token=NULL,available_at=now()+$6*interval '1 second',sent_at=CASE WHEN $4='sent' THEN now() ELSE sent_at END WHERE notification_id=$1 AND subscription_id=$2 AND lease_token=$3",
      [
        job.notification_id,
        job.subscription_id,
        job.lease_token,
        status,
        error ?? null,
        delay,
      ],
    )
  }
  async process(limit = 30) {
    const stats = { sent: 0, cancelled: 0, retry: 0, failed: 0, throttled: 0 }
    // Expired leases at the retry limit cannot remain stuck indefinitely.
    const exhausted = await this.pool.query(
      "UPDATE push_deliveries SET status='failed',lease_token=NULL,last_error='ATTEMPTS_EXHAUSTED' WHERE status IN ('pending','leased') AND attempts>=8 AND (leased_at IS NULL OR leased_at<now()-interval '5 minutes')",
    )
    stats.failed += exhausted.rowCount ?? 0
    for (const job of await this.lease(limit)) {
      const device = (
        await this.pool.query<Device>(
          "SELECT endpoint,p256dh,auth,user_id FROM push_subscriptions WHERE id=$1 AND revoked_at IS NULL AND last_seen_at>now()-interval '90 days'",
          [job.subscription_id],
        )
      ).rows[0]
      const fcm = device?.endpoint.startsWith('fcm:')
      if (
        !device ||
        (fcm
          ? process.env.FCM_PUSH_ENABLED !== 'true'
          : !trustedPushEndpoint(device.endpoint))
      ) {
        await this.finish(job, 'cancelled', 'DEVICE_UNAVAILABLE')
        stats.cancelled++
        continue
      }
      // Authorization and current category preferences are checked immediately before delivery.
      const allowed = (
        await this.pool.query(
          `SELECT n.target_type FROM notifications n LEFT JOIN notification_settings s ON s.user_id=n.recipient_id WHERE ${visibleNotification} AND n.id=$2 AND n.read_at IS NULL AND COALESCE((s.controls->>'pushEnabled')::boolean,true) AND (n.target_type='chat' OR n.created_at>now()-interval '24 hours')`,
          [device.user_id, job.notification_id],
        )
      ).rows[0]
      if (!allowed) {
        await this.finish(job, 'cancelled', 'NOTICE_UNAVAILABLE')
        stats.cancelled++
        continue
      }
      const duplicate = (
        await this.pool.query(
          `SELECT 1 FROM push_deliveries d JOIN notifications prior ON prior.id=d.notification_id JOIN notifications current ON current.id=$1 WHERE d.subscription_id=$2 AND d.status='sent' AND prior.context_id IS NOT NULL AND prior.context_id=current.context_id AND prior.target_type=current.target_type AND prior.target_id=current.target_id LIMIT 1`,
          [job.notification_id, job.subscription_id],
        )
      ).rowCount
      if (duplicate) {
        await this.finish(job, 'cancelled', 'DUPLICATE_EVENT')
        stats.cancelled++
        continue
      }
      const recent =
        allowed.target_type === 'chat'
          ? null
          : (
              await this.pool.query(
                `SELECT count(DISTINCT d.notification_id)::int AS count,bool_or(d.notification_id=$2) AS already FROM push_deliveries d JOIN push_subscriptions p ON p.id=d.subscription_id WHERE p.user_id=$1 AND d.status='sent' AND d.sent_at>now()-interval '1 hour'`,
                [device.user_id, job.notification_id],
              )
            ).rows[0]
      if (recent && recent.count >= 10 && !recent.already) {
        await this.finish(job, 'pending', 'RATE_LIMIT', 3600)
        stats.throttled++
        continue
      }
      // No names, club titles, excerpts, photos or private target URLs leave the server.
      const payload = JSON.stringify({ notificationId: job.notification_id })
      try {
        if (fcm)
          await (this.options.sendFcm ?? sendFcm)(
            device.endpoint.slice(4),
            job.notification_id,
          )
        else if (this.options.send)
          await this.options.send(
            device,
            payload,
            job.notification_id.replaceAll('-', ''),
          )
        else
          await webpush.sendNotification(
            {
              endpoint: device.endpoint,
              keys: { p256dh: device.p256dh, auth: device.auth },
            },
            payload,
            {
              TTL: 3600,
              urgency: 'normal',
              topic: job.notification_id.replaceAll('-', ''),
              timeout: 10000,
              vapidDetails: {
                subject: this.options.subject,
                publicKey: this.options.publicKey,
                privateKey: this.options.privateKey,
              },
            },
          )
        await this.finish(job, 'sent')
        stats.sent++
      } catch (error) {
        const status = fcm
          ? fcmErrorStatus(error)
          : (error as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          await transaction(this.pool, async (client) => {
            await client.query(
              'UPDATE push_subscriptions SET revoked_at=now() WHERE id=$1',
              [job.subscription_id],
            )
            await client.query(
              "UPDATE push_deliveries SET status='cancelled',lease_token=NULL,last_error='DEVICE_REVOKED' WHERE subscription_id=$1 AND status IN ('pending','leased')",
              [job.subscription_id],
            )
          })
          stats.cancelled++
        } else if (
          (!status || status === 429 || status >= 500) &&
          job.attempts < 8
        ) {
          await this.finish(
            job,
            'pending',
            status ? `HTTP_${status}` : 'NETWORK',
            Math.min(3600, 60 * 2 ** job.attempts),
          )
          stats.retry++
        } else {
          await this.finish(
            job,
            'failed',
            status ? `HTTP_${status}` : 'NETWORK',
          )
          stats.failed++
        }
      }
    }
    return stats
  }
  async cleanup() {
    await this.pool.query(
      "DELETE FROM notification_events WHERE event_key IN (SELECT event_key FROM notification_events WHERE done_at<now()-interval '7 days' ORDER BY done_at LIMIT 200)",
    )
    await this.pool.query(
      "UPDATE push_subscriptions SET revoked_at=COALESCE(revoked_at,now()) WHERE last_seen_at<now()-interval '90 days'",
    )
    await this.pool.query(
      "DELETE FROM push_subscriptions WHERE id IN(SELECT id FROM push_subscriptions WHERE revoked_at<now()-interval '7 days' ORDER BY revoked_at LIMIT 100)",
    )
    await this.pool.query(
      "DELETE FROM push_deliveries WHERE (notification_id,subscription_id) IN(SELECT d.notification_id,d.subscription_id FROM push_deliveries d JOIN notifications n ON n.id=d.notification_id WHERE d.status IN ('sent','failed','cancelled') AND n.created_at<now()-interval '7 days' ORDER BY n.created_at LIMIT 500)",
    )
    await this.pool.query(
      "DELETE FROM club_post_notices WHERE post_id IN(SELECT post_id FROM club_post_notices WHERE done_at<now()-interval '7 days' ORDER BY done_at LIMIT 100)",
    )
  }
  async run() {
    let pages = 0,
      created = 0
    for (; pages < 8; pages++) {
      const page = await this.pool.query(
        'SELECT next_notice_page() AS inserted',
      )
      if (page.rows[0].inserted === null) break
      created += page.rows[0].inserted
    }
    const backlog = (
      await this.pool
        .query(`SELECT count(*) FILTER(WHERE failed_at IS NULL)::int AS pending,count(*) FILTER(WHERE failed_at IS NOT NULL)::int AS failed,COALESCE(EXTRACT(epoch FROM now()-min(created_at) FILTER(WHERE failed_at IS NULL))::int,0) AS age
      FROM notification_events WHERE done_at IS NULL`)
    ).rows[0]
    let members = 0
    for (let i = 0; i < 5; i++) {
      const next = await this.fanout()
      members += next
      if (!next) break
    }
    const reminders = await new NotificationService(
      this.pool,
    ).enqueueReminders()
    const deliveries = await this.process()
    await this.cleanup()
    return {
      pages,
      created,
      pendingEvents: backlog.pending,
      oldestEventSeconds: backlog.age,
      failedEvents: backlog.failed,
      members,
      reminders,
      ...deliveries,
    }
  }
}
