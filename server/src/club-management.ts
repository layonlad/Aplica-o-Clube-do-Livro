import type { Pool } from 'pg'
import type { Role, UserProfile } from './contracts.js'
import { transaction } from './database.js'
import { authorize } from './service.js'
import { HttpError } from './errors.js'
import { assertCapability } from './permissions.js'
import { decodeCursor, pageOf } from './pagination.js'
export interface ClubSettings {
  name: string
  description: string
  visibility: 'private' | 'discoverable' | 'public'
  accent: string
  version: number
  coverMediaId?: string | null
  coverIsPublic?: boolean
}
const missing = () => new HttpError(404, 'NOT_FOUND', 'Este recurso não está disponível.')
export class ClubManagement {
  constructor(private pool: Pool) {}
  async discover(input: { q?: string; limit: number; cursor?: string }) {
    const cursor = decodeCursor(input.cursor)
    const { rows } = await this.pool.query(
      `SELECT c.id,c.name,s.description,s.visibility,s.accent,CASE WHEN s.cover_is_public THEN s.cover_media_id ELSE NULL END AS "coverMediaId",c.created_at AS "createdAt",c.created_at::text AS "sortTime"
      FROM clubs c JOIN club_settings s ON s.club_id=c.id WHERE s.visibility<>'private'
      AND ($1::text IS NULL OR (c.name||' '||s.description) ILIKE '%'||$1||'%')
      AND ($2::timestamptz IS NULL OR (c.created_at,c.id)<($2,$3::uuid)) ORDER BY c.created_at DESC,c.id DESC LIMIT $4`,
      [input.q ?? null, cursor?.time ?? null, cursor?.id ?? null, input.limit + 1],
    )
    return pageOf(rows, input.limit)
  }
  settings(user: UserProfile, clubId: string) {
    return transaction(this.pool, async (client) => {
      const club = await authorize(client, clubId, user.id, false, 'share')
      const {
        rows: [settings],
      } = await client.query(
        'SELECT description,visibility,accent,version,cover_media_id AS "coverMediaId",cover_is_public AS "coverIsPublic" FROM club_settings WHERE club_id=$1',
        [clubId],
      )
      return {
        name: club.name,
        description: '',
        visibility: 'private',
        accent: '#6e477c',
        version: 0,
        ...settings,
      } as ClubSettings
    })
  }
  updateSettings(user: UserProfile, clubId: string, input: ClubSettings) {
    return transaction(this.pool, async (client) => {
      const club = await authorize(client, clubId, user.id)
      assertCapability(club.role, 'configure')
      await client.query('INSERT INTO club_settings(club_id) VALUES($1) ON CONFLICT DO NOTHING', [
        clubId,
      ])
      if (
        input.coverMediaId &&
        !(
          await client.query(
            "SELECT 1 FROM media_objects WHERE id=$1 AND club_id=$2 AND owner_user_id=$3 AND kind='image' AND state='active' FOR SHARE",
            [input.coverMediaId, clubId, user.id],
          )
        ).rowCount
      ) {
        const existing = await client.query(
          'SELECT 1 FROM club_settings WHERE club_id=$1 AND cover_media_id=$2',
          [clubId, input.coverMediaId],
        )
        if (!existing.rowCount)
          throw new HttpError(400, 'INVALID_COVER', 'Prepare uma foto sua enviada para este clube.')
      }
      const updated = await client.query(
        `UPDATE club_settings SET description=$2,visibility=$3,accent=$4,version=version+1,updated_at=now(),cover_media_id=CASE WHEN $8::boolean THEN $6::uuid ELSE cover_media_id END,cover_is_public=CASE WHEN $3='private' THEN false ELSE COALESCE($7,cover_is_public) END WHERE club_id=$1 AND version=$5 RETURNING version,cover_media_id AS "coverMediaId",cover_is_public AS "coverIsPublic"`,
        [
          clubId,
          input.description,
          input.visibility,
          input.accent,
          input.version,
          input.coverMediaId ?? null,
          input.coverIsPublic ?? null,
          input.coverMediaId !== undefined,
        ],
      )
      if (!updated.rowCount)
        throw new HttpError(
          409,
          'CLUB_CHANGED',
          'As configurações mudaram. Atualize a página antes de salvar.',
        )
      await client.query('UPDATE clubs SET name=$2 WHERE id=$1', [clubId, input.name])
      await client.query(
        "INSERT INTO audit_logs(club_id,actor_user_id,action,entity_id) VALUES($1,$2,'club.settings.updated',$1)",
        [clubId, user.id],
      )
      return { ...input, ...updated.rows[0] }
    })
  }
  setRole(user: UserProfile, clubId: string, targetId: string, role: Exclude<Role, 'owner'>) {
    return transaction(this.pool, async (client) => {
      const club = await authorize(client, clubId, user.id)
      assertCapability(club.role, 'assignRoles')
      const {
        rows: [target],
      } = await client.query(
        'SELECT role,status FROM club_memberships WHERE club_id=$1 AND user_id=$2',
        [clubId, targetId],
      )
      if (!target || target.status !== 'active') throw missing()
      if (target.role === 'owner')
        throw new HttpError(
          409,
          'OWNER_PROTECTED',
          'O papel do proprietário não pode ser alterado aqui.',
        )
      await client.query('UPDATE club_memberships SET role=$3 WHERE club_id=$1 AND user_id=$2', [
        clubId,
        targetId,
        role,
      ])
      await client.query(
        'INSERT INTO audit_logs(club_id,actor_user_id,action,entity_id) VALUES($1,$2,$3,$4)',
        [clubId, user.id, 'member.role.' + role, targetId],
      )
    })
  }
  leave(user: UserProfile, clubId: string) {
    return transaction(this.pool, async (client) => {
      const club = await authorize(client, clubId, user.id)
      if (club.role === 'owner')
        throw new HttpError(
          409,
          'OWNER_PROTECTED',
          'O proprietário precisa manter acesso ao clube.',
        )
      await client.query(
        "UPDATE club_memberships SET status='removed',removed_at=now() WHERE club_id=$1 AND user_id=$2",
        [clubId, user.id],
      )
      await client.query(
        "INSERT INTO audit_logs(club_id,actor_user_id,action,entity_id) VALUES($1,$2,'member.left',$2)",
        [clubId, user.id],
      )
    })
  }
  requestJoin(user: UserProfile, clubId: string, message: string) {
    return transaction(this.pool, async (client) => {
      await client.query('SELECT id FROM clubs WHERE id=$1 FOR UPDATE', [clubId])
      const settings = await client.query(
        "SELECT 1 FROM club_settings WHERE club_id=$1 AND visibility<>'private'",
        [clubId],
      )
      if (!settings.rowCount) throw missing()
      const {
        rows: [member],
      } = await client.query(
        'SELECT status FROM club_memberships WHERE club_id=$1 AND user_id=$2',
        [clubId, user.id],
      )
      if (member)
        throw new HttpError(
          409,
          'MEMBERSHIP_EXISTS',
          member.status === 'active'
            ? 'Você já participa deste clube.'
            : 'Peça à administração para reativar seu acesso.',
        )
      const {
        rows: [previous],
      } = await client.query(
        'SELECT status FROM club_join_requests WHERE club_id=$1 AND user_id=$2',
        [clubId, user.id],
      )
      if (previous && previous.status !== 'cancelled')
        throw new HttpError(
          409,
          'REQUEST_EXISTS',
          previous.status === 'pending'
            ? 'Sua solicitação já está em análise.'
            : 'Esta solicitação já foi analisada. Entre em contato com a administração.',
        )
      const {
        rows: [row],
      } = await client.query(
        "INSERT INTO club_join_requests(club_id,user_id,message) VALUES($1,$2,$3) ON CONFLICT(club_id,user_id) DO UPDATE SET message=EXCLUDED.message,status='pending',reviewed_at=NULL,reviewed_by=NULL,created_at=now() RETURNING id,status",
        [clubId, user.id, message],
      )
      return row
    })
  }
  requests(user: UserProfile, clubId: string, input: { limit: number; cursor?: string }) {
    return transaction(this.pool, async (client) => {
      const club = await authorize(client, clubId, user.id)
      assertCapability(club.role, 'manageMembers')
      const cursor = decodeCursor(input.cursor)
      const { rows } = await client.query(
        `SELECT r.id,u.id AS "userId",u.name,r.message,r.created_at AS "createdAt",r.created_at::text AS "sortTime" FROM club_join_requests r JOIN users u ON u.id=r.user_id WHERE r.club_id=$1 AND r.status='pending' AND ($2::timestamptz IS NULL OR (r.created_at,r.id)<($2,$3::uuid)) ORDER BY r.created_at DESC,r.id DESC LIMIT $4`,
        [clubId, cursor?.time ?? null, cursor?.id ?? null, input.limit + 1],
      )
      return pageOf(rows, input.limit)
    })
  }
  review(user: UserProfile, clubId: string, id: string, decision: 'approved' | 'rejected') {
    return transaction(this.pool, async (client) => {
      const club = await authorize(client, clubId, user.id)
      assertCapability(club.role, 'manageMembers')
      const {
        rows: [request],
      } = await client.query(
        "SELECT user_id FROM club_join_requests WHERE id=$1 AND club_id=$2 AND status='pending' FOR UPDATE",
        [id, clubId],
      )
      if (!request) throw missing()
      if (decision === 'approved') {
        const existing = await client.query(
          'SELECT 1 FROM club_memberships WHERE club_id=$1 AND user_id=$2',
          [clubId, request.user_id],
        )
        if (existing.rowCount)
          throw new HttpError(
            409,
            'MEMBERSHIP_EXISTS',
            'Esta pessoa já tem um vínculo com o clube. Confira os participantes.',
          )
        await client.query(
          "INSERT INTO club_memberships(club_id,user_id,role) VALUES($1,$2,'member')",
          [clubId, request.user_id],
        )
      }
      await client.query(
        'UPDATE club_join_requests SET status=$3,reviewed_by=$4,reviewed_at=now() WHERE id=$1 AND club_id=$2',
        [id, clubId, decision, user.id],
      )
      await client.query(
        'INSERT INTO audit_logs(club_id,actor_user_id,action,entity_id) VALUES($1,$2,$3,$4)',
        [clubId, user.id, 'join-request.' + decision, id],
      )
      return { status: decision }
    })
  }
}
