import type { Pool } from 'pg'
import type { UserProfile } from './contracts.js'
import { transaction } from './database.js'
import { decodeCursor, pageOf } from './pagination.js'
import { notBlocked, visiblePublicPost } from './public-policy.js'
export interface NotificationPreferences {
  interactions: boolean
  mentions: boolean
  clubs: boolean
  events: boolean
  readings: boolean
}
const visible = `n.recipient_id=$1 AND (n.club_id IS NOT NULL OR EXISTS(SELECT 1 FROM profiles actor WHERE actor.user_id=n.actor_id AND actor.is_public)) AND ${notBlocked('n.actor_id', '$1')} AND COALESCE((to_jsonb(s)->>n.category)::boolean,true) AND n.created_at>now()-interval '90 days' AND (
 (n.target_type='post' AND EXISTS(SELECT 1 FROM social_posts p WHERE p.id=n.target_id AND p.deleted_at IS NULL AND (n.kind<>'mention' OR n.context_id IS NOT NULL OR EXISTS(SELECT 1 FROM post_mentions pm WHERE pm.post_id=p.id AND pm.user_id=$1)) AND ((p.audience='club' AND EXISTS(SELECT 1 FROM club_memberships m WHERE m.club_id=p.club_id AND m.user_id=$1 AND m.status='active')) OR (${visiblePublicPost('p', '$1')})) AND (n.context_id IS NULL OR EXISTS(SELECT 1 FROM post_comments c WHERE c.id=n.context_id AND c.post_id=p.id AND c.deleted_at IS NULL AND ${notBlocked('c.author_user_id', '$1')}))))
 OR (n.target_type='topic' AND EXISTS(SELECT 1 FROM forum_topics t JOIN club_memberships m ON m.club_id=t.club_id AND m.user_id=$1 AND m.status='active' WHERE t.id=n.target_id AND t.deleted_at IS NULL AND (n.context_id IS NULL OR EXISTS(SELECT 1 FROM forum_replies r WHERE r.id=n.context_id AND r.topic_id=t.id AND r.deleted_at IS NULL))))
 OR (n.target_type='profile' AND EXISTS(SELECT 1 FROM profiles p WHERE p.user_id=n.target_id AND p.is_public))
 OR (n.target_type='invite' AND EXISTS(SELECT 1 FROM invites i JOIN users u ON u.id=$1 WHERE i.id=n.target_id AND i.email=lower(u.email) AND i.revoked_at IS NULL AND i.expires_at>now() AND i.uses<i.max_uses AND NOT EXISTS(SELECT 1 FROM club_memberships m WHERE m.club_id=i.club_id AND m.user_id=$1)))
 OR (n.target_type='request' AND EXISTS(SELECT 1 FROM club_join_requests r JOIN club_memberships m ON m.club_id=r.club_id AND m.user_id=$1 AND m.status='active' WHERE r.id=n.target_id AND ((n.kind='join_request' AND r.status='pending' AND m.role IN ('owner','admin')) OR (n.kind='join_approved' AND r.status='approved' AND r.user_id=$1))))
 OR (n.target_type='event' AND EXISTS(SELECT 1 FROM club_events e JOIN club_memberships m ON m.club_id=e.club_id AND m.user_id=$1 AND m.status='active' WHERE e.id=n.target_id AND e.deleted_at IS NULL AND (n.kind<>'event_reminder' OR (e.starts_at>=now() AND e.starts_at<now()+interval '24 hours' AND n.dedupe_key='reminder:'||e.id||':'||e.starts_at))))
 OR (n.target_type='book' AND EXISTS(SELECT 1 FROM club_memberships m JOIN club_workspaces w ON w.club_id=m.club_id WHERE m.club_id=n.club_id AND m.user_id=$1 AND m.status='active' AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(w.state->CASE WHEN n.target_type='event' THEN 'events' ELSE 'books' END,'[]')) item WHERE item->>'id'=n.target_id::text)))
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
        'SELECT interactions,mentions,clubs,events,readings FROM notification_settings WHERE user_id=$1',
        [user.id],
      )
      return row as NotificationPreferences
    })
  }
  setPreferences(user: UserProfile, input: NotificationPreferences) {
    return this.pool
      .query(
        'INSERT INTO notification_settings(user_id,interactions,mentions,clubs,events,readings) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id) DO UPDATE SET interactions=$2,mentions=$3,clubs=$4,events=$5,readings=$6',
        [user.id, input.interactions, input.mentions, input.clubs, input.events, input.readings],
      )
      .then(() => ({ updated: true }))
  }
  private async reminders(user: UserProfile) {
    await this.pool.query(
      `INSERT INTO notifications(recipient_id,actor_id,club_id,kind,target_type,target_id,category,dedupe_key,created_at) SELECT $1,i.created_by,i.club_id,'invitation','invite',i.id,'clubs','invite:'||i.id,i.created_at FROM invites i WHERE i.email=$2 AND i.created_by<>$1 AND i.revoked_at IS NULL AND i.expires_at>now() AND i.uses<i.max_uses AND NOT EXISTS(SELECT 1 FROM club_memberships m WHERE m.club_id=i.club_id AND m.user_id=$1) AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.recipient_id=$1 AND n.dedupe_key='invite:'||i.id) ORDER BY i.created_at DESC LIMIT 50 ON CONFLICT(recipient_id,dedupe_key) DO NOTHING`,
      [user.id, user.email.toLowerCase()],
    )
    await this.pool.query(
      `INSERT INTO notifications(recipient_id,actor_id,club_id,kind,target_type,target_id,category,dedupe_key) SELECT $1,e.created_by,e.club_id,'event_reminder','event',e.id,'events','reminder:'||e.id||':'||e.starts_at FROM club_events e JOIN club_memberships m ON m.club_id=e.club_id AND m.user_id=$1 AND m.status='active' WHERE e.deleted_at IS NULL AND e.starts_at>=now() AND e.starts_at<now()+interval '24 hours' ORDER BY e.starts_at LIMIT 50 ON CONFLICT(recipient_id,dedupe_key) DO NOTHING`,
      [user.id],
    )
  }
  async list(user: UserProfile, input: { limit: number; cursor?: string }) {
    await this.reminders(user)
    return transaction(this.pool, async (client) => {
      const cursor = decodeCursor(input.cursor)
      const { rows } = await client.query(
        `SELECT n.id,n.kind,n.target_type AS "targetType",n.target_id AS "targetId",n.club_id AS "clubId",n.created_at AS "createdAt",n.created_at::text AS "sortTime",n.read_at AS "readAt",CASE WHEN n.club_id IS NULL THEN COALESCE(pr.display_name,'Leitor') ELSE u.name END AS "actorName",c.name AS "clubName" FROM notifications n LEFT JOIN notification_settings s ON s.user_id=n.recipient_id JOIN users u ON u.id=n.actor_id LEFT JOIN profiles pr ON pr.user_id=n.actor_id LEFT JOIN clubs c ON c.id=n.club_id WHERE ${visible} AND ($2::timestamptz IS NULL OR (n.created_at,n.id)<($2,$3::uuid)) ORDER BY n.created_at DESC,n.id DESC LIMIT $4`,
        [user.id, cursor?.time ?? null, cursor?.id ?? null, input.limit + 1],
      )
      return pageOf(rows, input.limit)
    })
  }
  async unread(user: UserProfile) {
    await this.reminders(user)
    return this.pool
      .query(
        `SELECT count(*)::int AS count FROM notifications n LEFT JOIN notification_settings s ON s.user_id=n.recipient_id WHERE ${visible} AND n.read_at IS NULL`,
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
