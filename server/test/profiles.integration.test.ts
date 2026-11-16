import { afterAll, beforeAll, expect, it } from 'vitest'
import sharp from 'sharp'
import { buildApp } from '../src/app.js'
import { testDatabase } from './database.js'
import type { Club, Session } from '../src/contracts.js'
import type { Page, PostDto } from '../src/community-contracts.js'
import { ProfileService } from '../src/profile-service.js'

// Cenário da regra de privacidade: Maria participa dos clubes A e B; João só do A.
let db: Awaited<ReturnType<typeof testDatabase>>,
  app: Awaited<ReturnType<typeof buildApp>>,
  clubA: Club,
  clubB: Club
let avatarRequest = 10
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
      await app.inject({
        url: '/v1/clubs',
        method: 'POST',
        headers: headers('maria'),
        payload: { name },
      })
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
    remoteAddress: '127.0.0.' + ++avatarRequest,
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
    remoteAddress: '127.0.0.' + ++avatarRequest,
    url: '/v1/me/avatar',
    method: 'POST',
    headers: headers('maria'),
    payload: { data: Buffer.from('não é uma imagem').toString('base64') },
  })
  expect(invalid.statusCode).toBe(400)
  expect(
    (await app.inject({ url: '/v1/me/profile', headers: headers('maria') })).json().avatarId,
  ).toBe(avatarId)
})

it('atualiza a foto em publicações antigas e revoga a foto anterior', async () => {
  const before = (await app.inject({ url: '/v1/me/profile', headers: headers('maria') })).json()
    .avatarId as string
  const id = await post('maria', clubA, 'Publicação feita antes da troca de foto')
  const replaced = await app.inject({
    remoteAddress: '127.0.0.' + ++avatarRequest,
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

  const removed = await app.inject({
    remoteAddress: '127.0.0.' + ++avatarRequest,
    url: '/v1/me/avatar',
    method: 'DELETE',
    headers: headers('maria'),
  })
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
  expect((await app.inject({ url: '/v1/me/appearance', headers: headers('joao') })).json()).toEqual(
    { appearance: null },
  )
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
  expect((await app.inject({ url: '/v1/me/appearance', headers: headers('joao') })).json()).toEqual(
    { appearance },
  )
  expect(
    (await app.inject({ url: '/v1/me/appearance', headers: headers('maria') })).json(),
  ).toEqual({ appearance: null })
})

it('revoga a foto na mesma transação mesmo antes da limpeza física', async () => {
  const user = (await app.inject({ url: '/v1/me', headers: headers('maria') })).json<Session>().user
  const uploaded = await app.inject({
    remoteAddress: '127.0.0.' + ++avatarRequest,
    url: '/v1/me/avatar',
    method: 'POST',
    headers: headers('maria'),
    payload: { data: await photo() },
  })
  const id = uploaded.json().avatarId
  await new ProfileService(db.pool).setAvatar(user, null)
  expect(
    (await db.pool.query('SELECT state FROM media_objects WHERE id=$1', [id])).rows[0].state,
  ).toBe('deleted')
  expect((await avatarContent(id, 'maria')).statusCode).toBe(404)
  expect((await avatarContent(id, 'joao')).statusCode).toBe(404)
  await expect(new ProfileService(db.pool).setAvatar(user, id)).rejects.toMatchObject({
    code: 'INVALID_MEDIA',
  })
})

it('não inclui publicações de clube quando o autor deixou de participar', async () => {
  await post('joao', clubA, 'Post de quem saiu do clube')
  await db.pool.query(
    "UPDATE club_memberships SET status='removed',removed_at=now() WHERE club_id=$1 AND user_id=$2",
    [clubA.id, ids.joao],
  )
  try {
    const response = await app.inject({
      url: `/v1/people/${ids.joao}/club-posts`,
      headers: headers('maria'),
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().items).toEqual([])
    expect(response.body).not.toContain(clubA.id)
  } finally {
    await db.pool.query(
      "UPDATE club_memberships SET status='active',removed_at=NULL WHERE club_id=$1 AND user_id=$2",
      [clubA.id, ids.joao],
    )
  }
})

it('respeita bloqueio nas duas direções no cartão, foto e posts compartilhados', async () => {
  const uploaded = await app.inject({
    remoteAddress: '127.0.0.' + ++avatarRequest,
    url: '/v1/me/avatar',
    method: 'POST',
    headers: headers('maria'),
    payload: { data: await photo() },
  })
  const id = uploaded.json().avatarId
  for (const [blocker, blocked] of [
    [ids.maria, ids.joao],
    [ids.joao, ids.maria],
  ]) {
    await db.pool.query('INSERT INTO user_blocks(blocker_id,blocked_id) VALUES($1,$2)', [
      blocker,
      blocked,
    ])
    try {
      expect((await avatarContent(id, 'joao')).statusCode).toBe(404)
      expect(
        (await app.inject({ url: `/v1/people/${ids.maria}`, headers: headers('joao') })).statusCode,
      ).toBe(404)
      expect(
        (
          await app.inject({ url: `/v1/people/${ids.maria}/club-posts`, headers: headers('joao') })
        ).json().items,
      ).toEqual([])
    } finally {
      await db.pool.query('DELETE FROM user_blocks WHERE blocker_id=$1 AND blocked_id=$2', [
        blocker,
        blocked,
      ])
    }
  }
})

it('aplica a cota ao avatar e não reativa perfil suspenso', async () => {
  const before = (await app.inject({ url: '/v1/me/profile', headers: headers('maria') })).json()
  await db.pool.query('UPDATE profiles SET suspended=true,is_public=false WHERE user_id=$1', [
    ids.maria,
  ])
  const uploaded = await app.inject({
    remoteAddress: '127.0.0.' + ++avatarRequest,
    url: '/v1/me/avatar',
    method: 'POST',
    headers: headers('maria'),
    payload: { data: await photo() },
  })
  expect(uploaded.statusCode, uploaded.body).toBe(201)
  const profile = (await app.inject({ url: '/v1/me/profile', headers: headers('maria') })).json()
  expect(profile.suspended).toBe(true)
  expect(profile.isPublic).toBe(false)
  expect((await avatarContent(profile.avatarId, 'estranho')).statusCode).toBe(404)
  expect(
    (
      await app.inject({
        url: '/v1/me/profile',
        method: 'POST',
        headers: headers('maria'),
        payload: {
          ...before,
          version: profile.version,
          isPublic: true,
          id: undefined,
          suspended: undefined,
        },
      })
    ).statusCode,
  ).toBe(403)
  const quotaObjects = await db.pool.query(
    `INSERT INTO media_objects(owner_user_id,object_key,thumbnail_key,kind,mime_type,byte_size,thumbnail_size,width,height,state)
    SELECT $1,'quota-'||n,'quota-thumb-'||n,'image','image/webp',10000000,1,8,8,'active' FROM generate_series(1,5) n RETURNING id`,
    [ids.maria],
  )
  try {
    const overQuota = await app.inject({
      remoteAddress: '127.0.0.' + ++avatarRequest,
      url: '/v1/me/avatar',
      method: 'POST',
      headers: headers('maria'),
      payload: { data: await photo() },
    })
    expect(overQuota.statusCode, overQuota.body).toBe(409)
    expect(overQuota.json().error.code).toBe('MEDIA_QUOTA')
  } finally {
    await db.pool.query("UPDATE media_objects SET state='purged' WHERE id=ANY($1::uuid[])", [
      quotaObjects.rows.map((row) => row.id),
    ])
  }
})

it('mostra a foto e o nome público atuais de quem gerou a notificação no clube', async () => {
  const {
    id: profileId,
    suspended,
    ...profile
  } = (await app.inject({ url: '/v1/me/profile', headers: headers('maria') })).json()
  const renamed = await app.inject({
    url: '/v1/me/profile',
    headers: headers('maria'),
    method: 'POST',
    payload: { ...profile, displayName: 'Maria Leitora' },
  })
  expect(renamed.statusCode, renamed.body).toBe(200)
  const uploaded = await app.inject({
    remoteAddress: '127.0.0.' + ++avatarRequest,
    url: '/v1/me/avatar',
    method: 'POST',
    headers: headers('maria'),
    payload: { data: await photo('#2b7552') },
  })
  const { avatarId } = uploaded.json<{ avatarId: string }>()
  const id = await post('joao', clubA, 'Alguém quer trocar impressões sobre o final?')
  const comment = await app.inject({
    url: `/v1/clubs/${clubA.id}/posts/${id}/comments`,
    method: 'POST',
    headers: headers('maria'),
    payload: { body: 'Eu quero! Amanhã?' },
  })
  expect(comment.statusCode, comment.body).toBe(201)
  const notices = (
    await app.inject({ url: '/v1/me/notifications', headers: headers('joao') })
  ).json<Page<{ actorName: string; actorAvatarId: string | null }>>()
  const fromMaria = notices.items.find((item) => item.actorAvatarId === avatarId)
  expect(fromMaria?.actorName).toBe('Maria Leitora')
  const comments = (
    await app.inject({
      url: `/v1/clubs/${clubA.id}/posts/${id}/comments`,
      headers: headers('joao'),
    })
  ).json()
  expect(comments.items[0].author.name).toBe('Maria Leitora')
  expect(JSON.stringify(notices)).not.toMatch(/@example.com|object_key/)
})

it('salva a capa na hora, aceita GIF animado e só a mostra com perfil público', async () => {
  const frame = (color: string) =>
    sharp({ create: { width: 800, height: 250, channels: 3, background: color } })
      .png()
      .toBuffer()
  const gif = await sharp([await frame('#462b70'), await frame('#b9e6c9')], {
    join: { animated: true },
  })
    .gif({ delay: [150, 150] })
    .toBuffer()
  await db.pool.query('UPDATE profiles SET is_public=false,suspended=false WHERE user_id=$1', [
    ids.joao,
  ])
  const first = await app.inject({
    remoteAddress: '127.0.0.' + ++avatarRequest,
    url: '/v1/me/cover',
    method: 'POST',
    headers: headers('joao'),
    payload: { data: (await frame('#fc7667')).toString('base64') },
  })
  expect(first.statusCode, first.body).toBe(201)
  const firstId = first.json<{ coverId: string }>().coverId
  expect(
    (await app.inject({ url: '/v1/me/profile', headers: headers('joao') })).json().coverId,
  ).toBe(firstId)
  // Perfil privado: a capa fica guardada, mas não é entregue a quem não é o dono.
  expect((await avatarContent(firstId, 'joao')).statusCode).toBe(200)
  expect((await avatarContent(firstId, 'estranho')).statusCode).toBe(404)

  const animated = await app.inject({
    remoteAddress: '127.0.0.' + ++avatarRequest,
    url: '/v1/me/cover',
    method: 'POST',
    headers: headers('joao'),
    payload: { data: gif.toString('base64') },
  })
  expect(animated.statusCode, animated.body).toBe(201)
  const gifId = animated.json<{ coverId: string }>().coverId
  expect((await avatarContent(firstId, 'joao')).statusCode).toBe(404)
  const profile = (await app.inject({ url: '/v1/me/profile', headers: headers('joao') })).json()
  expect(profile.coverId).toBe(gifId)

  // Salvar o restante do perfil depois de trocar a capa não pode dar conflito de versão.
  const { id: _id, suspended: _s, ...input } = profile
  const saved = await app.inject({
    url: '/v1/me/profile',
    method: 'POST',
    headers: headers('joao'),
    payload: { ...input, isPublic: true },
  })
  expect(saved.statusCode, saved.body).toBe(200)
  expect((await avatarContent(gifId, 'estranho')).statusCode).toBe(200)

  const removed = await app.inject({
    url: '/v1/me/cover',
    method: 'DELETE',
    headers: headers('joao'),
  })
  expect(removed.json()).toEqual({ coverId: null })
  expect((await avatarContent(gifId, 'estranho')).statusCode).toBe(404)
})
