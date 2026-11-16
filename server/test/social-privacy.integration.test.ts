import { beforeAll, afterAll, it, expect } from 'vitest'
import sharp from 'sharp'
import { testDatabase } from './database.js'
import { buildApp } from '../src/app.js'
let db: Awaited<ReturnType<typeof testDatabase>>, app: Awaited<ReturnType<typeof buildApp>>
const ids: Record<string, string> = {},
  objects = new Map<string, Buffer>()
let address = 0,
  postId: string,
  mediaId: string,
  clubA: string,
  clubB: string
const call = (uid: string, path: string, method = 'GET', payload?: Record<string, unknown>) =>
  app.inject({
    url: '/v1' + path,
    method: method as 'GET' | 'POST' | 'DELETE',
    headers: uid ? { authorization: 'Bearer ' + uid } : {},
    payload,
    remoteAddress: '127.0.1.' + (++address % 250),
  })
async function privacy(isPublic: boolean, uid = 'ana') {
  const p = (await call(uid, '/me/profile')).json(),
    { id, suspended, ...edit } = p
  const r = await call(uid, '/me/profile', 'POST', { ...edit, isPublic, showClubs: true })
  expect(r.statusCode, r.body).toBe(200)
}
beforeAll(async () => {
  db = await testDatabase()
  app = await buildApp({
    pool: db.pool,
    origin: 'https://club.example',
    rateMax: 5000,
    storage: {
      put: async (k, b) => void objects.set(k, b),
      get: async (k) => {
        if (!objects.has(k)) throw Error('missing')
        return objects.get(k)!
      },
      remove: async (k) => void objects.delete(k),
    },
    verifyToken: async (uid) => ({
      uid,
      email: uid + '@example.invalid',
      name: uid,
      emailVerified: true,
    }),
  })
  for (const uid of ['ana', 'bruno', 'carla', 'davi']) {
    ids[uid] = (await call(uid, '/me')).json().user.id
    await call(uid, '/me/profile')
  }
  clubA = (await call('ana', '/clubs', 'POST', { name: 'Clube A confidencial' })).json().id
  clubB = (await call('ana', '/clubs', 'POST', { name: 'Clube B confidencial' })).json().id
  await db.pool.query("INSERT INTO club_memberships(club_id,user_id,role) VALUES($1,$2,'member')", [
    clubA,
    ids.carla,
  ])
  for (const club of [clubA, clubB])
    expect(
      (
        await call('ana', `/clubs/${club}/posts`, 'POST', {
          kind: 'reflection',
          body: 'Segredo de ' + club,
        })
      ).statusCode,
    ).toBe(201)
  const bytes = await sharp({
    create: { width: 48, height: 64, channels: 3, background: '#462b70' },
  })
    .jpeg()
    .toBuffer()
  const media = await call('ana', '/public/media', 'POST', {
    kind: 'image',
    data: bytes.toString('base64'),
  })
  expect(media.statusCode, media.body).toBe(201)
  mediaId = media.json().id
  const p = await call('ana', '/public/posts', 'POST', {
    kind: 'reflection',
    body: 'Apenas seguidores',
    mediaIds: [mediaId],
  })
  expect(p.statusCode, p.body).toBe(201)
  postId = p.json().id
  expect(
    (
      await call('ana', `/public/posts/${postId}/comments`, 'POST', {
        body: 'Comentário protegido',
      })
    ).statusCode,
  ).toBe(201)
})
afterAll(async () => {
  await app?.close()
  await db?.close()
})
it('perfil privado tem cartão mínimo autenticado, sem conteúdo, contagens, mídia ou clubes secretos', async () => {
  const p = (await call('bruno', '/public/profiles/' + ids.ana)).json()
  expect(p).toMatchObject({
    canSeeContent: false,
    posts: null,
    followers: null,
    clubs: [],
    library: [],
    coverId: null,
  })
  expect((await call('', '/public/profiles/' + ids.ana)).statusCode).toBe(404)
  expect((await call('bruno', '/public/posts/' + postId)).statusCode).toBe(404)
  expect((await call('bruno', '/public/media/' + mediaId + '/content')).statusCode).toBe(404)
  expect((await call('bruno', `/people/${ids.ana}/activity`)).json().items).toEqual([])
})
it('solicita uma vez, só o dono decide; aprovação libera conteúdo pessoal, nunca clubes', async () => {
  const pair = await Promise.all([
    call('bruno', `/public/profiles/${ids.ana}/follow`, 'POST', { value: true }),
    call('bruno', `/public/profiles/${ids.ana}/follow`, 'POST', { value: true }),
  ])
  for (const r of pair) expect(r.json().state).toBe('requested')
  const pending = (await call('ana', '/me/follow-requests')).json()
  expect(pending.items).toHaveLength(1)
  const id = pending.items[0].id
  expect(
    (await call('bruno', '/me/follow-requests/' + id, 'POST', { decision: 'approve' })).statusCode,
  ).toBe(404)
  const notices = (await call('ana', '/me/notifications')).json()
  expect(notices.items.some((n: { followAction: string }) => n.followAction === 'request')).toBe(
    true,
  )
  expect(
    (await call('ana', '/me/follow-requests/' + id, 'POST', { decision: 'approve' })).statusCode,
  ).toBe(200)
  expect((await call('bruno', '/public/posts/' + postId)).statusCode).toBe(200)
  expect((await call('bruno', '/public/media/' + mediaId + '/content')).statusCode).toBe(200)
  await privacy(true, 'bruno')
  expect(
    (
      await call('bruno', `/public/posts/${postId}/share`, 'POST', {
        body: 'Não deve copiar conteúdo privado',
      })
    ).statusCode,
  ).toBe(404)
  await privacy(false, 'bruno')
  expect((await call('bruno', `/public/posts/${postId}/comments`)).json().items).toHaveLength(1)
  const profile = (await call('bruno', '/public/profiles/' + ids.ana)).json()
  expect(profile).toMatchObject({ following: true, canSeeContent: true, clubs: [] })
  expect((await call('bruno', `/people/${ids.ana}/club-posts`)).json().items).toEqual([])
  const activity = await call('bruno', `/people/${ids.ana}/activity`)
  expect(activity.statusCode, activity.body).toBe(200)
  expect(activity.body).not.toContain(clubA)
  expect(activity.body).not.toContain(clubB)
  expect(activity.json().items.some((a: { kind: string }) => a.kind === 'post')).toBe(true)
  expect([403, 404]).toContain((await call('bruno', `/clubs/${clubA}/posts`)).statusCode)
  const own = (await call('ana', `/people/${ids.ana}/activity?limit=1`)).json()
  expect(own.items).toHaveLength(1)
  expect(own.nextCursor).toBeTruthy()
  const next = (
    await call('ana', `/people/${ids.ana}/activity?limit=1&cursor=${own.nextCursor}`)
  ).json()
  expect(next.items[0].id).not.toBe(own.items[0].id)
  const peer = await call('carla', `/people/${ids.ana}/activity`)
  expect(peer.body).toContain(clubA)
  expect(peer.body).not.toContain(clubB)
  expect(peer.body).not.toContain('Apenas seguidores')
  const clubs = (await call('carla', '/public/profiles/' + ids.ana)).json().clubs
  expect(clubs.map((c: { id: string }) => c.id)).toEqual([clubA])
})
it('leituras salvas usam apenas a conta autenticada e projetam metadados, sem arquivo nem anotação', async () => {
  const ws = (await call('ana', '/me/workspace')).json()
  const added = await call('ana', '/me/workspace', 'POST', {
    version: ws.version,
    action: {
      type: 'book.add',
      title: 'Favorito privado',
      author: 'Autora de teste',
      category: '',
      content: 'Texto particular do livro',
    },
  })
  expect(added.statusCode, added.body).toBe(200)
  const book = added.json().state.books[0]
  expect(
    (
      await call('ana', '/me/workspace', 'POST', {
        version: added.json().version,
        action: { type: 'reading.update', id: book.id, favorite: true, bookmark: 0 },
      })
    ).statusCode,
  ).toBe(200)
  const saved = await call('ana', '/me/profile/reading-saved')
  expect(saved.statusCode, saved.body).toBe(200)
  expect(saved.json().items).toEqual([
    {
      id: book.id,
      title: book.title,
      author: book.author,
      favorite: true,
      hasBookmark: true,
      noteCount: 0,
    },
  ])
  expect(saved.body).not.toContain('Texto particular')
  expect((await call('bruno', '/me/profile/reading-saved')).json().items).toEqual([])
  expect((await call('bruno', '/me/profile/reading-saved?userId=' + ids.ana)).statusCode).toBe(400)
  expect((await call('', '/me/profile/reading-saved')).statusCode).toBe(401)
})
it('salvos só do titular e bloqueio revoga relação, conteúdos, atividades e mídia', async () => {
  expect(
    (await call('bruno', `/public/posts/${postId}/save`, 'POST', { value: true })).statusCode,
  ).toBe(200)
  expect((await call('bruno', '/me/profile/saved')).json().items).toHaveLength(1)
  expect((await call('carla', '/me/profile/saved')).json().items).toEqual([])
  expect((await call('carla', '/me/profile/saved?userId=' + ids.bruno)).statusCode).toBe(400)
  expect(
    (await call('ana', `/public/profiles/${ids.bruno}/block`, 'POST', { value: true })).statusCode,
  ).toBe(200)
  for (const path of [
    '/public/profiles/' + ids.ana,
    '/public/posts/' + postId,
    '/public/media/' + mediaId + '/content',
    `/people/${ids.ana}/activity`,
  ])
    expect((await call('bruno', path)).statusCode).toBe(404)
  expect((await call('bruno', '/me/profile/saved')).json().items).toEqual([])
  await call('ana', `/public/profiles/${ids.bruno}/block`, 'POST', { value: false })
  expect((await call('bruno', '/public/profiles/' + ids.ana)).json().following).toBe(false)
})
it('recusa, cancelamento e ações concorrentes não aprovam seguidores por engano', async () => {
  await call('bruno', `/public/profiles/${ids.ana}/follow`, 'POST', { value: true })
  let request = (await call('ana', '/me/follow-requests')).json().items[0]
  expect(
    (await call('ana', '/me/follow-requests/' + request.id, 'POST', { decision: 'decline' }))
      .statusCode,
  ).toBe(200)
  expect((await call('bruno', '/public/profiles/' + ids.ana)).json().following).toBe(false)
  await call('bruno', `/public/profiles/${ids.ana}/follow`, 'POST', { value: true })
  request = (await call('ana', '/me/follow-requests')).json().items[0]
  await call('bruno', `/public/profiles/${ids.ana}/follow`, 'POST', { value: false })
  expect(
    (await call('ana', '/me/follow-requests/' + request.id, 'POST', { decision: 'approve' }))
      .statusCode,
  ).toBe(409)
  expect((await call('bruno', '/public/posts/' + postId)).statusCode).toBe(404)
})
it('perfil público permite seguir imediatamente; mudar para privado preserva aprovados e username é único', async () => {
  await privacy(true)
  expect(
    (await call('davi', `/public/profiles/${ids.ana}/follow`, 'POST', { value: true })).json()
      .state,
  ).toBe('following')
  await privacy(false)
  expect((await call('davi', '/public/profiles/' + ids.ana)).json()).toMatchObject({
    following: true,
    canSeeContent: true,
  })
  const p = (await call('bruno', '/me/profile')).json(),
    { id, suspended, ...edit } = p,
    ana = (await call('ana', '/me/profile')).json()
  const conflict = await call('bruno', '/me/profile', 'POST', { ...edit, handle: ana.handle })
  expect(conflict.statusCode).toBe(409)
  expect(conflict.json().error.code).toBe('HANDLE_TAKEN')
})
it('perfil suspenso não envia novas solicitações nem ganha relação com perfis públicos', async () => {
  const suspended = (await call('suspenso', '/me')).json().user.id
  await call('suspenso', '/me/profile')
  await db.pool.query('UPDATE profiles SET suspended=true WHERE user_id=$1', [suspended])
  for (const isPublic of [false, true]) {
    await privacy(isPublic)
    const denied = await call('suspenso', `/public/profiles/${ids.ana}/follow`, 'POST', {
      value: true,
    })
    expect(denied.statusCode, denied.body).toBe(403)
  }
  expect(
    (await db.pool.query('SELECT 1 FROM follows WHERE follower_id=$1', [suspended])).rowCount,
  ).toBe(0)
  expect(
    (await db.pool.query('SELECT 1 FROM follow_requests WHERE requester_id=$1', [suspended]))
      .rowCount,
  ).toBe(0)
  await privacy(false)
})

it('descoberta e contador de comentários não revelam comentários de perfil privado', async () => {
  await call('autor-aberto', '/me/profile')
  await privacy(true, 'autor-aberto')
  const post = await call('autor-aberto', '/public/posts', 'POST', {
    kind: 'reflection',
    body: 'Discussão aberta de teste',
  })
  expect(post.statusCode, post.body).toBe(201)
  const id = post.json().id
  expect(
    (
      await call('bruno', `/public/posts/${id}/comments`, 'POST', {
        body: 'Comentário pessoal protegido',
      })
    ).statusCode,
  ).toBe(201)
  for (const viewer of ['', 'carla']) {
    expect((await call(viewer, '/public/posts/' + id)).json().comments).toBe(0)
    const discover = (await call(viewer, '/public/discover')).json()
    const item = Object.values(
      discover.sections as Record<string, { id: string; comments: number }[]>,
    )
      .flat()
      .find((p) => p.id === id)
    expect(item?.comments).toBe(0)
  }
  expect((await call('bruno', '/public/posts/' + id)).json().comments).toBe(1)
})
