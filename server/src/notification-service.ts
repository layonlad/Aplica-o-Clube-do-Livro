import type { Pool } from 'pg'
import type { UserProfile } from './contracts.js'
import { transaction } from './database.js'
import { decodeCursor, pageOf } from './pagination.js'
import { HttpError } from './errors.js'
import { notBlocked, visiblePublicPost, visibleProfile } from './public-policy.js'
export interface NotificationPreferences {
  interactions: boolean
  mentions: boolean
  clubs: boolean
  events: boolean
  readings: boolean
  reminderMinutes?: 0 | 15 | 60 | 1440
}
export const visibleNotification = `n.recipient_id=$1 AND (n.club_id IS NOT NULL OR n.kind='follow' OR (${visibleProfile('n.actor_id', '$1')})) AND ${notBlocked('n.actor_id', '$1')} AND COALESCE((to_jsonb(s)->>n.category)::boolean,true) AND n.created_at>now()-interval '90 days' AND (
 (n.target_type='post' AND EXISTS(SELECT 1 FROM social_posts p WHERE p.id=n.target_id AND p.deleted_at IS NULL AND (n.kind<>'mention' OR (n.context_id IS NOT NULL AND EXISTS(SELECT 1 FROM comment_mentions cm WHERE cm.comment_id=n.context_id AND cm.user_id=$1)) OR (n.context_id IS NULL AND EXISTS(SELECT 1 FROM post_mentions pm WHERE pm.post_id=p.id AND pm.user_id=$1))) AND ((p.audience='club' AND EXISTS(SELECT 1 FROM club_memberships m WHERE m.club_id=p.club_id AND m.user_id=$1 AND m.status='active')) OR (${visiblePublicPost('p', '$1')})) AND (n.context_id IS NULL OR EXISTS(SELECT 1 FROM post_comments c WHERE c.id=n.context_id AND c.post_id=p.id AND c.deleted_at IS NULL AND ${notBlocked('c.author_user_id', '$1')}))))
 OR (n.target_type='topic' AND EXISTS(SELECT 1 FROM forum_topics t JOIN club_memberships m ON m.club_id=t.club_id AND m.user_id=$1 AND m.status='active' WHERE t.id=n.target_id AND t.deleted_at IS NULL AND (n.context_id IS NULL OR EXISTS(SELECT 1 FROM forum_replies r WHERE r.id=n.context_id AND r.topic_id=t.id AND r.deleted_at IS NULL))))
 OR (n.target_type='profile' AND EXISTS(SELECT 1 FROM profiles p WHERE p.user_id=n.target_id AND NOT p.suspended AND (p.is_public OR n.kind='follow')))
 OR (n.target_type='invite' AND EXISTS(SELECT 1 FROM invites i JOIN users u ON u.id=$1 WHERE i.id=n.target_id AND i.email=lower(u.email) AND i.revoked_at IS NULL AND i.expires_at>now() AND i.uses<i.max_uses AND NOT EXISTS(SELECT 1 FROM club_memberships m WHERE m.club_id=i.club_id AND m.user_id=$1)))
 OR (n.target_type='request' AND EXISTS(SELECT 1 FROM club_join_requests r JOIN club_memberships m ON m.club_id=r.club_id AND m.user_id=$1 AND m.status='active' WHERE r.id=n.target_id AND ((n.kind='join_request' AND r.status='pending' AND m.role IN ('owner','admin')) OR (n.kind='join_approved' AND r.status='approved' AND r.user_id=$1))))
 OR (n.target_type='event' AND EXISTS(SELECT 1 FROM club_events e JOIN club_memberships m ON m.club_id=e.club_id AND m.user_id=$1 AND m.status='active' WHERE e.id=n.target_id AND e.deleted_at IS NULL AND (n.kind<>'event_reminder' OR (e.starts_at>=now() AND COALESCE(s.reminder_minutes,1440)>0 AND e.starts_at<now()+COALESCE(s.reminder_minutes,1440)*interval '1 minute' AND (n.dedupe_key='reminder:'||e.id||':'||e.starts_at OR n.dedupe_key='reminder:'||e.id||':'||e.starts_at||':'||COALESCE(s.reminder_minutes,1440))))))
 OR (n.target_type='book' AND EXISTS(SELECT 1 FROM club_memberships m WHERE m.club_id=n.club_id AND m.user_id=$1 AND m.status='active') AND notification_club_has_book(n.club_id,n.target_id))
)`
export class NotificationService {
  constructor(private pool: Pool) {}
  preferences(user: UserProfile) {
    return transaction(this.pool, async (client) => {
      await client.query(
        'INSERT INTO notification_settings(user_id) VALUES($1) ON CONFLICT DO NOTHING',
        [user.id],
      )
      const {
        rows: [row],
      } = await client.query(
        'SELECT interactions,mentions,clubs,events,readings,reminder_minutes AS "reminderMinutes" FROM notification_settings WHERE user_id=$1',
        [user.id],
      )
      return row as NotificationPreferences
    })
  }
  setPreferences(user: UserProfile, input: NotificationPreferences) {
    return this.pool
      .query(
        'INSERT INTO notification_settings(user_id,interactions,mentions,clubs,events,readings,reminder_minutes) VALUES($1,$2,$3,$4,$5,$6,COALESCE($7,1440)) ON CONFLICT(user_id) DO UPDATE SET interactions=$2,mentions=$3,clubs=$4,events=$5,readings=$6,reminder_minutes=COALESCE($7,notification_settings.reminder_minutes)',
        [
          user.id,
          input.interactions,
          input.mentions,
          input.clubs,
          input.events,
          input.readings,
          input.reminderMinutes ?? null,
        ],
      )
      .then(() => ({ updated: true }))
  }
  private async reminders(user: UserProfile) {
    await this.pool.query(
      `INSERT INTO notifications(recipient_id,actor_id,club_id,kind,target_type,target_id,category,dedupe_key,created_at) SELECT $1,i.created_by,i.club_id,'invitation','invite',i.id,'clubs','invite:'||i.id,i.created_at FROM invites i WHERE i.email=$2 AND i.created_by<>$1 AND i.revoked_at IS NULL AND i.expires_at>now() AND i.uses<i.max_uses AND NOT EXISTS(SELECT 1 FROM club_memberships m WHERE m.club_id=i.club_id AND m.user_id=$1) AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.recipient_id=$1 AND n.dedupe_key='invite:'||i.id) ORDER BY i.created_at DESC LIMIT 50 ON CONFLICT(recipient_id,dedupe_key) DO NOTHING`,
      [user.id, user.email.toLowerCase()],
    )
    await this.pool.query(
      `INSERT INTO notifications(recipient_id,actor_id,club_id,kind,target_type,target_id,category,dedupe_key)
      SELECT $1,q.actor_id,q.club_id,'post','post',q.post_id,'clubs','post:'||q.post_id FROM club_post_notices q JOIN social_posts p ON p.id=q.post_id JOIN club_memberships m ON m.club_id=q.club_id AND m.user_id=$1 AND m.status='active' AND m.joined_at<=q.created_at LEFT JOIN notification_settings s ON s.user_id=$1
      WHERE q.actor_id<>$1 AND p.deleted_at IS NULL AND q.created_at>now()-interval '7 days' AND COALESCE(s.clubs,true) AND ${notBlocked('q.actor_id', '$1')}
      AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.recipient_id=$1 AND n.dedupe_key='post:'||q.post_id) ORDER BY q.created_at DESC LIMIT 50 ON CONFLICT(recipient_id,dedupe_key) DO NOTHING`,
      [user.id],
    )
    await this.enqueueReminders(user.id)
  }
  enqueueReminders(userId?: string) {
    return this.pool
      .query(
        `INSERT INTO notifications(recipient_id,actor_id,club_id,kind,target_type,target_id,category,dedupe_key)
      SELECT m.user_id,e.created_by,e.club_id,'event_reminder','event',e.id,'events','reminder:'||e.id||':'||e.starts_at||':'||COALESCE(s.reminder_minutes,1440)
      FROM club_events e JOIN club_memberships m ON m.club_id=e.club_id AND m.status='active' LEFT JOIN notification_settings s ON s.user_id=m.user_id
      WHERE ($1::uuid IS NULL OR m.user_id=$1) AND e.deleted_at IS NULL AND e.starts_at>=now() AND COALESCE(s.events,true) AND COALESCE(s.reminder_minutes,1440)>0 AND e.starts_at<now()+COALESCE(s.reminder_minutes,1440)*interval '1 minute'
      AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.recipient_id=m.user_id AND n.dedupe_key IN ('reminder:'||e.id||':'||e.starts_at,'reminder:'||e.id||':'||e.starts_at||':'||COALESCE(s.reminder_minutes,1440)))
      ORDER BY e.starts_at,m.user_id LIMIT 500 ON CONFLICT(recipient_id,dedupe_key) DO NOTHING`,
        [userId ?? null],
      )
      .then((r) => r.rowCount ?? 0)
  }
  get(user: UserProfile, id: string) {
    return this.pool
      .query(
        `SELECT n.id,n.kind,CASE WHEN n.dedupe_key LIKE 'follow-request:%' THEN 'request' WHEN n.dedupe_key LIKE 'follow-approved:%' THEN 'approved' ELSE NULL END AS "followAction",n.target_type AS "targetType",n.target_id AS "targetId",n.club_id AS "clubId" FROM notifications n LEFT JOIN notification_settings s ON s.user_id=n.recipient_id WHERE ${visibleNotification} AND n.id=$2`,
        [user.id, id],
      )
      .then((r) => {
        if (!r.rows.length)
          throw new HttpError(404, 'NOTICE_NOT_FOUND', 'Esta notificação não está mais disponível.')
        return r.rows[0]
      })
  }
  async list(user: UserProfile, input: { limit: number; cursor?: string }) {
    await this.reminders(user)
    return transaction(this.pool, async (client) => {
      const cursor = decodeCursor(input.cursor)
      const { rows } = await client.query(
        `SELECT n.id,n.kind,CASE WHEN n.dedupe_key LIKE 'follow-request:%' THEN 'request' WHEN n.dedupe_key LIKE 'follow-approved:%' THEN 'approved' ELSE NULL END AS "followAction",n.target_type AS "targetType",n.target_id AS "targetId",n.club_id AS "clubId",n.created_at AS "createdAt",n.created_at::text AS "sortTime",n.read_at AS "readAt",COALESCE(pr.display_name,u.name) AS "actorName",pr.avatar_id AS "actorAvatarId",c.name AS "clubName" FROM notifications n LEFT JOIN notification_settings s ON s.user_id=n.recipient_id JOIN users u ON u.id=n.actor_id LEFT JOIN profiles pr ON pr.user_id=n.actor_id LEFT JOIN clubs c ON c.id=n.club_id WHERE ${visibleNotification} AND ($2::timestamptz IS NULL OR (n.created_at,n.id)<($2,$3::uuid)) ORDER BY n.created_at DESC,n.id DESC LIMIT $4`,
        [user.id, cursor?.time ?? null, cursor?.id ?? null, input.limit + 1],
      )
      return pageOf(rows, input.limit)
    })
  }
  async unread(user: UserProfile) {
    await this.reminders(user)
    return this.pool
      .query(
        `SELECT count(*)::int AS count FROM notifications n LEFT JOIN notification_settings s ON s.user_id=n.recipient_id WHERE ${visibleNotification} AND n.read_at IS NULL`,
        [user.id],
      )
      .then((result) => result.rows[0] as { count: number })
  }
  read(user: UserProfile, id?: string) {
    return this.pool
      .query(
        'UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE recipient_id=$1 AND ($2::uuid IS NULL OR id=$2)',
        [user.id, id ?? null],
      )
      .then(() => ({ updated: true }))
  }
}
