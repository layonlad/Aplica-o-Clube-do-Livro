import {decodeCursor,pageOf} from './pagination.js'
import { assertCapability,can } from './permissions.js'
import { createHash, randomBytes } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import type { Identity } from './auth.js'
import type { Club, ClubDetails, CreatedInvite, Invite, Member, Session, UserProfile } from './contracts.js'
import { transaction } from './database.js'
import { forbidden, HttpError, invalidInvite } from './errors.js'

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
const inviteColumns = 'id, email, max_uses AS "maxUses", uses, expires_at AS "expiresAt", revoked_at AS "revokedAt", created_at AS "createdAt"'

async function audit(client: PoolClient, clubId: string, actor: string, action: string, entityId: string) {
  await client.query('INSERT INTO audit_logs (club_id, actor_user_id, action, entity_id) VALUES ($1, $2, $3, $4)', [clubId, actor, action, entityId])
}
// All membership-sensitive operations lock the club first, in the same order.
// Removal and invite redemption cannot race past a stale permission check.
export async function authorize(client: PoolClient, clubId: string, userId: string, ownerOnly = false, lock: 'update'|'share' = 'update'): Promise<Club> {
  await client.query(`SELECT id FROM clubs WHERE id = $1 FOR ${lock==='share'?'SHARE':'UPDATE'}`, [clubId])
  const { rows } = await client.query<Club>(`SELECT c.id, c.name, c.timezone, m.role FROM clubs c
    JOIN club_memberships m ON m.club_id = c.id WHERE c.id = $1 AND m.user_id = $2 AND m.status = 'active'`, [clubId, userId])
  const club = rows[0]
  if (!club || (ownerOnly && club.role !== 'owner')) throw forbidden()
  return club
}

export class ClubService {
  constructor(private pool: Pool) {}

  async syncUser(identity: Identity): Promise<UserProfile> {
    const { rows } = await this.pool.query<UserProfile>(`INSERT INTO users (firebase_uid, email, name) VALUES ($1, $2, $3)
      ON CONFLICT (firebase_uid) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, updated_at = now()
      RETURNING id, email, name`, [identity.uid, identity.email.toLowerCase(), (identity.name?.trim() || identity.email.split('@')[0]).slice(0, 100)])
    return rows[0]
  }

  async session(user: UserProfile): Promise<Session> {
    const { rows } = await this.pool.query<Club>(`SELECT c.id, c.name, c.timezone, m.role FROM clubs c
      JOIN club_memberships m ON m.club_id = c.id WHERE m.user_id = $1 AND m.status = 'active' ORDER BY c.created_at`, [user.id])
    return { user, clubs: rows }
  }

  async createClub(user: UserProfile, input: { name: string; timezone: string }): Promise<Club> {
    return transaction(this.pool, async (client) => {
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [user.id])
      const count = await client.query('SELECT count(*)::int AS count FROM clubs WHERE owner_user_id = $1', [user.id])
      if (count.rows[0].count >= 5) throw new HttpError(409, 'CLUB_LIMIT', 'Você já administra o limite de cinco clubes.')
      const { rows } = await client.query<Club>('INSERT INTO clubs (name, timezone, owner_user_id) VALUES ($1, $2, $3) RETURNING id, name, timezone', [input.name, input.timezone, user.id])
      const club = { ...rows[0], role: 'owner' as const }
      await client.query("INSERT INTO club_memberships (club_id, user_id, role) VALUES ($1, $2, 'owner')", [club.id, user.id])
      await audit(client, club.id, user.id, 'club.created', club.id)
      return club
    })
  }

  async details(user: UserProfile, clubId: string): Promise<ClubDetails> {
    return transaction(this.pool, async (client) => {
      const club = await authorize(client, clubId, user.id)
      const { rows } = await client.query<Member&{sortTime:string}>(`SELECT u.id, u.name, m.role, m.status,m.joined_at::text AS "sortTime" FROM club_memberships m JOIN users u ON u.id = m.user_id
        WHERE m.club_id = $1 AND ($2::boolean OR m.status = 'active') ORDER BY m.joined_at DESC,u.id DESC LIMIT 51`, [clubId, can(club.role,'manageMembers')])
      const page=pageOf(rows,50)
      const count=await client.query("SELECT count(*)::int AS count FROM club_memberships WHERE club_id=$1 AND status='active'",[clubId])
      return { club, members: page.items,membersNextCursor:page.nextCursor,memberCount:count.rows[0].count }
    })
  }

  async members(user:UserProfile,clubId:string,input:{limit:number;cursor?:string;q?:string}){
    return transaction(this.pool,async client=>{
      const club=await authorize(client,clubId,user.id,false,'share'),cursor=decodeCursor(input.cursor)
      const {rows}=await client.query<Member&{sortTime:string}>(`SELECT u.id,u.name,m.role,m.status,m.joined_at::text AS "sortTime" FROM club_memberships m JOIN users u ON u.id=m.user_id WHERE m.club_id=$1 AND ($2::boolean OR m.status='active') AND ($3::timestamptz IS NULL OR (m.joined_at,u.id)<($3,$4::uuid)) AND ($5::text IS NULL OR u.name ILIKE '%'||$5||'%') ORDER BY m.joined_at DESC,u.id DESC LIMIT $6`,[clubId,can(club.role,'manageMembers'),cursor?.time??null,cursor?.id??null,input.q??null,input.limit+1])
      return pageOf(rows,input.limit)
    })
  }

  async createInvite(user: UserProfile, clubId: string, input: { email?: string; maxUses: number; expiresInDays: number }): Promise<CreatedInvite> {
    return transaction(this.pool, async (client) => {
      assertCapability((await authorize(client, clubId, user.id)).role, 'invite')
      const token = randomBytes(32).toString('base64url')
      const { rows } = await client.query<Invite>(`INSERT INTO invites (club_id, created_by, email, token_hash, max_uses, expires_at)
        VALUES ($1, $2, $3, $4, $5, now() + $6 * interval '1 day') RETURNING ${inviteColumns}`,
      [clubId, user.id, input.email?.toLowerCase() ?? null, hashToken(token), input.maxUses, input.expiresInDays])
      await audit(client, clubId, user.id, 'invite.created', rows[0].id)
      return { ...rows[0], token }
    })
  }

  async listInvites(user: UserProfile, clubId: string): Promise<Invite[]> {
    return transaction(this.pool, async (client) => {
      assertCapability((await authorize(client, clubId, user.id)).role, 'invite')
      const { rows } = await client.query<Invite>(`SELECT ${inviteColumns} FROM invites WHERE club_id = $1 ORDER BY created_at DESC LIMIT 100`, [clubId])
      return rows
    })
  }

  async revokeInvite(user: UserProfile, clubId: string, inviteId: string) {
    return transaction(this.pool, async (client) => {
      assertCapability((await authorize(client, clubId, user.id)).role, 'invite')
      const result = await client.query('UPDATE invites SET revoked_at = COALESCE(revoked_at, now()) WHERE id = $1 AND club_id = $2 RETURNING id', [inviteId, clubId])
      if (!result.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Convite não encontrado neste clube.')
      await audit(client, clubId, user.id, 'invite.revoked', inviteId)
    })
  }

  async acceptInvite(user: UserProfile, token: string): Promise<Club> {
    return transaction(this.pool, async (client) => {
      const found = await client.query('SELECT club_id FROM invites WHERE token_hash = $1', [hashToken(token)])
      if (!found.rowCount) throw invalidInvite()
      const clubId = found.rows[0].club_id as string
      await client.query('SELECT id FROM clubs WHERE id = $1 FOR UPDATE', [clubId])
      const { rows: [invite] } = await client.query(`SELECT *, expires_at <= clock_timestamp() AS expired FROM invites WHERE token_hash = $1 FOR UPDATE`, [hashToken(token)])
      if (!invite || invite.revoked_at || invite.expired || (invite.email && invite.email !== user.email.toLowerCase())) throw invalidInvite()
      const { rows: [membership] } = await client.query('SELECT role, status FROM club_memberships WHERE club_id = $1 AND user_id = $2', [clubId, user.id])
      if (membership?.status === 'removed') throw new HttpError(403, 'MEMBERSHIP_REMOVED', 'Seu acesso foi removido. Peça ao responsável para reativá-lo.')
      const previous = await client.query('SELECT 1 FROM invite_acceptances WHERE invite_id = $1 AND user_id = $2', [invite.id, user.id])
      if (previous.rowCount && membership?.status === 'active') return authorize(client, clubId, user.id)
      if (membership) throw new HttpError(409, 'ALREADY_MEMBER', 'Você já participa deste clube.')
      if (invite.uses >= invite.max_uses) throw invalidInvite()
      await client.query("INSERT INTO club_memberships (club_id, user_id, role) VALUES ($1, $2, 'member')", [clubId, user.id])
      await client.query('INSERT INTO invite_acceptances (invite_id, club_id, user_id) VALUES ($1, $2, $3)', [invite.id, clubId, user.id])
      await client.query('UPDATE invites SET uses = uses + 1 WHERE id = $1', [invite.id])
      await audit(client, clubId, user.id, 'invite.accepted', invite.id)
      return authorize(client, clubId, user.id)
    })
  }

  async setMembership(user: UserProfile, clubId: string, targetId: string, status: 'active' | 'removed') {
    return transaction(this.pool, async (client) => {
      const actor = await authorize(client, clubId, user.id); assertCapability(actor.role,'manageMembers')
      const { rows: [target] } = await client.query('SELECT role FROM club_memberships WHERE club_id = $1 AND user_id = $2', [clubId, targetId])
      if (!target) throw new HttpError(404, 'NOT_FOUND', 'Membro não encontrado neste clube.')
      if (target.role === 'owner' || (actor.role!=='owner' && target.role==='admin')) throw new HttpError(409, 'OWNER_PROTECTED', 'O responsável pelo clube não pode ser removido.')
      await client.query("UPDATE club_memberships SET status = $3, removed_at = CASE WHEN $3 = 'removed' THEN now() ELSE NULL END WHERE club_id = $1 AND user_id = $2", [clubId, targetId, status])
      await audit(client, clubId, user.id, status === 'active' ? 'member.restored' : 'member.removed', targetId)
    })
  }
}
