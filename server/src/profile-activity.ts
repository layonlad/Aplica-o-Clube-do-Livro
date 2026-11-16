import type { Pool } from 'pg'
import type { UserProfile } from './contracts.js'
import { transaction } from './database.js'
import { decodeCursor, pageOf } from './pagination.js'
import { notBlocked, visiblePublicPost, visibleProfile, publicMissing } from './public-policy.js'
/** Computed under current permissions; no copied/public activity collection. */
export class ProfileActivity {
  constructor(private pool: Pool) {}
  async readingSaved(user: UserProfile) {
    // Account-only projection: never return EPUB files, text, note bodies or club workspaces.
    // A workspace is capped at 100 books by the existing schema.
    const { rows } = await this.pool.query(
      `SELECT b->>'id' AS id,b->>'title' AS title,b->>'author' AS author,
      COALESCE((r->>'favorite')::boolean,false) AS favorite,
      ((r->'bookmark' IS NOT NULL AND r->'bookmark'<>'null'::jsonb) OR (r->'epubBookmark' IS NOT NULL AND r->'epubBookmark'<>'null'::jsonb)) AS "hasBookmark",
      COALESCE(jsonb_array_length(r->'annotations'),0)+COALESCE(jsonb_array_length(r->'epubAnnotations'),0) AS "noteCount"
      FROM personal_workspaces w CROSS JOIN LATERAL jsonb_array_elements(w.state->'books') b
      CROSS JOIN LATERAL (SELECT w.reading->(b->>'id') AS r) entry
      WHERE w.user_id=$1 AND (r->>'favorite'='true' OR r->'bookmark'<>'null'::jsonb OR r->'epubBookmark'<>'null'::jsonb
        OR COALESCE(jsonb_array_length(r->'annotations'),0)+COALESCE(jsonb_array_length(r->'epubAnnotations'),0)>0)
      ORDER BY b->>'createdAt' DESC,b->>'id' DESC LIMIT 100`,
      [user.id],
    )
    return { items: rows }
  }
  private club(club: string) {
    return `EXISTS(SELECT 1 FROM club_memberships visitor JOIN club_memberships subject ON subject.club_id=visitor.club_id AND subject.user_id=$1 AND subject.status='active' WHERE visitor.club_id=${club} AND visitor.user_id=$2 AND visitor.status='active')`
  }
  list(actor: UserProfile, id: string, input: { limit: number; cursor?: string }) {
    return transaction(this.pool, async (client) => {
      if (
        !(
          await client.query(
            `SELECT 1 FROM profiles WHERE user_id=$1 AND (NOT suspended OR user_id=$2) AND ${notBlocked('user_id', '$2')}`,
            [id, actor.id],
          )
        ).rowCount
      )
        throw publicMissing()
      const c = decodeCursor(input.cursor)
      const postAccess = `((${visiblePublicPost('p', '$2')}) OR (p.audience='club' AND p.deleted_at IS NULL AND ${this.club('p.club_id')}))`
      const branches = [
        `SELECT p.id,'post' AS kind,p.id AS "targetId",NULL::uuid AS "contextId",p.club_id AS "clubId",COALESCE(cl.name,'Comunidade') AS context,left(p.body,180) AS excerpt,p.created_at AS "createdAt",p.created_at::text AS "sortTime" FROM social_posts p LEFT JOIN clubs cl ON cl.id=p.club_id WHERE p.author_user_id=$1 AND ${postAccess}`,
        `SELECT pc.id,'comment' AS kind,p.id AS "targetId",pc.id AS "contextId",p.club_id AS "clubId",COALESCE(cl.name,'Comunidade') AS context,left(pc.body,180) AS excerpt,pc.created_at AS "createdAt",pc.created_at::text AS "sortTime" FROM post_comments pc JOIN social_posts p ON p.id=pc.post_id LEFT JOIN clubs cl ON cl.id=p.club_id WHERE pc.author_user_id=$1 AND pc.deleted_at IS NULL AND ${postAccess} AND ${notBlocked('p.author_user_id', '$2')} AND (p.club_id IS NOT NULL OR (${visibleProfile('pc.author_user_id', '$2')}))`,
        `SELECT t.id,'topic' AS kind,t.id AS "targetId",NULL::uuid AS "contextId",t.club_id AS "clubId",cl.name AS context,left(t.title,180) AS excerpt,t.created_at AS "createdAt",t.created_at::text AS "sortTime" FROM forum_topics t JOIN clubs cl ON cl.id=t.club_id WHERE t.author_user_id=$1 AND t.deleted_at IS NULL AND ${this.club('t.club_id')}`,
        `SELECT r.id,'reply' AS kind,t.id AS "targetId",r.id AS "contextId",t.club_id AS "clubId",cl.name AS context,left(r.body,180) AS excerpt,r.created_at AS "createdAt",r.created_at::text AS "sortTime" FROM forum_replies r JOIN forum_topics t ON t.id=r.topic_id JOIN clubs cl ON cl.id=t.club_id WHERE r.author_user_id=$1 AND r.deleted_at IS NULL AND t.deleted_at IS NULL AND ${notBlocked('t.author_user_id', '$2')} AND ${this.club('t.club_id')}`,
        `SELECT cl.id,'membership' AS kind,cl.id AS "targetId",NULL::uuid AS "contextId",cl.id AS "clubId",cl.name AS context,'Participação no clube' AS excerpt,m.joined_at AS "createdAt",m.joined_at::text AS "sortTime" FROM club_memberships m JOIN clubs cl ON cl.id=m.club_id WHERE m.user_id=$1 AND m.status='active' AND ${this.club('m.club_id')}`,
      ]
      // Each arm applies cursor and limit before aggregation, bounding previews and sort work.
      const sql = branches
        .map(
          (q) =>
            `(SELECT * FROM (${q}) a WHERE ($3::timestamptz IS NULL OR ("createdAt",id)<($3,$4::uuid)) ORDER BY "createdAt" DESC,id DESC LIMIT $5)`,
        )
        .join(' UNION ALL ')
      const { rows } = await client.query(
        `SELECT * FROM (${sql}) activity ORDER BY "createdAt" DESC,id DESC LIMIT $5`,
        [id, actor.id, c?.time ?? null, c?.id ?? null, input.limit + 1],
      )
      return pageOf(rows, input.limit)
    })
  }
  saved(user: UserProfile, input: { limit: number; cursor?: string }) {
    return transaction(this.pool, async (client) => {
      const c = decodeCursor(input.cursor)
      const { rows } = await client.query(
        `SELECT p.id,'saved' AS kind,p.id AS "targetId",p.club_id AS "clubId",COALESCE(cl.name,'Comunidade') AS context,left(p.body,180) AS excerpt,s.created_at AS "createdAt",s.created_at::text AS "sortTime"
        FROM saved_posts s JOIN social_posts p ON p.id=s.post_id LEFT JOIN clubs cl ON cl.id=p.club_id WHERE s.user_id=$1 AND p.deleted_at IS NULL AND ${notBlocked('p.author_user_id', '$1')}
        AND ((${visiblePublicPost('p', '$1')}) OR (p.audience='club' AND EXISTS(SELECT 1 FROM club_memberships m WHERE m.club_id=p.club_id AND m.user_id=$1 AND m.status='active')))
        AND ($2::timestamptz IS NULL OR (s.created_at,p.id)<($2,$3::uuid)) ORDER BY s.created_at DESC,p.id DESC LIMIT $4`,
        [user.id, c?.time ?? null, c?.id ?? null, input.limit + 1],
      )
      return pageOf(rows, input.limit)
    })
  }
}
