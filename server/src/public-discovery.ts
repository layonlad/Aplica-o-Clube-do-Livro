import type { Pool } from 'pg'
import type { UserProfile } from './contracts.js'
import { editorialAuthorId, visiblePublicPost, visibleProfile } from './public-policy.js'
export class PublicDiscovery {
  constructor(private pool: Pool) {}
  async get(user: UserProfile | null) {
    const params = [user?.id ?? null]
    const [books, sections] = await Promise.all([
      this.pool.query(
        `SELECT p.book_title AS title,p.book_author AS author,count(*)::int AS posts FROM social_posts p WHERE ${visiblePublicPost('p', '$1')} AND p.author_user_id<>'${editorialAuthorId}'::uuid AND p.created_at>now()-interval '30 days' AND p.book_title<>'' GROUP BY p.book_title,p.book_author ORDER BY count(*) DESC,p.book_title LIMIT 6`,
        params,
      ),
      this.pool.query(
        `SELECT section.name,items.* FROM (VALUES('featured',''),('reviews','review'),('discussions','question'),('recommendations','recommendation')) section(name,kind) CROSS JOIN LATERAL(SELECT p.id,p.body,p.book_title AS "bookTitle",p.book_author AS "bookAuthor",pr.display_name AS "authorName",(SELECT count(*)::int FROM post_likes l WHERE l.post_id=p.id) AS likes,(SELECT count(*)::int FROM post_comments c WHERE c.post_id=p.id AND c.deleted_at IS NULL AND (${visibleProfile('c.author_user_id', '$1')})) AS comments FROM social_posts p JOIN profiles pr ON pr.user_id=p.author_user_id WHERE ${visiblePublicPost('p', '$1')} AND p.author_user_id<>'${editorialAuthorId}'::uuid AND p.created_at>now()-interval '30 days' AND (section.kind='' OR p.kind=section.kind) ORDER BY CASE WHEN section.name='featured' THEN (SELECT h.created_at FROM community_highlights h WHERE h.post_id=p.id) END DESC NULLS LAST,CASE WHEN section.name='discussions' THEN (SELECT count(*) FROM post_comments c WHERE c.post_id=p.id AND c.deleted_at IS NULL AND (${visibleProfile('c.author_user_id', '$1')})) ELSE (SELECT count(*) FROM post_likes l WHERE l.post_id=p.id) END DESC,p.created_at DESC,p.id DESC LIMIT 4) items`,
        params,
      ),
    ])
    return {
      books: books.rows,
      sections: Object.fromEntries(
        ['featured', 'reviews', 'discussions', 'recommendations'].map((name) => [
          name,
          sections.rows
            .filter((item) => item.name === name)
            .map(({ name, ...item }) => ({ ...item, body: item.body.slice(0, 280) })),
        ]),
      ),
    }
  }
}
