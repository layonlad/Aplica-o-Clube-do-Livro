import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { HttpError } from '../src/errors.js'
import { hashToken } from '../src/service.js'
import { migrate } from '../src/migrations.js'
import { testDatabase } from './database.js'
import type { Club, CreatedInvite, Session } from '../src/contracts.js'

let db: Awaited<ReturnType<typeof testDatabase>>
let app: Awaited<ReturnType<typeof buildApp>>
let owner: Session
let club: Club
const identity = (uid: string) => ({ uid, email: `${uid}@example.com`, emailVerified: uid !== 'unverified', name: uid })
const headers = (uid = 'owner') => ({ authorization: `Bearer ${uid}` })
async function createInvite(input: Record<string, unknown> = {}, clubId = club.id) {
  const response = await app.inject({ method: 'POST', url: `/v1/clubs/${clubId}/invites`, headers: headers(), payload: input })
  expect(response.statusCode).toBe(201)
  return response.json<CreatedInvite>()
}
const addresses = new Map<string, string>()
async function accept(token: string, uid: string) {
  if (!addresses.has(uid)) addresses.set(uid, `127.0.0.${addresses.size + 2}`)
  return app.inject({ method: 'POST', url: '/v1/invites/accept', headers: headers(uid), payload: { token }, remoteAddress: addresses.get(uid) })
}

beforeAll(async () => {
  db = await testDatabase()
  app = await buildApp({ pool: db.pool, origin: 'https://club.example', rateMax: 1000, verifyToken: async (token) => {
    if (token === 'invalid') throw new HttpError(401, 'INVALID_SESSION', 'Inválida')
    return identity(token)
  } })
  owner = (await app.inject({ url: '/v1/me', headers: headers() })).json()
  const response = await app.inject({ method: 'POST', url: '/v1/clubs', headers: headers(), payload: { name: 'Clube real' } })
  expect(response.statusCode).toBe(201)
  club = response.json()
})
afterAll(async () => { await app?.close(); await db?.close() })

describe('API com PostgreSQL real', () => {
  it('recusa acesso anônimo, token inválido e e-mail não confirmado', async () => {
    expect((await app.inject({ url: '/v1/me' })).statusCode).toBe(401)
    expect((await app.inject({ url: '/v1/me', headers: headers('invalid') })).statusCode).toBe(401)
    expect((await app.inject({ url: '/v1/me', headers: headers('unverified') })).json().error.code).toBe('EMAIL_NOT_VERIFIED')
    expect((await db.pool.query("SELECT 1 FROM users WHERE firebase_uid = 'unverified'")).rowCount).toBe(0)
  })
  it('persiste clube, proprietário e auditoria; migrations são reaplicáveis', async () => {
    await migrate(db.pool)
    const session = (await app.inject({ url: '/v1/me', headers: headers() })).json<Session>()
    expect(session.clubs).toContainEqual({ ...club })
    expect((await db.pool.query("SELECT action FROM audit_logs WHERE club_id = $1", [club.id])).rows[0].action).toBe('club.created')
    await expect(db.pool.query('UPDATE audit_logs SET action = $1', ['tampered'])).rejects.toThrow('append-only')
  })
  it('não permite acessar outro clube, administrar como membro ou promover papel pelo payload', async () => {
    const invite = await createInvite()
    expect((await accept(invite.token, 'member')).statusCode).toBe(200)
    expect((await app.inject({ url: `/v1/clubs/${club.id}`, headers: headers('outsider') })).statusCode).toBe(403)
    expect((await app.inject({ url: `/v1/clubs/${club.id}/invites`, headers: headers('member') })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: `/v1/clubs/${club.id}/invites`, headers: headers('member'), payload: {} })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: '/v1/invites/accept', headers: headers('outsider'), payload: { token: invite.token, role: 'owner' } })).statusCode).toBe(400)
  })
  it('armazena somente hash e não expõe segredo ou hash nas listagens', async () => {
    const invite = await createInvite({ maxUses: 2 })
    const stored = (await db.pool.query('SELECT * FROM invites WHERE id = $1', [invite.id])).rows[0]
    expect(stored.token_hash).toBe(hashToken(invite.token))
    expect(JSON.stringify(stored)).not.toContain(invite.token)
    const list = await app.inject({ url: `/v1/clubs/${club.id}/invites`, headers: headers() })
    expect(list.body).not.toContain(invite.token)
    expect(list.body).not.toContain(stored.token_hash)
    expect(list.headers['cache-control']).toBe('no-store')
  })
  it('reserva convite por e-mail e consome um único uso mesmo em reenvio', async () => {
    const invite = await createInvite({ email: 'Target@Example.com' })
    expect((await accept(invite.token, 'wrong')).statusCode).toBe(400)
    expect((await accept(invite.token, 'target')).statusCode).toBe(200)
    expect((await accept(invite.token, 'target')).statusCode).toBe(200)
    expect((await db.pool.query('SELECT uses FROM invites WHERE id = $1', [invite.id])).rows[0].uses).toBe(1)
  })
  it('impede que duas pessoas consumam o último uso simultaneamente', async () => {
    const invite = await createInvite()
    const results = await Promise.all([accept(invite.token, 'race1'), accept(invite.token, 'race2')])
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400])
    expect((await db.pool.query('SELECT count(*)::int AS count FROM invite_acceptances WHERE invite_id = $1', [invite.id])).rows[0].count).toBe(1)
  })
  it('recusa convites revogados e expirados', async () => {
    const revoked = await createInvite()
    expect((await app.inject({ method: 'DELETE', url: `/v1/clubs/${club.id}/invites/${revoked.id}`, headers: headers() })).statusCode).toBe(204)
    expect((await accept(revoked.token, 'revoked')).statusCode).toBe(400)
    const expired = await createInvite()
    await db.pool.query("UPDATE invites SET created_at = now() - interval '2 days', expires_at = now() - interval '1 day' WHERE id = $1", [expired.id])
    expect((await accept(expired.token, 'expired')).statusCode).toBe(400)
  })
  it('revoga acesso do membro imediatamente e bloqueia retorno por convite', async () => {
    const invite = await createInvite({ maxUses: 2 })
    await accept(invite.token, 'removable')
    const member = (await app.inject({ url: '/v1/me', headers: headers('removable') })).json<Session>().user
    expect((await app.inject({ method: 'DELETE', url: `/v1/clubs/${club.id}/members/${member.id}`, headers: headers() })).statusCode).toBe(204)
    expect((await app.inject({ url: `/v1/clubs/${club.id}`, headers: headers('removable') })).statusCode).toBe(403)
    expect((await accept(invite.token, 'removable')).json().error.code).toBe('MEMBERSHIP_REMOVED')
    expect((await app.inject({ url: '/v1/me', headers: headers('removable') })).json<Session>().clubs).toEqual([])
    expect((await app.inject({ method: 'POST', url: `/v1/clubs/${club.id}/members/${member.id}/restore`, headers: headers() })).statusCode).toBe(204)
    expect((await app.inject({ url: `/v1/clubs/${club.id}`, headers: headers('removable') })).statusCode).toBe(200)
  })
  it('protege o proprietário e mantém as mutações restritas ao clube correto', async () => {
    expect((await app.inject({ method: 'DELETE', url: `/v1/clubs/${club.id}/members/${owner.user.id}`, headers: headers() })).json().error.code).toBe('OWNER_PROTECTED')
    const other = (await app.inject({ method: 'POST', url: '/v1/clubs', headers: headers(), payload: { name: 'Segundo clube' } })).json<Club>()
    const invite = await createInvite()
    expect((await app.inject({ method: 'DELETE', url: `/v1/clubs/${other.id}/invites/${invite.id}`, headers: headers() })).statusCode).toBe(404)
    expect((await app.inject({ method: 'DELETE', url: `/v1/clubs/${club.id}/members/${randomUUID()}`, headers: headers() })).statusCode).toBe(404)
  })
  it('valida limites e impede armazenar múltiplos usos em convite por e-mail', async () => {
    for (const payload of [{ maxUses: 51 }, { expiresInDays: 0 }, { email: 'a@example.com', maxUses: 2 }, { role: 'owner' }]) {
      expect((await app.inject({ method: 'POST', url: `/v1/clubs/${club.id}/invites`, headers: headers(), payload })).statusCode).toBe(400)
    }
    expect((await app.inject({ method: 'POST', url: '/v1/clubs', headers: headers(), payload: { name: 'Oi', timezone: 'Invalid/Zone' } })).statusCode).toBe(400)
  })
  it('aplica CORS exato e limite de requisições', async () => {
    const limited = await buildApp({ pool: db.pool, origin: 'https://club.example', rateMax: 2, verifyToken: async () => identity('rate') })
    try {
      const result = await limited.inject({ url: '/v1/me', headers: { ...headers(), origin: 'https://evil.example' } })
      expect(result.headers['access-control-allow-origin']).not.toBe('https://evil.example')
      await limited.inject({ url: '/v1/me', headers: headers() })
      expect((await limited.inject({ url: '/v1/me', headers: headers() })).statusCode).toBe(429)
    } finally { await limited.close() }
  })
})
