import { beforeAll, afterAll, it, expect } from 'vitest'
import { testDatabase } from './database.js'
import { buildApp } from '../src/app.js'
let db: Awaited<ReturnType<typeof testDatabase>>,
  app: Awaited<ReturnType<typeof buildApp>>,
  clubId: string
const ids: Record<string, string> = {}
const call = (
  path: string,
  uid = 'notice-owner',
  method = 'GET',
  payload?: Record<string, unknown>,
) =>
  app.inject({
    url: '/v1' + path,
    headers: { authorization: 'Bearer ' + uid },
    method: method as 'GET' | 'POST' | 'DELETE',
    payload,
  })
const notices = async (uid = 'notice-owner') => {
  const response = await call('/me/notifications', uid)
  expect(response.statusCode, response.body).toBe(200)
  return response.json<{
    items: { id: string; kind: string; targetId: string }[]
    nextCursor: string | null
  }>()
}
beforeAll(async () => {
  db = await testDatabase()
  app = await buildApp({
    pool: db.pool,
    origin: 'https://club.example',
    rateMax: 2000,
    verifyToken: async (uid) => ({
      uid,
      email: uid + '@example.com',
      name: uid,
      emailVerified: true,
    }),
  })
  for (const uid of ['notice-owner', 'notice-member', 'notice-outsider'])
    ids[uid] = (await call('/me', uid)).json().user.id
  clubId = (await call('/clubs', undefined, 'POST', { name: 'Notificações privadas' })).json().id
  await db.pool.query("INSERT INTO club_memberships(club_id,user_id,role) VALUES($1,$2,'member')", [
    clubId,
    ids['notice-member'],
  ])
})
afterAll(async () => {
  await app?.close()
  await db?.close()
})
it('notifica uma vez, persiste leitura e preferências e revoga avisos junto com o recurso privado', async () => {
  const id = (
    await call(`/clubs/${clubId}/posts`, undefined, 'POST', {
      kind: 'reflection',
      body: 'Conversa privada',
    })
  ).json().id
  for (let i = 0; i < 2; i++)
    expect(
      (await call(`/clubs/${clubId}/posts/${id}/like`, 'notice-member', 'POST', { value: true }))
        .statusCode,
    ).toBe(200)
  const first = await notices()
  expect(first.items.filter((n) => n.kind === 'like' && n.targetId === id)).toHaveLength(1)
  expect((await notices('notice-outsider')).items).toEqual([])
  expect((await call('/me/notifications/unread')).json().count).toBe(1)
  expect(
    (await call('/me/notifications/read', undefined, 'POST', { id: first.items[0].id })).statusCode,
  ).toBe(200)
  expect((await call('/me/notifications/unread')).json().count).toBe(0)
  const prefs = (await call('/me/notification-preferences')).json()
  await call('/me/notification-preferences', undefined, 'POST', { ...prefs, interactions: false })
  expect((await notices()).items).toHaveLength(0)
  await call('/me/notification-preferences', undefined, 'POST', prefs)
  await call(`/clubs/${clubId}/posts/${id}`, undefined, 'DELETE')
  expect((await notices()).items.some((n) => n.targetId === id)).toBe(false)
  const topic = (
    await call(`/clubs/${clubId}/forum/topics`, undefined, 'POST', {
      title: 'Debate',
      body: 'Uma pergunta para o grupo',
    })
  ).json().id
  expect((await notices('notice-member')).items.some((n) => n.targetId === topic)).toBe(true)
  await call(`/clubs/${clubId}/members/${ids['notice-member']}`, undefined, 'DELETE')
  expect((await notices('notice-member')).items.some((n) => n.targetId === topic)).toBe(false)
})
it('entrega convite somente ao e-mail verificado e permite aceitá-lo sem expor o segredo', async () => {
  const invite = (
    await call(`/clubs/${clubId}/invites`, undefined, 'POST', {
      email: 'notice-outsider@example.com',
    })
  ).json()
  expect(invite.id).toBeTruthy()
  const inbox = await notices('notice-outsider')
  expect(inbox.items.some((n) => n.targetId === invite.id && n.kind === 'invitation')).toBe(true)
  expect(JSON.stringify(inbox)).not.toContain(invite.token)
  expect(
    (await call(`/me/invitations/${invite.id}/accept`, 'notice-member', 'POST', {})).statusCode,
  ).toBe(400)
  expect(
    (await call(`/me/invitations/${invite.id}/accept`, 'notice-outsider', 'POST', {})).statusCode,
  ).toBe(200)
  expect(
    (await call(`/me/invitations/${invite.id}/accept`, 'notice-outsider', 'POST', {})).statusCode,
  ).toBe(200)
  expect(
    (await db.pool.query('SELECT uses FROM invites WHERE id=$1', [invite.id])).rows[0].uses,
  ).toBe(1)
  expect((await notices('notice-outsider')).items.some((n) => n.targetId === invite.id)).toBe(false)
})
it('oculta notificações públicas depois de bloqueio e de perfil privado, sem revelar o corpo do conteúdo', async () => {
  for (const [uid, handle] of [
    ['notice-owner', 'dono'],
    ['notice-outsider', 'visitante'],
  ]) {
    const { id, suspended, ...profile } = (await call('/me/profile', uid)).json()
    await call('/me/profile', uid, 'POST', { ...profile, handle, isPublic: true })
  }
  const post = (
    await call('/public/posts', undefined, 'POST', {
      kind: 'reflection',
      body: 'Texto que não deve ir para o aviso @visitante',
    })
  ).json().id
  const inbox = await notices('notice-outsider')
  expect(inbox.items.some((n) => n.kind === 'mention' && n.targetId === post)).toBe(true)
  expect(JSON.stringify(inbox)).not.toContain('Texto que não')
  await call(`/public/profiles/${ids['notice-owner']}/block`, 'notice-outsider', 'POST', {
    value: true,
  })
  expect((await notices('notice-outsider')).items.some((n) => n.targetId === post)).toBe(false)
  await call(`/public/profiles/${ids['notice-owner']}/block`, 'notice-outsider', 'POST', {
    value: false,
  })
  const { id, suspended, ...profile } = (await call('/me/profile')).json()
  await call('/me/profile', undefined, 'POST', { ...profile, isPublic: false })
  expect((await notices('notice-outsider')).items.some((n) => n.targetId === post)).toBe(false)
})
it('notifica menção em comentário e oculta a identidade do autor quando seu perfil fica privado', async () => {
  const { id, suspended, ...owner } = (await call('/me/profile')).json()
  await call('/me/profile', undefined, 'POST', { ...owner, isPublic: true })
  const post = (
    await call('/public/posts', undefined, 'POST', {
      kind: 'reflection',
      body: 'Uma conversa pública',
    })
  ).json().id
  const comment = await call(`/public/posts/${post}/comments`, undefined, 'POST', {
    body: 'Uma pergunta para @visitante',
  })
  expect(comment.statusCode, comment.body).toBe(201)
  expect(
    (await notices('notice-outsider')).items.some(
      (n) => n.kind === 'mention' && n.targetId === post,
    ),
  ).toBe(true)
  const { id: _, suspended: __, ...updated } = (await call('/me/profile')).json()
  await call('/me/profile', undefined, 'POST', { ...updated, isPublic: false })
  expect((await notices('notice-outsider')).items.some((n) => n.targetId === post)).toBe(false)
})
it('entrega na central um convite dirigido antes do primeiro acesso da conta', async () => {
  const invitation = (
    await call(`/clubs/${clubId}/invites`, undefined, 'POST', {
      email: 'notice-newcomer@example.com',
    })
  ).json()
  expect(invitation.id).toBeTruthy()
  const list = await notices('notice-newcomer')
  expect(list.items.some((n) => n.kind === 'invitation' && n.targetId === invitation.id)).toBe(true)
  expect(
    (await call(`/me/invitations/${invitation.id}/accept`, 'notice-newcomer', 'POST', {}))
      .statusCode,
  ).toBe(200)
})
