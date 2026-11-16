import type { Pool, PoolClient } from 'pg'
import type { UserProfile } from './contracts.js'
import { transaction } from './database.js'
import { notBlocked, publicMissing, requireSocialProfile } from './public-policy.js'
import { HttpError } from './errors.js'
import { decodeCursor, pageOf } from './pagination.js'

/** Relation locks always precede profile/request locks, including blocking and decisions. */
export async function lockPeople(client: PoolClient, a: string, b: string) {
  await client.query('SELECT id FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [
    [a, b],
  ])
}
export class FollowService {
  constructor(private pool: Pool) {}
  follow(user: UserProfile, id: string, value: boolean) {
    if (user.id === id) throw new HttpError(400, 'SELF_RELATION', 'Escolha outro leitor.')
    return transaction(this.pool, async (client) => {
      await lockPeople(client, user.id, id)
      await client.query(
        'INSERT INTO profiles(user_id,handle,display_name) VALUES($1,$2,$3) ON CONFLICT(user_id) DO NOTHING',
        [
          user.id,
          'leitor_' + user.id.replaceAll('-', '').slice(0, 20),
          user.name.slice(0, 100) || 'Leitor',
        ],
      )
      if (value) await requireSocialProfile(client, user.id)
      const {
        rows: [profile],
      } = await client.query(
        `SELECT is_public FROM profiles WHERE user_id=$1 AND NOT suspended AND ${notBlocked('user_id', '$2')} FOR SHARE`,
        [id, user.id],
      )
      if (!profile) throw publicMissing()
      if (!value) {
        await client.query('DELETE FROM follows WHERE follower_id=$1 AND followed_id=$2', [
          user.id,
          id,
        ])
        await client.query(
          "UPDATE follow_requests SET status='cancelled',resolved_at=now() WHERE requester_id=$1 AND target_id=$2 AND status='pending'",
          [user.id, id],
        )
        return { value: false, state: profile.is_public ? 'follow' : 'request' }
      }
      if (
        (
          await client.query('SELECT 1 FROM follows WHERE follower_id=$1 AND followed_id=$2', [
            user.id,
            id,
          ])
        ).rowCount
      )
        return { value: true, state: 'following' }
      if (profile.is_public) {
        await client.query(
          'INSERT INTO follows(follower_id,followed_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [user.id, id],
        )
        await client.query(
          "UPDATE follow_requests SET status='accepted',resolved_at=now() WHERE requester_id=$1 AND target_id=$2 AND status='pending'",
          [user.id, id],
        )
        return { value: true, state: 'following' }
      }
      const { rows } = await client.query(
        `INSERT INTO follow_requests(requester_id,target_id) VALUES($1,$2)
         ON CONFLICT(requester_id,target_id) DO UPDATE SET id=gen_random_uuid(),status='pending',created_at=now(),resolved_at=NULL WHERE follow_requests.status<>'pending' RETURNING id`,
        [user.id, id],
      )
      if (rows[0])
        await client.query(
          "SELECT emit_notification($1,$2,NULL,'follow','profile',$2,NULL,'interactions',$3)",
          [id, user.id, 'follow-request:' + rows[0].id],
        )
      return { value: false, state: 'requested' }
    })
  }
  incoming(user: UserProfile, input: { limit: number; cursor?: string }) {
    return transaction(this.pool, async (client) => {
      const c = decodeCursor(input.cursor)
      const { rows } = await client.query(
        `SELECT r.id,r.requester_id AS "userId",pr.handle,pr.display_name AS name,r.created_at AS "createdAt",r.created_at::text AS "sortTime"
         FROM follow_requests r JOIN profiles pr ON pr.user_id=r.requester_id WHERE r.target_id=$1 AND r.status='pending' AND NOT pr.suspended AND ${notBlocked('r.requester_id', '$1')}
         AND ($2::timestamptz IS NULL OR (r.created_at,r.id)<($2,$3::uuid)) ORDER BY r.created_at DESC,r.id DESC LIMIT $4`,
        [user.id, c?.time ?? null, c?.id ?? null, input.limit + 1],
      )
      return pageOf(rows, input.limit)
    })
  }
  decide(user: UserProfile, id: string, approve: boolean) {
    return transaction(this.pool, async (client) => {
      const {
        rows: [candidate],
      } = await client.query(
        'SELECT requester_id FROM follow_requests WHERE id=$1 AND target_id=$2',
        [id, user.id],
      )
      if (!candidate) throw publicMissing()
      await lockPeople(client, user.id, candidate.requester_id)
      const {
        rows: [request],
      } = await client.query(
        `SELECT requester_id,status FROM follow_requests WHERE id=$1 AND target_id=$2 AND ${notBlocked('requester_id', '$2')} FOR UPDATE`,
        [id, user.id],
      )
      if (!request) throw publicMissing()
      if (request.status !== 'pending')
        throw new HttpError(409, 'REQUEST_CHANGED', 'Esta solicitação já foi resolvida.')
      if (
        !(
          await client.query('SELECT 1 FROM profiles WHERE user_id=ANY($1::uuid[]) AND suspended', [
            [user.id, request.requester_id],
          ])
        ).rowCount &&
        approve
      ) {
        await client.query(
          'INSERT INTO follows(follower_id,followed_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [request.requester_id, user.id],
        )
        await client.query(
          "SELECT emit_notification($1,$2,NULL,'follow','profile',$2,NULL,'interactions',$3)",
          [request.requester_id, user.id, 'follow-approved:' + id],
        )
      } else if (approve) throw publicMissing()
      await client.query('UPDATE follow_requests SET status=$2,resolved_at=now() WHERE id=$1', [
        id,
        approve ? 'accepted' : 'declined',
      ])
      return { state: approve ? 'accepted' : 'declined' }
    })
  }
}
