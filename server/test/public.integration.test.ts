import { beforeAll, afterAll, it, expect } from 'vitest'
import sharp from 'sharp'
import { testDatabase } from './database.js'
import { buildApp } from '../src/app.js'
import type { PostDto, Page } from '../src/community-contracts.js'
let db: Awaited<ReturnType<typeof testDatabase>>, app: Awaited<ReturnType<typeof buildApp>>
const ids: Record<string, string> = {},
  objects = new Map<string, Buffer>()
const headers = (uid = 'public-alice') => ({ authorization: `Bearer ${uid}` })
const call = (url: string, uid?: string, method = 'GET', payload?: Record<string, unknown>) =>
  app.inject({
    url: '/v1' + url,
    headers: uid ? headers(uid) : {},
    method: method as 'POST' | 'GET' | 'DELETE',
    payload,
  })
const profile = async (uid: string, changes: Record<string, unknown> = {}) => {
  const current = (await call('/me/profile', uid)).json()
  const { id, suspended, ...input } = current
  const response = await call('/me/profile', uid, 'POST', { ...input, isPublic: true, ...changes })
  expect(response.statusCode, response.body).toBe(200)
  return id as string
}
const post = async (uid = 'public-alice', changes: Record<string, unknown> = {}) => {
  const response = await call('/public/posts', uid, 'POST', {
    kind: 'reflection',
    body: 'Páginas #literatura @bob',
    ...changes,
  })
  expect(response.statusCode, response.body).toBe(201)
  return response.json<{ id: string }>().id
}
beforeAll(async () => {
  db = await testDatabase()
  app = await buildApp({
    pool: db.pool,
    origin: 'https://club.example',
    moderatorUids: ['public-mod'],
    rateMax: 2000,
    storage: {
      put: async (key, bytes) => {
        objects.set(key, bytes)
      },
      get: async (key) => objects.get(key)!,
      remove: async (key) => {
        objects.delete(key)
      },
    },
    verifyToken: async (uid) => ({
      uid,
      email: uid + '@private.example',
      name: 'Nome privado ' + uid,
      emailVerified: true,
    }),
  })
  for (const uid of ['public-alice', 'public-bob', 'public-carol', 'public-mod'])
    ids[uid] = (await call('/me', uid)).json().user.id
})
afterAll(async () => {
  await app?.close()
  await db?.close()
})
it('exige opt-in, publica somente o nome escolhido e revalida privacidade sem expor a biblioteca pessoal', async () => {
  const mine = (await call('/me/profile', 'public-alice')).json()
  expect(mine.isPublic).toBe(false)
  expect(
    (
      await call('/public/posts', 'public-alice', 'POST', {
        kind: 'reflection',
        body: 'Privada por padrão',
      })
    ).statusCode,
  ).toBe(403)
  await profile('public-alice', { handle: 'alice', displayName: 'Alice leitora' })
  await profile('public-bob', { handle: 'bob', displayName: 'Bob leitor' })
  await profile('public-carol', { handle: 'carol', displayName: 'Carol leitora' })
  const id = await post()
  const read = await call('/public/posts/' + id)
  expect(read.statusCode, read.body).toBe(200)
  expect(read.json().author.name).toBe('Alice leitora')
  expect(read.body).not.toMatch(/private.example|firebase_uid|Nome privado|object_key/)
  expect(
    (await db.pool.query('SELECT user_id FROM post_mentions WHERE post_id=$1', [id])).rows,
  ).toEqual([{ user_id: ids['public-bob'] }])
  const club = (await call('/clubs', 'public-alice', 'POST', { name: 'Clube secreto' })).json()
  const privatePost = (
    await call(`/clubs/${club.id}/posts`, 'public-alice', 'POST', {
      kind: 'reflection',
      body: 'SEGREDO DO CLUBE',
    })
  ).json()
  expect((await call('/public/posts/' + privatePost.id)).statusCode).toBe(404)
  expect((await call('/public/posts')).body).not.toContain('SEGREDO DO CLUBE')
  const dto = (await call('/public/profiles/' + ids['public-alice'])).json()
  expect(dto.library).toEqual([])
  expect(dto.stats).toBeNull()
  expect(dto.clubs).toEqual([])
  expect(dto.goal).toBeNull()
  await profile('public-alice', { isPublic: false })
  expect((await call('/public/posts/' + id)).statusCode).toBe(404)
  expect((await call('/public/profiles/' + ids['public-alice'])).statusCode).toBe(404)
  // Owners can still delete hidden posts.
  expect((await call('/public/posts/' + id, 'public-alice', 'DELETE')).statusCode).toBe(204)
  await profile('public-alice')
})
it('persiste reações, respostas e seguidores e impede acesso cruzado após bloqueio nos dois sentidos', async () => {
  const id = await post(),
    url = '/public/posts/' + id
  for (let i = 0; i < 2; i++)
    expect((await call(url + '/like', 'public-bob', 'POST', { value: true })).statusCode).toBe(200)
  expect((await call(url, 'public-bob')).json<PostDto>().likes).toBe(1)
  const root = (await call(url + '/comments', 'public-bob', 'POST', { body: 'Concordo' })).json()
  expect(
    (await call(url + '/comments', 'public-alice', 'POST', { body: 'Obrigada', parentId: root.id }))
      .statusCode,
  ).toBe(201)
  expect(
    (
      await call(`/public/profiles/${ids['public-alice']}/follow`, 'public-bob', 'POST', {
        value: true,
      })
    ).statusCode,
  ).toBe(200)
  expect(
    (await call('/public/posts?following=1', 'public-bob'))
      .json<Page<PostDto>>()
      .items.some((p) => p.id === id),
  ).toBe(true)
  expect(
    (
      await call(`/public/profiles/${ids['public-alice']}/block`, 'public-bob', 'POST', {
        value: true,
      })
    ).statusCode,
  ).toBe(200)
  expect((await call(url, 'public-bob')).statusCode).toBe(404)
  expect((await call(url + '/like', 'public-bob', 'POST', { value: true })).statusCode).toBe(404)
  expect((await call(`/public/profiles/${ids['public-bob']}`, 'public-alice')).statusCode).toBe(404)
  expect(
    (
      await db.pool.query('SELECT 1 FROM follows WHERE follower_id=$1 OR followed_id=$1', [
        ids['public-bob'],
      ])
    ).rowCount,
  ).toBe(0)
  expect((await call(url + '/comments', 'public-carol')).json().items).toHaveLength(2)
  expect((await call('/me/blocks', 'public-bob')).json().items[0].id).toBe(ids['public-alice'])
  expect(
    (
      await call(`/public/profiles/${ids['public-alice']}/block`, 'public-bob', 'POST', {
        value: false,
      })
    ).statusCode,
  ).toBe(200)
})
it('mantém mídias públicas em bucket privado, nega acesso a rascunhos e impede anexar fotos privadas', async () => {
  const bytes = await sharp({
    create: { width: 40, height: 40, channels: 3, background: '#884477' },
  })
    .png()
    .toBuffer()
  const upload = await call('/public/media', 'public-alice', 'POST', {
    kind: 'image',
    data: bytes.toString('base64'),
  })
  expect(upload.statusCode, upload.body).toBe(201)
  const media = upload.json()
  expect((await call(`/public/media/${media.id}/content`)).statusCode).toBe(404)
  expect((await call(`/public/media/${media.id}/content`, 'public-alice')).statusCode).toBe(200)
  const id = await post('public-alice', { mediaIds: [media.id] })
  expect((await call(`/public/media/${media.id}/content`)).statusCode).toBe(200)
  const club = (await call('/clubs', 'public-alice', 'POST', { name: 'Fotos privadas' })).json()
  const privateMedia = (
    await call(`/clubs/${club.id}/media`, 'public-alice', 'POST', {
      kind: 'image',
      data: bytes.toString('base64'),
    })
  ).json()
  expect(
    (
      await call('/public/posts', 'public-alice', 'POST', {
        kind: 'reflection',
        body: 'Não deve publicar',
        mediaIds: [privateMedia.id],
      })
    ).statusCode,
  ).toBe(400)
  expect((await call(`/public/media/${privateMedia.id}/content`, 'public-alice')).statusCode).toBe(
    404,
  )
  expect(
    (await call(`/public/posts/${id}/share`, 'public-bob', 'POST', { body: 'Uma descoberta' }))
      .statusCode,
  ).toBe(201)
  await profile('public-alice', { isPublic: false })
  expect((await call(`/public/media/${media.id}/content`)).statusCode).toBe(404)
  const shares = (await call('/public/posts', 'public-bob'))
    .json<Page<PostDto>>()
    .items.filter((p) => p.body === 'Uma descoberta')
  expect(shares[0].sharedPostId).toBeNull()
  await profile('public-alice')
})
it('pagina por cursor e restringe denúncias e moderação com registro de auditoria', async () => {
  const created = []
  for (let i = 0; i < 3; i++)
    created.push(await post('public-alice', { body: 'Cursor público ' + i }))
  const first = (await call('/public/posts?q=Cursor&limit=2')).json<Page<PostDto>>(),
    second = (await call('/public/posts?q=Cursor&limit=2&cursor=' + first.nextCursor)).json<
      Page<PostDto>
    >()
  expect(first.items).toHaveLength(2)
  expect(second.items).toHaveLength(1)
  expect(new Set([...first.items, ...second.items].map((p) => p.id)).size).toBe(3)
  const report = await call('/reports', 'public-bob', 'POST', {
    kind: 'post',
    targetId: created[0],
    reason: 'Conteúdo impróprio de teste',
  })
  expect(report.statusCode, report.body).toBe(201)
  expect((await call('/moderation/reports', 'public-bob')).statusCode).toBe(403)
  const queue = await call('/moderation/reports', 'public-mod')
  expect(queue.statusCode, queue.body).toBe(200)
  expect(queue.json().items.some((r: { id: string }) => r.id === report.json().id)).toBe(true)
  const url = '/moderation/reports/' + report.json().id + '/review'
  expect(
    (await call(url, 'public-bob', 'POST', { decision: 'removed', reason: 'Não tenho permissão' }))
      .statusCode,
  ).toBe(403)
  expect(
    (
      await call(url, 'public-mod', 'POST', {
        decision: 'removed',
        reason: 'Remoção em teste autorizado',
      })
    ).statusCode,
  ).toBe(200)
  expect((await call('/public/posts/' + created[0])).statusCode).toBe(404)
  expect(
    (
      await call(url, 'public-mod', 'POST', {
        decision: 'removed',
        reason: 'Segunda análise concorrente',
      })
    ).statusCode,
  ).toBe(409)
  expect(
    (await db.pool.query('SELECT count(*)::int AS total FROM moderation_actions')).rows[0].total,
  ).toBe(1)
})
it('exibe somente metadados pessoais autorizados e impede reativar um perfil suspenso', async () => {
  const owner = 'public-carol'
  const workspace = (await call('/me/workspace', owner)).json()
  const updated = await call('/me/workspace', owner, 'POST', {
    version: workspace.version,
    action: {
      type: 'book.add',
      title: 'Título que posso exibir',
      author: 'Autora',
      category: 'Poesia',
      content: 'TEXTO PARTICULAR DO LIVRO',
    },
  })
  expect(updated.statusCode, updated.body).toBe(200)
  await profile(owner, { showLibrary: true, showStats: true, showClubs: true })
  const dto = await call('/public/profiles/' + ids[owner])
  expect(dto.statusCode, dto.body).toBe(200)
  expect(dto.json().library[0]).toEqual({
    title: 'Título que posso exibir',
    author: 'Autora',
    status: 'want',
  })
  expect(dto.body).not.toMatch(/TEXTO PARTICULAR|annotations|object_key|private.example/)
  const report = (
    await call('/reports', 'public-bob', 'POST', {
      kind: 'profile',
      targetId: ids[owner],
      reason: 'Perfil usado no teste de moderação',
    })
  ).json()
  expect(report.id).toBeTruthy()
  expect(
    (
      await call(`/moderation/reports/${report.id}/review`, 'public-mod', 'POST', {
        decision: 'removed',
        reason: 'Suspensão de perfil no teste',
      })
    ).statusCode,
  ).toBe(200)
  const { id, suspended, ...mine } = (await call('/me/profile', owner)).json()
  expect(suspended).toBe(true)
  expect((await call('/me/profile', owner, 'POST', { ...mine, isPublic: true })).statusCode).toBe(
    403,
  )
  expect((await call('/public/profiles/' + ids[owner])).statusCode).toBe(404)
})

it('descoberta agrega somente referências públicas visíveis e respeita bloqueios', async () => {
  const id = await post('public-alice', {
    kind: 'review',
    body: 'Resenha na exploração',
    bookTitle: 'Livro em destaque',
    bookAuthor: 'Autora',
  })
  const discover = await call('/public/discover')
  expect(discover.statusCode, discover.body).toBe(200)
  expect(
    discover.json().books.some((book: { title: string }) => book.title === 'Livro em destaque'),
  ).toBe(true)
  expect(discover.body).not.toMatch(/private.example|firebase_uid|object_key/)
  await call(`/public/profiles/${ids['public-alice']}/block`, 'public-bob', 'POST', { value: true })
  const blocked = await call('/public/discover', 'public-bob')
  expect(
    blocked.json().books.some((book: { title: string }) => book.title === 'Livro em destaque'),
  ).toBe(false)
  expect(blocked.body).not.toContain(id)
  await call(`/public/profiles/${ids['public-alice']}/block`, 'public-bob', 'POST', {
    value: false,
  })
})
it('não entrega à moderação pública uma biografia privada alterada depois da denúncia', async () => {
  await profile('public-alice', { isPublic: true, bio: 'Biografia pública para revisão' })
  const report = await call('/reports', 'public-bob', 'POST', {
    kind: 'profile',
    targetId: ids['public-alice'],
    reason: 'Revisar o perfil publicado',
  })
  expect(report.statusCode).toBe(201)
  await profile('public-alice', { isPublic: false, bio: 'BIO PRIVADA APÓS DENÚNCIA' })
  const queue = await call('/moderation/reports', 'public-mod')
  expect(queue.statusCode, queue.body).toBe(200)
  expect(queue.body).not.toContain('BIO PRIVADA APÓS DENÚNCIA')
  expect(
    queue.json().items.find((item: { id: string }) => item.id === report.json().id).excerpt,
  ).toBe('Conteúdo indisponível na visibilidade atual')
  await profile('public-alice', { isPublic: true, bio: '' })
})
