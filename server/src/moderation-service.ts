import type { Pool, PoolClient } from 'pg'
import type { UserProfile } from './contracts.js'
import { transaction } from './database.js'
import { authorize } from './service.js'
import { can } from './permissions.js'
import { decodeCursor, pageOf } from './pagination.js'
import { notBlocked, publicMissing, visiblePublicPost } from './public-policy.js'
import { HttpError } from './errors.js'
export type ReportKind = 'post' | 'comment' | 'profile' | 'topic' | 'reply'
export class ModerationService {
  constructor(
    private pool: Pool,
    private moderatorUids: string[] = [],
  ) {}
  private async global(client: PoolClient, user: UserProfile) {
    return (
      this.moderatorUids.length > 0 &&
      !!(
        await client.query('SELECT 1 FROM users WHERE id=$1 AND firebase_uid=ANY($2::text[])', [
          user.id,
          this.moderatorUids,
        ])
      ).rowCount
    )
  }
  private async access(client: PoolClient, user: UserProfile, clubId: string | null) {
    if (clubId) {
      if (!can((await authorize(client, clubId, user.id)).role, 'moderate'))
        throw new HttpError(403, 'ACCESS_DENIED', 'A moderação deste clube exige permissão.')
    } else if (!(await this.global(client, user)))
      throw new HttpError(
        403,
        'ACCESS_DENIED',
        'A moderação pública exige permissão da plataforma.',
      )
  }
  permissions(user: UserProfile) {
    return transaction(this.pool, async (client) => ({
      publicModerator: await this.global(client, user),
    }))
  }
  report(user: UserProfile, kind: ReportKind, id: string, reason: string) {
    return transaction(this.pool, async (client) => {
      let clubId: string | null = null
      if (kind === 'profile') {
        if (
          !(
            await client.query(
              `SELECT 1 FROM profiles WHERE user_id=$1 AND is_public AND ${notBlocked('user_id', '$2')}`,
              [id, user.id],
            )
          ).rowCount
        )
          throw publicMissing()
      } else if (kind === 'post' || kind === 'comment') {
        const {
          rows: [post],
        } = await client.query(
          kind === 'post'
            ? 'SELECT p.* FROM social_posts p WHERE p.id=$1 AND p.deleted_at IS NULL'
            : 'SELECT p.* FROM post_comments c JOIN social_posts p ON p.id=c.post_id WHERE c.id=$1 AND c.deleted_at IS NULL AND p.deleted_at IS NULL',
          [id],
        )
        if (!post) throw publicMissing()
        clubId = post.club_id
        if (clubId) await authorize(client, clubId, user.id)
        else if (
          !(
            await client.query(
              `SELECT 1 FROM social_posts p WHERE p.id=$1 AND ${visiblePublicPost('p', '$2')}`,
              [post.id, user.id],
            )
          ).rowCount
        )
          throw publicMissing()
      } else {
        const {
          rows: [topic],
        } = await client.query(
          kind === 'topic'
            ? 'SELECT club_id FROM forum_topics WHERE id=$1 AND deleted_at IS NULL'
            : 'SELECT t.club_id FROM forum_replies r JOIN forum_topics t ON t.id=r.topic_id WHERE r.id=$1 AND r.deleted_at IS NULL AND t.deleted_at IS NULL',
          [id],
        )
        if (!topic) throw publicMissing()
        clubId = topic.club_id
        await authorize(client, clubId!, user.id)
      }
      const {
        rows: [row],
      } = await client.query(
        "INSERT INTO reports(reporter_id,club_id,target_kind,target_id,reason) VALUES($1,$2,$3,$4,$5) ON CONFLICT(reporter_id,target_kind,target_id) DO UPDATE SET reason=CASE WHEN reports.status='pending' THEN EXCLUDED.reason ELSE reports.reason END RETURNING id,status",
        [user.id, clubId, kind, id, reason],
      )
      return row
    })
  }
  list(user: UserProfile, clubId: string | null, input: { limit: number; cursor?: string }) {
    return transaction(this.pool, async (client) => {
      await this.access(client, user, clubId)
      const cursor = decodeCursor(input.cursor)
      const { rows } = await client.query(
        `SELECT r.id,r.target_kind AS kind,r.target_id AS "targetId",r.reason,r.created_at AS "createdAt",r.created_at::text AS "sortTime",COALESCE(p.body,c.body,pr.bio,t.body,reply.body,'Conteúdo indisponível na visibilidade atual') AS excerpt FROM reports r LEFT JOIN social_posts p ON r.target_kind='post' AND p.id=r.target_id AND (r.club_id IS NOT NULL OR (p.deleted_at IS NULL AND EXISTS(SELECT 1 FROM profiles author WHERE author.user_id=p.author_user_id AND author.is_public))) LEFT JOIN post_comments c ON r.target_kind='comment' AND c.id=r.target_id AND (r.club_id IS NOT NULL OR (c.deleted_at IS NULL AND EXISTS(SELECT 1 FROM profiles author WHERE author.user_id=c.author_user_id AND author.is_public) AND EXISTS(SELECT 1 FROM social_posts original JOIN profiles author ON author.user_id=original.author_user_id AND author.is_public WHERE original.id=c.post_id AND original.deleted_at IS NULL))) LEFT JOIN profiles pr ON r.target_kind='profile' AND pr.user_id=r.target_id AND pr.is_public LEFT JOIN forum_topics t ON r.target_kind='topic' AND t.id=r.target_id LEFT JOIN forum_replies reply ON r.target_kind='reply' AND reply.id=r.target_id WHERE r.club_id IS NOT DISTINCT FROM $1::uuid AND r.status='pending' AND ($2::timestamptz IS NULL OR (r.created_at,r.id)<($2,$3::uuid)) ORDER BY r.created_at DESC,r.id DESC LIMIT $4`,
        [clubId, cursor?.time ?? null, cursor?.id ?? null, input.limit + 1],
      )
      return pageOf(rows, input.limit)
    })
  }
  review(user: UserProfile, id: string, decision: 'dismissed' | 'removed', reason: string) {
    return transaction(this.pool, async (client) => {
      const {
        rows: [report],
      } = await client.query('SELECT * FROM reports WHERE id=$1', [id])
      if (!report) throw publicMissing()
      await this.access(client, user, report.club_id)
      const locked = (await client.query('SELECT status FROM reports WHERE id=$1 FOR UPDATE', [id]))
        .rows[0]
      if (locked.status !== 'pending')
        throw new HttpError(409, 'REPORT_REVIEWED', 'Esta denúncia já foi analisada.')
      if (decision === 'removed') {
        if (report.target_kind === 'profile')
          await client.query(
            'UPDATE profiles SET is_public=false,suspended=true,version=version+1,updated_at=now() WHERE user_id=$1',
            [report.target_id],
          )
        if (report.target_kind === 'post')
          await client.query(
            "UPDATE social_posts SET deleted_at=COALESCE(deleted_at,now()),body='Publicação removida',quote='',source='',book_title='',book_author='',version=version+1 WHERE id=$1",
            [report.target_id],
          )
        if (report.target_kind === 'comment')
          await client.query(
            "UPDATE post_comments SET deleted_at=COALESCE(deleted_at,now()),body='Comentário removido',version=version+1 WHERE id=$1",
            [report.target_id],
          )
        if (report.target_kind === 'topic')
          await client.query(
            "UPDATE forum_topics SET deleted_at=COALESCE(deleted_at,now()),body='Conversa removida',title='Conversa removida',version=version+1 WHERE id=$1",
            [report.target_id],
          )
        if (report.target_kind === 'reply')
          await client.query(
            "UPDATE forum_replies SET deleted_at=COALESCE(deleted_at,now()),body='Resposta removida',version=version+1 WHERE id=$1",
            [report.target_id],
          )
      }
      await client.query(
        'UPDATE reports SET status=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$1',
        [id, decision, user.id],
      )
      await client.query(
        'INSERT INTO moderation_actions(report_id,actor_id,club_id,action,reason) VALUES($1,$2,$3,$4,$5)',
        [id, user.id, report.club_id, decision, reason],
      )
      await client.query(
        "INSERT INTO audit_logs(club_id,actor_user_id,action,entity_id) VALUES($1,$2,'report.reviewed',$3)",
        [report.club_id, user.id, id],
      )
      return { reviewed: true }
    })
  }
}
