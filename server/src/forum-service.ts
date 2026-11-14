import { emptyWorkspace, type WorkspaceAction, type WorkspaceState } from './workspace-model.js'
import type { Pool, PoolClient } from 'pg'
import type { UserProfile } from './contracts.js'
import { transaction } from './database.js'
import { authorize } from './service.js'
import { can } from './permissions.js'
import { HttpError } from './errors.js'
import { decodeCursor, pageOf } from './pagination.js'
export interface TopicInput {
  title: string
  body: string
  spoiler: boolean
  bookId?: string | null
  chapter: string
  mediaIds: string[]
}
export interface ForumQuery {
  limit: number
  cursor?: string
  q?: string
  bookId?: string
}
const missing = () => new HttpError(404, 'TOPIC_NOT_FOUND', 'Esta discussão não está disponível.')
const denied = () =>
  new HttpError(403, 'ACCESS_DENIED', 'Você não tem permissão para alterar esta discussão.')
const topicColumns = `t.id,t.title,t.body,t.spoiler,t.book_id AS "bookId",t.book_title AS "bookTitle",t.book_author AS "bookAuthor",t.chapter,t.pinned,t.closed,t.version,t.created_at AS "createdAt",t.updated_at AS "updatedAt",t.created_at::text AS "sortTime",jsonb_build_object('id',u.id,'name',u.name) AS author,
 (SELECT count(*)::int FROM forum_replies r WHERE r.topic_id=t.id AND r.deleted_at IS NULL) AS replies,
 (SELECT count(*)::int FROM forum_topic_likes l WHERE l.topic_id=t.id) AS likes,
 EXISTS(SELECT 1 FROM forum_topic_likes l WHERE l.topic_id=t.id AND l.user_id=$2) AS liked,
 (t.author_user_id=$2) AS "canEdit",(t.author_user_id=$2 OR $3::boolean) AS "canDelete",$3::boolean AS "canModerate",
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'width',m.width,'height',m.height,'duration',m.duration) ORDER BY fm.position) FROM forum_topic_media fm JOIN media_objects m ON m.id=fm.media_id WHERE fm.topic_id=t.id AND m.state='active'),'[]') AS media`
export class ForumService {
  constructor(private pool: Pool) {}
  private async access(client: PoolClient, user: UserProfile, clubId: string, read = false) {
    try {
      const club = await authorize(client, clubId, user.id, false, read ? 'share' : 'update')
      await this.reconcileLegacy(client, clubId)
      return club
    } catch (error) {
      if (error instanceof HttpError && error.statusCode === 403) throw missing()
      throw error
    }
  }
  private async reconcileLegacy(client: PoolClient, clubId: string) {
    await client.query(
      "INSERT INTO forum_legacy_checkpoints(club_id,topics) SELECT club_id,'[]'::jsonb FROM club_workspaces WHERE club_id=$1 ON CONFLICT DO NOTHING",
      [clubId],
    )
    const {
      rows: [change],
    } = await client.query<{ before: WorkspaceState['topics']; after: WorkspaceState['topics'] }>(
      `SELECT c.topics AS before,w.state->'topics' AS after FROM forum_legacy_checkpoints c JOIN club_workspaces w ON w.club_id=c.club_id WHERE c.club_id=$1 AND c.topics IS DISTINCT FROM w.state->'topics' FOR UPDATE OF c`,
      [clubId],
    )
    if (!change) return
    const candidates = [
      ...new Set(
        change.after.flatMap((topic) => [
          topic.by,
          ...topic.replies.map((reply) => reply.by),
          ...topic.likedBy,
        ]),
      ),
    ]
    if (
      candidates.some(
        (id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
      )
    )
      throw new HttpError(
        409,
        'FORUM_RECONCILIATION',
        'As conversas anteriores precisam de reconciliação de autoria.',
      )
    const allowed = new Set(
      (
        await client.query<{ user_id: string }>(
          'SELECT user_id FROM club_memberships WHERE club_id=$1 AND user_id=ANY($2::uuid[])',
          [clubId, candidates],
        )
      ).rows.map((member) => member.user_id),
    )
    if (
      change.after.some(
        (topic) =>
          !allowed.has(topic.by) ||
          topic.replies.some((reply) => !allowed.has(reply.by)) ||
          topic.likedBy.some((id) => !allowed.has(id)),
      )
    )
      throw new HttpError(
        409,
        'FORUM_RECONCILIATION',
        'As conversas anteriores precisam de uma verificação pela administração antes de continuar.',
      )
    const previous = new Map(change.before.map((topic) => [topic.id, topic])),
      current = new Set(change.after.map((topic) => topic.id))
    for (const topic of change.after) {
      await client.query(
        'INSERT INTO forum_topics(id,club_id,author_user_id,title,body,spoiler,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$7) ON CONFLICT DO NOTHING',
        [topic.id, clubId, topic.by, topic.title, topic.body, topic.spoiler, topic.at],
      )
      const belongs = await client.query(
        'SELECT 1 FROM forum_topics WHERE id=$1 AND club_id=$2 AND author_user_id=$3',
        [topic.id, clubId, topic.by],
      )
      if (!belongs.rowCount)
        throw new HttpError(
          409,
          'FORUM_RECONCILIATION',
          'Uma discussão anterior precisa de reconciliação de identificadores.',
        )
      for (const reply of topic.replies) {
        await client.query(
          'INSERT INTO forum_replies(id,topic_id,club_id,author_user_id,body,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
          [reply.id, topic.id, clubId, reply.by, reply.body, reply.at],
        )
        if (
          !(
            await client.query(
              'SELECT 1 FROM forum_replies WHERE id=$1 AND topic_id=$2 AND club_id=$3 AND author_user_id=$4',
              [reply.id, topic.id, clubId, reply.by],
            )
          ).rowCount
        )
          throw new HttpError(
            409,
            'FORUM_RECONCILIATION',
            'Uma resposta anterior precisa de reconciliação de identificadores.',
          )
      }
      const oldLikes = new Set(previous.get(topic.id)?.likedBy ?? []),
        newLikes = new Set(topic.likedBy)
      for (const id of newLikes)
        if (!oldLikes.has(id))
          await client.query(
            'INSERT INTO forum_topic_likes(topic_id,club_id,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
            [topic.id, clubId, id],
          )
      for (const id of oldLikes)
        if (!newLikes.has(id))
          await client.query('DELETE FROM forum_topic_likes WHERE topic_id=$1 AND user_id=$2', [
            topic.id,
            id,
          ])
    }
    for (const topic of change.before)
      if (!current.has(topic.id))
        await client.query(
          "UPDATE forum_topics SET deleted_at=COALESCE(deleted_at,now()),title='Discussão excluída',body='Discussão excluída',version=version+1 WHERE id=$1 AND club_id=$2 AND deleted_at IS NULL",
          [topic.id, clubId],
        )
    await client.query(
      'UPDATE forum_legacy_checkpoints SET topics=$2,updated_at=now() WHERE club_id=$1',
      [clubId, JSON.stringify(change.after)],
    )
  }
  private async topic(client: PoolClient, clubId: string, id: string) {
    const {
      rows: [topic],
    } = await client.query(
      'SELECT id,author_user_id,closed,pinned,version FROM forum_topics WHERE id=$1 AND club_id=$2 AND deleted_at IS NULL FOR UPDATE',
      [id, clubId],
    )
    if (!topic) throw missing()
    return topic as {
      id: string
      author_user_id: string
      closed: boolean
      pinned: boolean
      version: number
    }
  }
  private async reference(client: PoolClient, clubId: string, bookId?: string | null) {
    if (!bookId) return { title: '', author: '' }
    const {
      rows: [book],
    } = await client.query(
      "SELECT b->>'title' AS title,b->>'author' AS author FROM club_workspaces w CROSS JOIN LATERAL jsonb_array_elements(w.state->'books') b WHERE w.club_id=$1 AND b->>'id'=$2",
      [clubId, bookId],
    )
    if (!book) throw new HttpError(400, 'INVALID_BOOK', 'Escolha um livro do acervo deste clube.')
    return book as { title: string; author: string }
  }
  private async attach(
    client: PoolClient,
    user: UserProfile,
    clubId: string,
    id: string,
    mediaIds: string[],
    target: 'topic' | 'reply',
  ) {
    for (const [position, mediaId] of mediaIds.entries()) {
      const media = await client.query(
        "SELECT 1 FROM media_objects WHERE id=$1 AND club_id=$2 AND owner_user_id=$3 AND kind='image' AND state='active' FOR UPDATE",
        [mediaId, clubId, user.id],
      )
      if (!media.rowCount)
        throw new HttpError(
          400,
          'INVALID_MEDIA',
          'Anexe somente fotos suas enviadas para este clube.',
        )
      const table = target === 'topic' ? 'forum_topic_media' : 'forum_reply_media',
        column = target === 'topic' ? 'topic_id' : 'reply_id'
      await client.query(
        `INSERT INTO ${table}(${column},media_id,club_id,position) VALUES($1,$2,$3,$4)`,
        [id, mediaId, clubId, position],
      )
    }
  }
  async legacyTopics(
    client: PoolClient,
    clubId: string,
    userId: string,
    includeTopics = true,
  ): Promise<WorkspaceState['topics']> {
    await this.reconcileLegacy(client, clubId)
    if (!includeTopics) return []
    const { rows } = await client.query(
      `SELECT t.id,t.title,t.body,t.author_user_id AS by,u.name,to_char(t.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at,t.spoiler,
      COALESCE((SELECT jsonb_agg(l.user_id) FROM (SELECT user_id FROM forum_topic_likes WHERE topic_id=t.id ORDER BY (user_id=$2) DESC,user_id LIMIT 500) l),'[]') AS "likedBy",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'body',r.body,'by',r.author_user_id,'name',author.name,'at',r.created_at) ORDER BY r.created_at,r.id) FROM (SELECT * FROM forum_replies WHERE topic_id=t.id AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 100) r JOIN users author ON author.id=r.author_user_id),'[]') AS replies
      FROM forum_topics t JOIN users u ON u.id=t.author_user_id WHERE t.club_id=$1 AND t.deleted_at IS NULL ORDER BY t.created_at DESC,t.id DESC LIMIT 200`,
      [clubId, userId],
    )
    return rows
  }
  legacyAction(
    user: UserProfile,
    clubId: string,
    action: Extract<
      WorkspaceAction,
      { type: 'topic.add' | 'topic.reply' | 'topic.like' | 'topic.remove' }
    >,
    version: number,
  ) {
    return transaction(this.pool, async (client) => {
      const club = await this.access(client, user, clubId)
      await client.query(
        'INSERT INTO club_workspaces(club_id,state) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [clubId, emptyWorkspace()],
      )
      const workspace = await client.query(
        'SELECT version FROM club_workspaces WHERE club_id=$1 FOR UPDATE',
        [clubId],
      )
      if ((workspace.rows[0]?.version ?? 0) !== version)
        throw new HttpError(
          409,
          'WORKSPACE_CHANGED',
          'O espaço foi atualizado. Confira os dados e tente novamente.',
        )
      let entityId: string
      if (action.type === 'topic.add') {
        const {
          rows: [row],
        } = await client.query(
          'INSERT INTO forum_topics(club_id,author_user_id,title,body,spoiler) VALUES($1,$2,$3,$4,$5) RETURNING id',
          [clubId, user.id, action.title, action.body, action.spoiler],
        )
        entityId = row.id
      } else {
        const topic = await this.topic(client, clubId, action.id)
        entityId = topic.id
        if (action.type === 'topic.reply') {
          if (topic.closed)
            throw new HttpError(
              409,
              'TOPIC_CLOSED',
              'Esta discussão foi encerrada. Atualize o aplicativo para acompanhar o fórum.',
            )
          const {
            rows: [row],
          } = await client.query(
            'INSERT INTO forum_replies(topic_id,club_id,author_user_id,body) VALUES($1,$2,$3,$4) RETURNING id',
            [topic.id, clubId, user.id, action.body],
          )
          entityId = row.id
        } else if (action.type === 'topic.like') {
          const removed = await client.query(
            'DELETE FROM forum_topic_likes WHERE topic_id=$1 AND user_id=$2 RETURNING user_id',
            [topic.id, user.id],
          )
          if (!removed.rowCount)
            await client.query(
              'INSERT INTO forum_topic_likes(topic_id,club_id,user_id) VALUES($1,$2,$3)',
              [topic.id, clubId, user.id],
            )
        } else {
          if (topic.author_user_id !== user.id && !can(club.role, 'moderate')) throw denied()
          await client.query(
            "UPDATE forum_topics SET deleted_at=now(),title='Discussão excluída',body='Discussão excluída',version=version+1 WHERE id=$1",
            [topic.id],
          )
        }
      }
      await client.query(
        'UPDATE club_workspaces SET version=version+1,updated_at=now() WHERE club_id=$1',
        [clubId],
      )
      await client.query(
        'INSERT INTO audit_logs(club_id,actor_user_id,action,entity_id) VALUES($1,$2,$3,$4)',
        [clubId, user.id, action.type, entityId],
      )
    })
  }
  list(user: UserProfile, clubId: string, input: ForumQuery) {
    return transaction(this.pool, async (client) => {
      const club = await this.access(client, user, clubId, true),
        cursor = decodeCursor(input.cursor),
        parameters = [
          clubId,
          user.id,
          can(club.role, 'moderate'),
          input.q ?? null,
          input.bookId ?? null,
        ]
      const filter =
        "t.club_id=$1 AND t.deleted_at IS NULL AND ($4::text IS NULL OR (t.title||' '||t.body||' '||t.chapter) ILIKE '%'||$4||'%') AND ($5::uuid IS NULL OR t.book_id=$5)"
      const { rows } = await client.query(
        `SELECT ${topicColumns} FROM forum_topics t JOIN users u ON u.id=t.author_user_id WHERE ${filter} AND NOT t.pinned AND ($6::timestamptz IS NULL OR (t.created_at,t.id)<($6,$7::uuid)) ORDER BY t.created_at DESC,t.id DESC LIMIT $8`,
        [...parameters, cursor?.time ?? null, cursor?.id ?? null, input.limit + 1],
      )
      const pinned = input.cursor
        ? []
        : (
            await client.query(
              `SELECT ${topicColumns} FROM forum_topics t JOIN users u ON u.id=t.author_user_id WHERE ${filter} AND t.pinned ORDER BY t.created_at DESC,t.id DESC LIMIT 5`,
              parameters,
            )
          ).rows.map(({ sortTime: _, ...topic }) => topic)
      return { ...pageOf(rows, input.limit), pinned }
    })
  }
  get(user: UserProfile, clubId: string, id: string) {
    return transaction(this.pool, async (client) => {
      const club = await this.access(client, user, clubId, true)
      const {
        rows: [topic],
      } = await client.query(
        `SELECT ${topicColumns} FROM forum_topics t JOIN users u ON u.id=t.author_user_id WHERE t.club_id=$1 AND t.id=$4 AND t.deleted_at IS NULL`,
        [clubId, user.id, can(club.role, 'moderate'), id],
      )
      if (!topic) throw missing()
      const { sortTime: _, ...result } = topic
      return result
    })
  }
  create(user: UserProfile, clubId: string, input: TopicInput) {
    return transaction(this.pool, async (client) => {
      await this.access(client, user, clubId)
      const book = await this.reference(client, clubId, input.bookId)
      if (input.chapter && !input.bookId)
        throw new HttpError(400, 'INVALID_BOOK', 'Escolha um livro antes de indicar o capítulo.')
      const {
        rows: [topic],
      } = await client.query(
        'INSERT INTO forum_topics(club_id,author_user_id,title,body,spoiler,book_id,book_title,book_author,chapter) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
        [
          clubId,
          user.id,
          input.title,
          input.body,
          input.spoiler,
          input.bookId ?? null,
          book.title,
          book.author,
          input.chapter,
        ],
      )
      await this.attach(client, user, clubId, topic.id, input.mediaIds, 'topic')
      return topic
    })
  }
  edit(
    user: UserProfile,
    clubId: string,
    id: string,
    input: { title: string; body: string; spoiler: boolean; version: number },
  ) {
    return transaction(this.pool, async (client) => {
      await this.access(client, user, clubId)
      const topic = await this.topic(client, clubId, id)
      if (topic.author_user_id !== user.id) throw denied()
      if (topic.closed) throw new HttpError(409, 'TOPIC_CLOSED', 'A discussão foi encerrada.')
      if (topic.version !== input.version)
        throw new HttpError(409, 'TOPIC_CHANGED', 'A discussão mudou. Atualize antes de editar.')
      await client.query(
        'UPDATE forum_topics SET title=$2,body=$3,spoiler=$4,version=version+1,updated_at=now() WHERE id=$1',
        [id, input.title, input.body, input.spoiler],
      )
      return { updated: true }
    })
  }
  moderate(
    user: UserProfile,
    clubId: string,
    id: string,
    input: { version: number; pinned?: boolean; closed?: boolean },
  ) {
    return transaction(this.pool, async (client) => {
      const club = await this.access(client, user, clubId)
      if (!can(club.role, 'moderate')) throw denied()
      const topic = await this.topic(client, clubId, id)
      if (topic.version !== input.version)
        throw new HttpError(409, 'TOPIC_CHANGED', 'A discussão mudou. Atualize antes de moderar.')
      if (input.pinned && !topic.pinned) {
        const {
          rows: [count],
        } = await client.query(
          'SELECT count(*)::int AS count FROM forum_topics WHERE club_id=$1 AND pinned AND deleted_at IS NULL',
          [clubId],
        )
        if (count.count >= 5)
          throw new HttpError(409, 'PIN_LIMIT', 'O clube já tem cinco discussões fixadas.')
      }
      await client.query(
        'UPDATE forum_topics SET pinned=COALESCE($2,pinned),closed=COALESCE($3,closed),version=version+1,updated_at=now() WHERE id=$1',
        [id, input.pinned ?? null, input.closed ?? null],
      )
      await client.query(
        "INSERT INTO audit_logs(club_id,actor_user_id,action,entity_id) VALUES($1,$2,'forum.moderated',$3)",
        [clubId, user.id, id],
      )
      return { updated: true }
    })
  }
  remove(user: UserProfile, clubId: string, id: string) {
    return transaction(this.pool, async (client) => {
      const club = await this.access(client, user, clubId),
        topic = await this.topic(client, clubId, id)
      if (topic.author_user_id !== user.id && !can(club.role, 'moderate')) throw denied()
      await client.query(
        "UPDATE forum_topics SET title='Discussão excluída',body='Discussão excluída',deleted_at=now(),version=version+1 WHERE id=$1",
        [id],
      )
      await client.query(
        "INSERT INTO audit_logs(club_id,actor_user_id,action,entity_id) VALUES($1,$2,'forum.topic.deleted',$3)",
        [clubId, user.id, id],
      )
    })
  }
  like(user: UserProfile, clubId: string, id: string, value: boolean) {
    return transaction(this.pool, async (client) => {
      await this.access(client, user, clubId)
      await this.topic(client, clubId, id)
      if (value)
        await client.query(
          'INSERT INTO forum_topic_likes(topic_id,club_id,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [id, clubId, user.id],
        )
      else
        await client.query('DELETE FROM forum_topic_likes WHERE topic_id=$1 AND user_id=$2', [
          id,
          user.id,
        ])
      return { value }
    })
  }
  replies(
    user: UserProfile,
    clubId: string,
    id: string,
    input: { limit: number; cursor?: string },
  ) {
    return transaction(this.pool, async (client) => {
      const club = await this.access(client, user, clubId, true),
        exists = await client.query(
          'SELECT 1 FROM forum_topics WHERE id=$1 AND club_id=$2 AND deleted_at IS NULL',
          [id, clubId],
        )
      if (!exists.rowCount) throw missing()
      const cursor = decodeCursor(input.cursor)
      const { rows } = await client.query(
        `SELECT r.id,r.body,r.spoiler,r.version,r.created_at AS "createdAt",r.created_at::text AS "sortTime",jsonb_build_object('id',u.id,'name',u.name) AS author,(r.author_user_id=$2 OR $6::boolean) AS "canDelete",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'width',m.width,'height',m.height,'duration',m.duration) ORDER BY fm.position) FROM forum_reply_media fm JOIN media_objects m ON m.id=fm.media_id WHERE fm.reply_id=r.id AND m.state='active'),'[]') AS media
      FROM forum_replies r JOIN users u ON u.id=r.author_user_id WHERE r.topic_id=$1 AND r.deleted_at IS NULL AND ($3::timestamptz IS NULL OR (r.created_at,r.id)<($3,$4::uuid)) ORDER BY r.created_at DESC,r.id DESC LIMIT $5`,
        [
          id,
          user.id,
          cursor?.time ?? null,
          cursor?.id ?? null,
          input.limit + 1,
          can(club.role, 'moderate'),
        ],
      )
      return pageOf(rows, input.limit)
    })
  }
  reply(
    user: UserProfile,
    clubId: string,
    id: string,
    input: { body: string; spoiler: boolean; mediaIds: string[] },
  ) {
    return transaction(this.pool, async (client) => {
      await this.access(client, user, clubId)
      const topic = await this.topic(client, clubId, id)
      if (topic.closed)
        throw new HttpError(
          409,
          'TOPIC_CLOSED',
          'Esta discussão foi encerrada e não recebe novas respostas.',
        )
      const {
        rows: [reply],
      } = await client.query(
        'INSERT INTO forum_replies(topic_id,club_id,author_user_id,body,spoiler) VALUES($1,$2,$3,$4,$5) RETURNING id',
        [id, clubId, user.id, input.body, input.spoiler],
      )
      await this.attach(client, user, clubId, reply.id, input.mediaIds, 'reply')
      return reply
    })
  }
  removeReply(user: UserProfile, clubId: string, id: string, replyId: string) {
    return transaction(this.pool, async (client) => {
      const club = await this.access(client, user, clubId)
      await this.topic(client, clubId, id)
      const {
        rows: [reply],
      } = await client.query(
        'SELECT author_user_id FROM forum_replies WHERE id=$1 AND topic_id=$2 AND deleted_at IS NULL FOR UPDATE',
        [replyId, id],
      )
      if (!reply) throw missing()
      if (reply.author_user_id !== user.id && !can(club.role, 'moderate')) throw denied()
      await client.query(
        "UPDATE forum_replies SET body='Resposta excluída',deleted_at=now(),version=version+1 WHERE id=$1",
        [replyId],
      )
      await client.query(
        "INSERT INTO audit_logs(club_id,actor_user_id,action,entity_id) VALUES($1,$2,'forum.reply.deleted',$3)",
        [clubId, user.id, replyId],
      )
    })
  }
}
