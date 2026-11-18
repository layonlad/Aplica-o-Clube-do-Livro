import type { Pool, PoolClient } from 'pg'
import type { UserProfile } from './contracts.js'
import { transaction } from './database.js'
import { decodeCursor, pageOf } from './pagination.js'
import { notBlocked, publicMissing, visibleProfile, visiblePublicPost } from './public-policy.js'
import { FollowService, lockPeople } from './follow-service.js'
import { HttpError } from './errors.js'
export interface ProfileInput {
  handle: string
  displayName: string
  bio: string
  genres: string[]
  isPublic: boolean
  showLibrary: boolean
  showStats: boolean
  showClubs: boolean
  goal: number
  avatarId?: string | null
  coverId?: string | null
  version: number
}
const fields = `user_id AS id,handle,display_name AS "displayName",bio,genres,is_public AS "isPublic",show_library AS "showLibrary",show_stats AS "showStats",show_clubs AS "showClubs",goal,avatar_id AS "avatarId",cover_id AS "coverId",version,suspended`
export class ProfileService {
  constructor(private pool: Pool) {}
  mine(user: UserProfile) {
    return transaction(this.pool, async (client) => {
      await client.query(
        'INSERT INTO profiles(user_id,handle,display_name) VALUES($1,$2,$3) ON CONFLICT(user_id) DO NOTHING',
        [user.id, 'leitor_' + user.id.replaceAll('-', '').slice(0, 20), 'Leitor'],
      )
      return (await client.query(`SELECT ${fields} FROM profiles WHERE user_id=$1`, [user.id]))
        .rows[0]
    })
  }
  update(user: UserProfile, input: ProfileInput) {
    return transaction(this.pool, async (client) => {
      const {
        rows: [profile],
      } = await client.query('SELECT version,suspended FROM profiles WHERE user_id=$1 FOR UPDATE', [
        user.id,
      ])
      if (!profile) throw publicMissing()
      if (profile.suspended && input.isPublic)
        throw new HttpError(
          403,
          'PROFILE_SUSPENDED',
          'Seu perfil público foi suspenso pela moderação. Os dados pessoais continuam acessíveis.',
        )
      if (profile.version !== input.version)
        throw new HttpError(
          409,
          'PROFILE_CHANGED',
          'Seu perfil mudou em outro aparelho. Atualize antes de salvar.',
        )
      if (
        (
          await client.query('SELECT 1 FROM profiles WHERE handle=$1 AND user_id<>$2', [
            input.handle,
            user.id,
          ])
        ).rowCount
      )
        throw new HttpError(409, 'HANDLE_TAKEN', 'Este nome de usuário já está em uso.')
      for (const id of [input.avatarId, input.coverId].filter(Boolean))
        if (
          !(
            await client.query(
              "SELECT 1 FROM media_objects WHERE id=$1 AND owner_user_id=$2 AND club_id IS NULL AND kind='image' AND state='active' FOR SHARE",
              [id, user.id],
            )
          ).rowCount
        )
          throw new HttpError(
            400,
            'INVALID_MEDIA',
            'Escolha uma foto sua preparada para o perfil público.',
          )
      try {
        await client.query(
          'UPDATE profiles SET handle=$2,display_name=$3,bio=$4,genres=$5,is_public=$6,show_library=$7,show_stats=$8,show_clubs=$9,goal=$10,avatar_id=$11,cover_id=$12,version=version+1,updated_at=now() WHERE user_id=$1',
          [
            user.id,
            input.handle,
            input.displayName,
            input.bio,
            input.genres,
            input.isPublic,
            input.showLibrary,
            input.showStats,
            input.showClubs,
            input.goal,
            input.avatarId ?? null,
            input.coverId ?? null,
          ],
        )
      } catch (error) {
        if ((error as { code?: string }).code === '23505')
          throw new HttpError(409, 'HANDLE_TAKEN', 'Este nome de usuário já está em uso.')
        throw error
      }
      return { updated: true }
    })
  }
  /**
   * Troca a foto do perfil. A mídia precisa ser uma imagem ativa da própria conta, fora de clubes.
   * Devolve a foto anterior para que o chamador revogue o arquivo depois do commit.
   */
  setAvatar(user: UserProfile, avatarId: string | null) {
    return this.setProfileMedia(user, 'avatar', avatarId).then(({ id, previous }) => ({
      avatarId: id,
      previous,
    }))
  }
  /** Capa do perfil: mesmas garantias da foto (imagem própria, troca e revogação atômicas). */
  setCover(user: UserProfile, coverId: string | null) {
    return this.setProfileMedia(user, 'cover', coverId).then(({ id, previous }) => ({
      coverId: id,
      previous,
    }))
  }
  private setProfileMedia(user: UserProfile, slot: 'avatar' | 'cover', mediaId: string | null) {
    const column = slot === 'avatar' ? 'avatar_id' : 'cover_id',
      other = slot === 'avatar' ? 'cover_id' : 'avatar_id'
    return transaction(this.pool, async (client) => {
      await client.query(
        'INSERT INTO profiles(user_id,handle,display_name) VALUES($1,$2,$3) ON CONFLICT(user_id) DO NOTHING',
        [user.id, 'leitor_' + user.id.replaceAll('-', '').slice(0, 20), 'Leitor'],
      )
      const {
        rows: [profile],
      } = await client.query(
        `SELECT ${column} AS current FROM profiles WHERE user_id=$1 FOR UPDATE`,
        [user.id],
      )
      if (
        mediaId &&
        !(
          await client.query(
            "SELECT 1 FROM media_objects WHERE id=$1 AND owner_user_id=$2 AND club_id IS NULL AND kind='image' AND state='active' FOR SHARE",
            [mediaId, user.id],
          )
        ).rowCount
      )
        throw new HttpError(
          400,
          'INVALID_MEDIA',
          slot === 'avatar'
            ? 'Escolha uma foto sua preparada para o perfil.'
            : 'Escolha uma imagem sua preparada para a capa.',
        )
      await client.query(
        `UPDATE profiles SET ${column}=$2,version=version+1,updated_at=now() WHERE user_id=$1`,
        [user.id, mediaId],
      )
      const previous: string | null = profile.current
      if (previous && previous !== mediaId) {
        // A revogação é atômica com a troca: falhas na limpeza física nunca mantêm a imagem acessível.
        await client.query(
          "UPDATE media_objects SET state='deleted',deleted_at=COALESCE(deleted_at,now()) WHERE id=$1 AND owner_user_id=$2 AND state='active'",
          [previous, user.id],
        )
        await client.query(`UPDATE profiles SET ${other}=NULL WHERE user_id=$1 AND ${other}=$2`, [
          user.id,
          previous,
        ])
      }
      return { id: mediaId, previous: previous && previous !== mediaId ? previous : null }
    })
  }
  /**
   * Cartão mínimo de outro leitor: visível se o perfil é público ou se os dois têm um clube ativo em comum.
   * `sharedClubs` lista somente clubes em que o visitante também participa agora.
   */
  person(actor: UserProfile, id: string) {
    return transaction(this.pool, async (client) => {
      const {
        rows: [person],
      } = await client.query(
        `SELECT u.id,COALESCE(pr.display_name,u.name) AS name,pr.avatar_id AS "avatarId",COALESCE(pr.is_public AND NOT pr.suspended,false) AS "isPublic",
          COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) ORDER BY c.name) FROM club_memberships mine JOIN club_memberships theirs ON theirs.club_id=mine.club_id AND theirs.user_id=u.id AND theirs.status='active' JOIN clubs c ON c.id=mine.club_id WHERE mine.user_id=$2 AND mine.status='active'),'[]') AS "sharedClubs"
        FROM users u LEFT JOIN profiles pr ON pr.user_id=u.id WHERE u.id=$1 AND ${notBlocked('u.id', '$2')}`,
        [id, actor.id],
      )
      if (!person || (person.id !== actor.id && !person.isPublic && !person.sharedClubs.length))
        throw publicMissing()
      return person as {
        id: string
        name: string
        avatarId: string | null
        isPublic: boolean
        sharedClubs: { id: string; name: string }[]
      }
    })
  }
  get(actor: UserProfile | null, id: string) {
    return transaction(this.pool, async (client) => {
      const viewer = actor?.id ?? null
      const {
        rows: [profile],
      } = await client.query(
        `SELECT ${fields},user_id=$2 AS "isSelf",(${visibleProfile('profiles.user_id', '$2')}) OR user_id=$2 AS "canSeeContent",
         EXISTS(SELECT 1 FROM follows WHERE follower_id=$2 AND followed_id=user_id) AS following,
         EXISTS(SELECT 1 FROM follow_requests WHERE requester_id=$2 AND target_id=user_id AND status='pending') AS requested
         FROM profiles WHERE user_id=$1 AND (is_public OR $2::uuid IS NOT NULL) AND (NOT suspended OR user_id=$2) AND ${notBlocked('user_id', '$2')}`,
        [id, viewer],
      )
      if (!profile) throw publicMissing()
      const allowed = profile.canSeeContent
      const counts = allowed
        ? (
            await client.query(
              `SELECT
        (SELECT count(*)::int FROM follows f WHERE f.followed_id=$1 AND ${notBlocked('f.follower_id', '$2')}) AS followers,
        (SELECT count(*)::int FROM follows f WHERE f.follower_id=$1 AND ${notBlocked('f.followed_id', '$2')}) AS follows,
        (SELECT count(*)::int FROM social_posts p WHERE p.author_user_id=$1 AND ${visiblePublicPost('p', '$2')}) AS posts`,
              [id, viewer],
            )
          ).rows[0]
        : { followers: null, follows: null, posts: null }
      const library =
        allowed && (profile.showLibrary || profile.showStats)
          ? (
              await client.query('SELECT state,reading FROM personal_workspaces WHERE user_id=$1', [
                id,
              ])
            ).rows[0]
          : null
      const books = Array.isArray(library?.state?.books) ? library.state.books : [],
        reading = library?.reading ?? {}
      const clubs = (
        await client.query(
          `SELECT c.id,c.name,m.role,COALESCE(s.visibility,'private') AS visibility,
        EXISTS(SELECT 1 FROM club_memberships mine WHERE mine.club_id=c.id AND mine.user_id=$2 AND mine.status='active') AS shared
        FROM clubs c JOIN club_memberships m ON m.club_id=c.id LEFT JOIN club_settings s ON s.club_id=c.id
        WHERE m.user_id=$1 AND m.status='active' AND ($1=$2 OR EXISTS(SELECT 1 FROM club_memberships mine WHERE mine.club_id=c.id AND mine.user_id=$2 AND mine.status='active') OR ($3::boolean AND $4::boolean AND s.visibility='public'))
        ORDER BY c.created_at DESC,c.id DESC LIMIT 50`,
          [id, viewer, allowed, profile.showClubs],
        )
      ).rows
      return {
        ...profile,
        ...counts,
        avatarId: allowed || clubs.some((c) => c.shared) ? profile.avatarId : null,
        coverId: allowed ? profile.coverId : null,
        relation: profile.isSelf
          ? 'self'
          : profile.following
            ? 'following'
            : profile.requested
              ? 'requested'
              : profile.isPublic
                ? 'follow'
                : 'request',
        pendingRequests: profile.isSelf
          ? (
              await client.query(
                "SELECT count(*)::int AS n FROM follow_requests r JOIN profiles requester ON requester.user_id=r.requester_id WHERE target_id=$1 AND status='pending' AND NOT requester.suspended AND " +
                  notBlocked('requester_id', '$1'),
                [id],
              )
            ).rows[0].n
          : undefined,
        goal: allowed && profile.showStats ? profile.goal : null,
        library:
          allowed && profile.showLibrary
            ? books
                .slice(0, 100)
                .map((book: { id: string; title: string; author: string }) => ({
                  title: book.title,
                  author: book.author,
                  status:
                    reading[book.id]?.status ??
                    (reading[book.id]?.percent === 100
                      ? 'completed'
                      : reading[book.id]?.percent > 0
                        ? 'reading'
                        : 'want'),
                }))
            : [],
        stats:
          allowed && profile.showStats
            ? {
                books: books.length,
                completed: books.filter((book: { id: string }) => reading[book.id]?.percent === 100)
                  .length,
              }
            : null,
        clubs,
      }
    })
  }
  search(
    actor: UserProfile | null,
    input: { q?: string; genre?: string; limit: number; cursor?: string },
  ) {
    return transaction(this.pool, async (client) => {
      const cursor = decodeCursor(input.cursor)
      const { rows } = await client.query(
        `SELECT user_id AS id,handle,display_name AS "displayName",bio,genres,CASE WHEN (${visibleProfile('profiles.user_id', '$1')}) THEN avatar_id ELSE NULL END AS "avatarId",created_at::text AS "sortTime" FROM profiles WHERE NOT suspended AND (is_public OR ($1::uuid IS NOT NULL AND handle=$2)) AND ${notBlocked('user_id', '$1')} AND ($2::text IS NULL OR (display_name||' '||handle) ILIKE '%'||$2||'%') AND ($3::text IS NULL OR EXISTS(SELECT 1 FROM unnest(genres) genre WHERE lower(genre)=lower($3))) AND ($4::timestamptz IS NULL OR (created_at,user_id)<($4,$5::uuid)) ORDER BY created_at DESC,user_id DESC LIMIT $6`,
        [
          actor?.id ?? null,
          input.q?.replace(/^@/, '') ?? null,
          input.genre ?? null,
          cursor?.time ?? null,
          cursor?.id ?? null,
          input.limit + 1,
        ],
      )
      return pageOf(rows, input.limit)
    })
  }
  /**
   * Quem segue a pessoa (followers) ou quem ela segue (following). Só aparece quando o visitante pode ver
   * o conteúdo do perfil. A dona do perfil vê todas as conexões; visitantes, só as contas que também podem ver.
   * Contas bloqueadas (em qualquer direção) nunca aparecem.
   */
  connections(
    actor: UserProfile,
    id: string,
    kind: 'followers' | 'following',
    input: { limit: number; cursor?: string },
  ) {
    return transaction(this.pool, async (client) => {
      const target = await client.query(
        `SELECT 1 FROM profiles WHERE user_id=$1 AND NOT suspended AND ((${visibleProfile('profiles.user_id', '$2')}) OR user_id=$2)`,
        [id, actor.id],
      )
      if (!target.rowCount) throw publicMissing()
      const cursor = decodeCursor(input.cursor)
      const [self, other] = kind === 'followers' ? ['f.followed_id', 'f.follower_id'] : ['f.follower_id', 'f.followed_id']
      const { rows } = await client.query(
        `SELECT p.user_id AS id,p.handle,p.display_name AS "displayName",p.avatar_id AS "avatarId",
         EXISTS(SELECT 1 FROM follows mine WHERE mine.follower_id=$2 AND mine.followed_id=p.user_id) AS following,
         p.user_id=$2 AS "isSelf",f.created_at::text AS "sortTime"
         FROM follows f JOIN profiles p ON p.user_id=${other}
         WHERE ${self}=$1 AND NOT p.suspended AND (($1=$2 AND ${notBlocked('p.user_id', '$2')}) OR (${visibleProfile('p.user_id', '$2')})) AND ${notBlocked('p.user_id', '$1')}
         AND ($3::timestamptz IS NULL OR (f.created_at,p.user_id)<($3,$4::uuid))
         ORDER BY f.created_at DESC,p.user_id DESC LIMIT $5`,
        [id, actor.id, cursor?.time ?? null, cursor?.id ?? null, input.limit + 1],
      )
      return pageOf(rows, input.limit)
    })
  }
  follow(user: UserProfile, id: string, value: boolean) {
    return new FollowService(this.pool).follow(user, id, value)
  }
  block(user: UserProfile, id: string, value: boolean) {
    return transaction(this.pool, async (client) => {
      if (user.id === id) throw new HttpError(400, 'SELF_RELATION', 'Escolha outro leitor.')
      await lockPeople(client, user.id, id)
      if (!(await client.query('SELECT 1 FROM users WHERE id=$1', [id])).rowCount)
        throw publicMissing()
      if (value) {
        await client.query(
          "UPDATE follow_requests SET status='cancelled',resolved_at=now() WHERE ((requester_id=$1 AND target_id=$2) OR (requester_id=$2 AND target_id=$1)) AND status='pending'",
          [user.id, id],
        )
        await client.query(
          'INSERT INTO user_blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [user.id, id],
        )
        await client.query(
          'DELETE FROM follows WHERE (follower_id=$1 AND followed_id=$2) OR (follower_id=$2 AND followed_id=$1)',
          [user.id, id],
        )
      } else
        await client.query('DELETE FROM user_blocks WHERE blocker_id=$1 AND blocked_id=$2', [
          user.id,
          id,
        ])
      return { value }
    })
  }
  blocks(user: UserProfile, input: { limit: number; cursor?: string }) {
    return transaction(this.pool, async (client) => {
      const cursor = decodeCursor(input.cursor)
      const { rows } = await client.query(
        `SELECT b.blocked_id AS id,COALESCE(p.display_name,'Leitor') AS name,b.created_at::text AS "sortTime" FROM user_blocks b LEFT JOIN profiles p ON p.user_id=b.blocked_id WHERE b.blocker_id=$1 AND ($2::timestamptz IS NULL OR (b.created_at,b.blocked_id)<($2,$3::uuid)) ORDER BY b.created_at DESC,b.blocked_id DESC LIMIT $4`,
        [user.id, cursor?.time ?? null, cursor?.id ?? null, input.limit + 1],
      )
      return pageOf(rows, input.limit)
    })
  }
}
