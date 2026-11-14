import type { Pool, PoolClient } from 'pg'
import type { UserProfile } from './contracts.js'
import { transaction } from './database.js'
import { decodeCursor, pageOf } from './pagination.js'
import { notBlocked, publicMissing, requirePublicProfile } from './public-policy.js'
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
    return transaction(this.pool, async (client) => {
      await client.query(
        'INSERT INTO profiles(user_id,handle,display_name) VALUES($1,$2,$3) ON CONFLICT(user_id) DO NOTHING',
        [user.id, 'leitor_' + user.id.replaceAll('-', '').slice(0, 20), 'Leitor'],
      )
      const {
        rows: [profile],
      } = await client.query('SELECT avatar_id FROM profiles WHERE user_id=$1 FOR UPDATE', [
        user.id,
      ])
      if (
        avatarId &&
        !(
          await client.query(
            "SELECT 1 FROM media_objects WHERE id=$1 AND owner_user_id=$2 AND club_id IS NULL AND kind='image' AND state='active' FOR SHARE",
            [avatarId, user.id],
          )
        ).rowCount
      )
        throw new HttpError(400, 'INVALID_MEDIA', 'Escolha uma foto sua preparada para o perfil.')
      await client.query(
        'UPDATE profiles SET avatar_id=$2,version=version+1,updated_at=now() WHERE user_id=$1',
        [user.id, avatarId],
      )
      const previous: string | null = profile.avatar_id
      if (previous && previous !== avatarId) {
        // A revogação é atômica com a troca: falhas na limpeza física nunca mantêm a foto acessível.
        await client.query(
          "UPDATE media_objects SET state='deleted',deleted_at=COALESCE(deleted_at,now()) WHERE id=$1 AND owner_user_id=$2 AND state='active'",
          [previous, user.id],
        )
        await client.query('UPDATE profiles SET cover_id=NULL WHERE user_id=$1 AND cover_id=$2', [
          user.id,
          previous,
        ])
      }
      return { avatarId, previous: previous && previous !== avatarId ? previous : null }
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
        `SELECT u.id,COALESCE(CASE WHEN pr.is_public THEN pr.display_name END,u.name) AS name,pr.avatar_id AS "avatarId",COALESCE(pr.is_public,false) AS "isPublic",
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
      const {
        rows: [profile],
      } = await client.query(
        `SELECT ${fields},EXISTS(SELECT 1 FROM follows WHERE follower_id=$2 AND followed_id=user_id) AS following,(SELECT count(*)::int FROM follows WHERE followed_id=user_id) AS followers,(SELECT count(*)::int FROM follows WHERE follower_id=user_id) AS follows FROM profiles WHERE user_id=$1 AND is_public AND ${notBlocked('user_id', '$2')}`,
        [id, actor?.id ?? null],
      )
      if (!profile) throw publicMissing()
      // Whitelisted metadata only: never return the JSON workspace or reading annotations.
      const library =
        profile.showLibrary || profile.showStats
          ? (
              await client.query('SELECT state,reading FROM personal_workspaces WHERE user_id=$1', [
                id,
              ])
            ).rows[0]
          : null
      const books = Array.isArray(library?.state?.books) ? library.state.books : []
      const reading = library?.reading ?? {}
      return {
        ...profile,
        goal: profile.showStats ? profile.goal : null,
        library: profile.showLibrary
          ? books.slice(0, 100).map((book: { id: string; title: string; author: string }) => ({
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
        stats: profile.showStats
          ? {
              books: books.length,
              completed: books.filter((book: { id: string }) => reading[book.id]?.percent === 100)
                .length,
            }
          : null,
        clubs: profile.showClubs
          ? (
              await client.query(
                "SELECT c.id,c.name FROM clubs c JOIN club_memberships m ON m.club_id=c.id JOIN club_settings s ON s.club_id=c.id WHERE m.user_id=$1 AND m.status='active' AND s.visibility='public' ORDER BY c.created_at DESC LIMIT 50",
                [id],
              )
            ).rows
          : [],
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
        `SELECT user_id AS id,handle,display_name AS "displayName",bio,genres,avatar_id AS "avatarId",created_at::text AS "sortTime" FROM profiles WHERE is_public AND ${notBlocked('user_id', '$1')} AND ($2::text IS NULL OR (display_name||' '||handle) ILIKE '%'||$2||'%') AND ($3::text IS NULL OR EXISTS(SELECT 1 FROM unnest(genres) genre WHERE lower(genre)=lower($3))) AND ($4::timestamptz IS NULL OR (created_at,user_id)<($4,$5::uuid)) ORDER BY created_at DESC,user_id DESC LIMIT $6`,
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
  follow(user: UserProfile, id: string, value: boolean) {
    return transaction(this.pool, async (client) => {
      if (user.id === id) throw new HttpError(400, 'SELF_RELATION', 'Escolha outro leitor.')
      await requirePublicProfile(client, user.id)
      if (
        !(
          await client.query(
            `SELECT 1 FROM profiles WHERE user_id=$1 AND is_public AND ${notBlocked('user_id', '$2')} FOR SHARE`,
            [id, user.id],
          )
        ).rowCount
      )
        throw publicMissing()
      if (value)
        await client.query(
          'INSERT INTO follows(follower_id,followed_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [user.id, id],
        )
      else
        await client.query('DELETE FROM follows WHERE follower_id=$1 AND followed_id=$2', [
          user.id,
          id,
        ])
      return { value }
    })
  }
  block(user: UserProfile, id: string, value: boolean) {
    return transaction(this.pool, async (client) => {
      if (user.id === id) throw new HttpError(400, 'SELF_RELATION', 'Escolha outro leitor.')
      if (!(await client.query('SELECT 1 FROM users WHERE id=$1', [id])).rowCount)
        throw publicMissing()
      if (value) {
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
