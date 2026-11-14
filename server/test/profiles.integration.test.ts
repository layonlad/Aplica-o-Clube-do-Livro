import { afterAll, beforeAll, expect, it } from 'vitest'
import sharp from 'sharp'
import { buildApp } from '../src/app.js'
import { testDatabase } from './database.js'
import type { Club, Session } from '../src/contracts.js'
import type { Page, PostDto } from '../src/community-contracts.js'

// Cenário da regra de privacidade: Maria participa dos clubes A e B; João só do A.
let db: Awaited<ReturnType<typeof testDatabase>>,
  app: Awaited<ReturnType<typeof buildApp>>,
  clubA: Club,
  clubB: Club
const ids: Record<string, string> = {},
  objects = new Map<string, Buffer>()
const storage = {
  put: async (key: string, bytes: Buffer) => void objects.set(key, bytes),
  get: async (key: string) => {
    if (!objects.has(key)) throw Error('missing')
    return objects.get(key)!
  },
  remove: async (key: string) => void objects.delete(key),
}
const headers = (uid: string) => ({ authorization: `Bearer ${uid}` })
const photo = async (color = '#462b70') =>
  (
    await sharp({ create: { width: 64, height: 64, channels: 3, background: color } })
      .jpeg()
      .toBuffer()
  ).toString('base64')
const post = async (uid: string, club: Club, body: string) => {
  const response = await app.inject({
    url: `/v1/clubs/${club.id}/posts`,
    method: 'POST',
    headers: headers(uid),
    payload: { kind: 'reflection', body },
  })
  expect(response.statusCode, response.body).toBe(201)
  return response.json<{ id: string }>().id
}
const avatarContent = (id: string, uid?: string) =>
  app.inject({ url: `/v1/public/media/${id}/content`, headers: uid ? headers(uid) : {} })

beforeAll(async () => {
  db = await testDatabase()
  app = await buildApp({
    pool: db.pool,
    storage,
    origin: 'https://club.example',
    rateMax: 2000,
    verifyToken: async (uid) => ({
      uid,
      email: uid + '@example.com',
      name: uid,
      emailVerified: true,
    }),
  })
  for (const uid of ['maria', 'joao', 'estranho'])
    ids[uid] = (await app.inject({ url: '/v1/me', headers: headers(uid) })).json<Session>().user.id
  const create = async (name: string) =>
    (
      await app.inject({ url: '/v1/clubs', method: 'POST', headers: headers('maria'), payload: { name } })
    ).json<Club>()
  clubA = await create('Clube A')
  clubB = await create('Clube B')
  await db.pool.query("INSERT INTO club_memberships(club_id,user_id,role) VALUES($1,$2,'member')", [
    clubA.id,
    ids.joao,
  ])
})
afterAll(async () => {
  await app?.close()
  await db?.close()
})

it('permite foto de perfil sem perfil público e a mostra só a quem compartilha clube', async () => {
  const uploaded = await app.inject({
    url: '/v1/me/avatar',
    method: 'POST',
    headers: headers('maria'),
    payload: { data: await photo() },
  })
  expect(uploaded.statusCode, uploaded.body).toBe(201)
  const { avatarId } = uploaded.json<{ avatarId: string }>()
  const profile = (await app.inject({ url: '/v1/me/profile', headers: headers('maria') })).json()
  expect(profile.isPublic).toBe(false)
  expect(profile.avatarId).toBe(avatarId)

  expect((await avatarContent(avatarId, 'maria')).statusCode).toBe(200)
  expect((await avatarContent(avatarId, 'joao')).statusCode).toBe(200)
  expect((await avatarContent(avatarId, 'estranho')).statusCode).toBe(404)
  expect((await avatarContent(avatarId)).statusCode).toBe(404)

  const invalid = await app.inject({
    url: '/v1/me/avatar',
    method: 'POST',
    headers: headers('maria'),
    payload: { data: Buffer.from('não é uma imagem').toString('base64') },
  })
  expect(invalid.statusCode).toBe(400)
  expect((await app.inject({ url: '/v1/me/profile', headers: headers('maria') })).json().avatarId).toBe(
    avatarId,
  )
})

it('atualiza a foto em publicações antigas e revoga a foto anterior', async () => {
  const before = (await app.inject({ url: '/v1/me/profile', headers: headers('maria') })).json()
    .avatarId as string
  const id = await post('maria', clubA, 'Publicação feita antes da troca de foto')
  const replaced = await app.inject({
    url: '/v1/me/avatar',
    method: 'POST',
    headers: headers('maria'),
    payload: { data: await photo('#fc7667') },
  })
  expect(replaced.statusCode, replaced.body).toBe(201)
  const after = replaced.json<{ avatarId: string }>().avatarId
  expect(after).not.toBe(before)
  const dto = (
    await app.inject({ url: `/v1/clubs/${clubA.id}/posts/${id}`, headers: headers('joao') })
  ).json<PostDto>()
  expect(dto.author.avatarId).toBe(after)
  expect((await avatarContent(before, 'maria')).statusCode).toBe(404)

  const members = (
    await app.inject({ url: `/v1/clubs/${clubA.id}/members`, headers: headers('joao') })
  ).json<Page<{ id: string; avatarId: string | null }>>()
  expect(members.items.find((member) => member.id === ids.maria)?.avatarId).toBe(after)

  const removed = await app.inject({ url: '/v1/me/avatar', method: 'DELETE', headers: headers('maria') })
  expect(removed.json()).toEqual({ avatarId: null })
  expect((await avatarContent(after, 'joao')).statusCode).toBe(404)
  const again = (
    await app.inject({ url: `/v1/clubs/${clubA.id}/posts/${id}`, headers: headers('joao') })
  ).json<PostDto>()
  expect(again.author.avatarId).toBeNull()
})

it('mostra no perfil só as publicações de clubes que o visitante também frequenta', async () => {
  await post('maria', clubA, 'Conversa aberta ao Clube A')
  await post('maria', clubB, 'Segredo do Clube B')

  const card = await app.inject({ url: `/v1/people/${ids.maria}`, headers: headers('joao') })
  expect(card.statusCode, card.body).toBe(200)
  expect(card.json().sharedClubs).toEqual([{ id: clubA.id, name: 'Clube A' }])
  expect(card.body).not.toContain('Clube B')

  const shared = await app.inject({
    url: `/v1/people/${ids.maria}/club-posts`,
    headers: headers('joao'),
  })
  expect(shared.statusCode).toBe(200)
  const items = shared.json<Page<PostDto & { club: { id: string; name: string } }>>().items
  expect(items.length).toBeGreaterThan(0)
  expect(items.every((item) => item.club.id === clubA.id)).toBe(true)
  expect(shared.body).not.toContain('Segredo do Clube B')
  expect(shared.body).not.toContain(clubB.id)

  // Quem não compartilha clube não descobre nem o perfil privado nem as publicações.
  expect(
    (await app.inject({ url: `/v1/people/${ids.maria}`, headers: headers('estranho') })).statusCode,
  ).toBe(404)
  const outsider = await app.inject({
    url: `/v1/people/${ids.maria}/club-posts`,
    headers: headers('estranho'),
  })
  expect(outsider.json<Page<PostDto>>().items).toEqual([])
  expect((await app.inject({ url: `/v1/people/${ids.maria}/club-posts` })).statusCode).toBe(401)

  // Ao sair do clube, João perde o acesso imediatamente.
  await db.pool.query(
    "UPDATE club_memberships SET status='removed',removed_at=now() WHERE club_id=$1 AND user_id=$2",
    [clubA.id, ids.joao],
  )
  expect(
    (
      await app.inject({ url: `/v1/people/${ids.maria}/club-posts`, headers: headers('joao') })
    ).json<Page<PostDto>>().items,
  ).toEqual([])
  await db.pool.query(
    "UPDATE club_memberships SET status='active',removed_at=NULL WHERE club_id=$1 AND user_id=$2",
    [clubA.id, ids.joao],
  )
})

it('salva a aparência na conta e a preserva nas ações do espaço pessoal', async () => {
  const appearance = {
    preset: 'azul',
    mode: 'dark',
    accent: null,
    headingFont: 'playfair',
    bodyFont: 'inter',
    radius: 'soft',
  }
  expect(
    (await app.inject({ url: '/v1/me/appearance', headers: headers('joao') })).json(),
  ).toEqual({ appearance: null })
  const saved = await app.inject({
    url: '/v1/me/appearance',
    method: 'POST',
    headers: headers('joao'),
    payload: { appearance },
  })
  expect(saved.statusCode, saved.body).toBe(200)
  const invalid = await app.inject({
    url: '/v1/me/appearance',
    method: 'POST',
    headers: headers('joao'),
    payload: { appearance: { ...appearance, accent: 'red; background:url(x)' } },
  })
  expect(invalid.statusCode).toBe(400)

  const workspace = (await app.inject({ url: '/v1/me/workspace', headers: headers('joao') })).json()
  const action = await app.inject({
    url: '/v1/me/workspace',
    method: 'POST',
    headers: headers('joao'),
    payload: { action: { type: 'shelf.add', name: 'Clássicos' }, version: workspace.version },
  })
  expect(action.statusCode, action.body).toBe(200)
  expect(
    (await app.inject({ url: '/v1/me/appearance', headers: headers('joao') })).json(),
  ).toEqual({ appearance })
  expect(
    (await app.inject({ url: '/v1/me/appearance', headers: headers('maria') })).json(),
  ).toEqual({ appearance: null })
})
