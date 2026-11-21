import { afterAll, beforeAll, it, expect, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { testDatabase } from './database.js'
import { buildApp } from '../src/app.js'
import { PushWorker } from '../src/push-worker.js'
import { setTimeout as delay } from 'node:timers/promises'
let db: Awaited<ReturnType<typeof testDatabase>>,
  app: Awaited<ReturnType<typeof buildApp>>,
  club: string
const ids: Record<string, string> = {}
const call = (
  path: string,
  uid = 'reader',
  method: 'POST' | 'GET' | 'DELETE' = 'GET',
  payload?: Record<string, unknown>,
) =>
  app.inject({
    url: '/v1' + path,
    headers: { authorization: 'Bearer ' + uid },
    method,
    payload,
  })
const settings = (values: Record<string, unknown>) =>
  call('/me/notification-settings', 'reader', 'POST', values)
const page = async (uid = 'reader') =>
  (await call('/me/notifications?limit=50', uid)).json().items as {
    id: string
    type: string
    targetId: string
    readAt: string | null
  }[]
const worker = (sendFcm = async (_token: string, _id: string) => {}) =>
  new PushWorker(db.pool, {
    publicKey: '',
    privateKey: '',
    subject: '',
    sendFcm,
  })
async function chat(
  mentions: string[] = [],
  reply: string | null = null,
): Promise<string> {
  const id = randomUUID()
  await db.pool.query(
    "INSERT INTO chat_messages(id,club_id,author_id,room,spoiler,chapter) VALUES($1,$2,$3,'general',false,'')",
    [id, club, ids.author],
  )
  await db.pool.query(
    "INSERT INTO notification_events(event_key,kind,target_id,actor_id,club_id,mentioned,reply_user) VALUES($1,'chat',$2,$3,$4,$5,$6)",
    ['chat:' + id + ':false', id, ids.author, club, mentions, reply],
  )
  return id
}
beforeAll(async () => {
  vi.stubEnv('FCM_PUSH_ENABLED', 'true')
  db = await testDatabase()
  app = await buildApp({
    pool: db.pool,
    origin: 'http://localhost',
    rateMax: 10000,
    moderatorUids: ['mod'],
    verifyToken: async (uid) => ({
      uid,
      email: uid + '@example.test',
      emailVerified: true,
      name: uid,
    }),
  })
  for (const uid of ['author', 'reader', 'outside', 'mod'])
    ids[uid] = (await call('/me', uid)).json().user.id
  await call('/me/profile', 'author')
  club = (
    await call('/clubs', 'author', 'POST', { name: 'Clube de teste' })
  ).json().id
  await db.pool.query(
    "INSERT INTO club_memberships(club_id,user_id,role) VALUES($1,$2,'member')",
    [club, ids.reader],
  )
})
afterAll(async () => {
  vi.unstubAllEnvs()
  await app?.close()
  await db?.close()
})
it('preserva patches concorrentes e entrega uma vez por mensagem, apenas a membros ativos', async () => {
  await Promise.all([
    settings({ chatDeliveryMode: 'all' }),
    settings({ replies: false }),
  ])
  expect((await call('/me/notification-settings')).json()).toMatchObject({
    chatDeliveryMode: 'all',
    replies: false,
  })
  const first = await chat(),
    second = await chat()
  await db.pool.query(
    'INSERT INTO notification_events SELECT * FROM notification_events WHERE target_id=$1 ON CONFLICT DO NOTHING',
    [first],
  )
  expect(
    (await page()).filter((n) => [first, second].includes(n.targetId)),
  ).toHaveLength(2)
  expect(await page('outside')).toEqual([])
  expect(await page('author')).toEqual([])
  const own = (await page())[0]
  await call('/me/notifications/read', 'outside', 'POST', { id: own.id })
  expect((await page()).find((n) => n.id === own.id)?.readAt).toBeNull()
  await call('/me/notifications/read', 'reader', 'POST', { id: own.id })
  expect((await page()).find((n) => n.id === own.id)?.readAt).toBeTruthy()
  const a = (await call('/me/notifications?limit=1')).json()
  expect(
    (await call('/me/notifications?limit=1&cursor=' + a.nextCursor)).json()
      .items[0].id,
  ).not.toBe(a.items[0].id)
  await call('/me/notifications/read', 'reader', 'POST', {})
  expect((await call('/me/notifications/unread')).json().count).toBe(0)
})
it('respeita modos, bloqueio, suspensão, menções, respostas, saída e revalidação do chat', async () => {
  await settings({ chatDeliveryMode: 'mentions', replies: true })
  const plain = await chat(),
    mention = await chat([ids.reader]),
    reply = await chat([], ids.reader)
  expect((await page()).some((n) => n.targetId === plain)).toBe(false)
  expect(await page()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'user.mentioned', targetId: mention }),
      expect.objectContaining({
        type: 'comment.reply.created',
        targetId: reply,
      }),
    ]),
  )
  await settings({ mutedClubIds: [club] })
  const muted = await chat([ids.reader])
  expect(await page()).toEqual([])
  await settings({ mutedClubIds: [], chatDeliveryMode: 'grouped' })
  await chat()
  const last = await chat()
  expect((await page()).some((n) => n.targetId === muted)).toBe(false)
  expect((await page()).some((n) => n.targetId === last)).toBe(true)
  expect(
    (
      await db.pool.query(
        "SELECT count(*)::int AS n FROM notifications WHERE dedupe_key LIKE 'chat-group:%'",
      )
    ).rows[0].n,
  ).toBe(1)
  const id = (await page())[0].id
  await db.pool.query(
    "UPDATE club_memberships SET status='removed',removed_at=now() WHERE user_id=$1",
    [ids.reader],
  )
  expect((await call('/me/notifications/' + id)).statusCode).toBe(404)
  await db.pool.query(
    "UPDATE club_memberships SET status='active',removed_at=NULL WHERE user_id=$1",
    [ids.reader],
  )
  await db.pool.query('INSERT INTO user_blocks VALUES($1,$2)', [
    ids.reader,
    ids.author,
  ])
  expect((await call('/me/notifications/' + id)).statusCode).toBe(404)
  await db.pool.query('DELETE FROM user_blocks WHERE blocker_id=$1', [
    ids.reader,
  ])
  await db.pool.query('UPDATE profiles SET suspended=true WHERE user_id=$1', [
    ids.author,
  ])
  expect((await call('/me/notifications/' + id)).statusCode).toBe(404)
  await db.pool.query('UPDATE profiles SET suspended=false WHERE user_id=$1', [
    ids.author,
  ])
})
it('publica destaque somente por moderação e revoga quando o perfil se torna privado', async () => {
  await db.pool.query('UPDATE profiles SET is_public=true WHERE user_id=$1', [
    ids.author,
  ])
  const published = await call('/public/posts', 'author', 'POST', {
    body: 'Teste de destaque',
    kind: 'reflection',
  })
  expect(published.statusCode, published.body).toBe(201)
  const post = published.json().id,
    path = '/public/posts/' + post + '/highlight'
  expect((await call(path, 'reader', 'POST', {})).statusCode).toBe(403)
  await settings({ communityHighlights: false })
  expect((await call(path, 'mod', 'POST', {})).statusCode).toBe(200)
  await call(path, 'mod', 'POST', {})
  expect((await page()).some((n) => n.targetId === post)).toBe(false)
  expect(
    (await page('outside')).filter((n) => n.targetId === post),
  ).toHaveLength(1)
  await db.pool.query('UPDATE profiles SET is_public=false WHERE user_id=$1', [
    ids.author,
  ])
  expect((await page('outside')).some((n) => n.targetId === post)).toBe(false)
})
it('reconecta o leitor ao estado atual e revalida o destino ao acordar', async () => {
  await settings({ chatDeliveryMode: 'all' })
  const first = (await call('/me/notifications/sync')).json()
  expect(first.revision).toHaveLength(43)
  const pending = call(
    '/me/notifications/sync?revision=' + first.revision,
  ).then((r) => r.json())
  await delay(70)
  const target = await chat()
  const next = await pending
  expect(next.revision).not.toBe(first.revision)
  expect(next.page.items[0].targetId).toBe(target)
  expect((await call('/me/notifications/sync')).json().revision).toBe(
    next.revision,
  )
})
it('renova tokens da mesma instalação, isola contas, repete erros transitórios e invalida somente dispositivos vencidos', async () => {
  const devices = '/me/push/devices',
    token = 'synthetic-token-first-pass',
    input = { token, platform: 'android', installationId: randomUUID() }
  const a = await call(devices, 'reader', 'POST', input)
  expect(a.statusCode, a.body).toBe(200)
  expect(a.body).not.toContain(token)
  expect((await call(devices, 'reader', 'POST', input)).json().id).toBe(
    a.json().id,
  )
  expect((await call(devices, 'outside', 'POST', input)).statusCode).toBe(409)
  const rotated = { ...input, token: 'synthetic-token-second-pass' }
  const b = (await call(devices, 'reader', 'POST', rotated)).json().id
  await call(devices + '/' + b, 'outside', 'DELETE')
  expect(
    (
      await db.pool.query(
        'SELECT revoked_at FROM push_subscriptions WHERE id=$1',
        [b],
      )
    ).rows[0].revoked_at,
  ).toBeNull()
  const send = vi
    .fn(async () => {})
    .mockRejectedValueOnce({ code: 'messaging/server-unavailable' })
  await chat()
  expect((await worker(send).process()).retry).toBe(1)
  await db.pool.query(
    "UPDATE push_deliveries SET available_at=now() WHERE status='pending'",
  )
  expect((await worker(send).process()).sent).toBe(1)
  await settings({ pushEnabled: false })
  await chat()
  expect((await worker(send).process()).cancelled).toBe(1)
  await settings({ pushEnabled: true })
  await chat()
  send.mockRejectedValueOnce({
    code: 'messaging/registration-token-not-registered',
  })
  expect((await worker(send).process()).cancelled).toBe(1)
  expect(
    (
      await db.pool.query(
        'SELECT revoked_at FROM push_subscriptions WHERE id=$1',
        [b],
      )
    ).rows[0].revoked_at,
  ).toBeTruthy()
  await call(devices, 'reader', 'POST', rotated)
  await call(devices, 'reader', 'DELETE', { token: rotated.token })
  expect(
    (
      await db.pool.query(
        'SELECT revoked_at FROM push_subscriptions WHERE id=$1',
        [b],
      )
    ).rows[0].revoked_at,
  ).toBeTruthy()
})
it('continua clube grande após falha parcial sem duplicar ou pular a página', async () => {
  await db.pool.query(
    `WITH added AS (INSERT INTO users(firebase_uid,email,name) SELECT 'synthetic-'||i,'test-'||i,'Teste' FROM generate_series(1,240) i RETURNING id),
 members AS (INSERT INTO club_memberships(club_id,user_id,role) SELECT $1,id,'member' FROM added)
 INSERT INTO notification_settings(user_id,controls) SELECT id,'{"chatDeliveryMode":"all"}' FROM added`,
    [club],
  )
  const id = await chat(),
    key = 'chat:' + id + ':false'
  const first = (
    await db.pool.query(
      'SELECT count(*)::int AS n FROM notifications WHERE target_id=$1',
      [id],
    )
  ).rows[0].n
  expect(first).toBeGreaterThan(0)
  expect(first).toBeLessThanOrEqual(32)
  const job = await db.pool.connect()
  try {
    await job.query('BEGIN')
    await job.query('SELECT deliver_notice_page($1,200)', [key])
    await job.query('ROLLBACK')
  } finally {
    job.release()
  }
  expect(
    (
      await db.pool.query(
        'SELECT count(*)::int AS n FROM notifications WHERE target_id=$1',
        [id],
      )
    ).rows[0].n,
  ).toBe(first)
  await Promise.all([worker().run(), worker().run()])
  expect(
    (
      await db.pool.query(
        'SELECT count(*)::int AS n FROM notifications WHERE target_id=$1',
        [id],
      )
    ).rows[0].n,
  ).toBe(241)
})
it('integra mural, leitura, convite, encontro e lembrete aos eventos de domínio', async () => {
  const root = '/clubs/' + club
  await settings({ chatDeliveryMode: 'all' })
  const wall = await call(root + '/posts', 'author', 'POST', {
    kind: 'reflection',
    body: 'Mural do encontro',
  })
  expect(wall.statusCode, wall.body).toBe(201)
  const workspace = root + '/workspace'
  let state = (await call(workspace, 'author')).json()
  state = (
    await call(workspace, 'author', 'POST', {
      version: state.version,
      action: {
        type: 'book.add',
        title: 'Obra de teste',
        author: 'Autora',
        category: '',
        content: 'Texto.',
      },
    })
  ).json()
  const book = state.state.books[0].id
  const start = await call(workspace, 'author', 'POST', {
    version: state.version,
    action: { type: 'book.current', id: book },
  })
  expect(start.statusCode, start.body).toBe(200)
  const invite = await call(root + '/invites', 'author', 'POST', {
    email: 'outside@example.test',
  })
  expect(
    (await page('outside')).some(
      (n) =>
        n.type === 'club.invitation.created' && n.targetId === invite.json().id,
    ),
  ).toBe(true)
  const input = {
    title: 'Encontro de teste',
    date: new Date(Date.now() + 3600000).toISOString(),
    location: 'Teste',
    description: 'Descrição',
  }
  const event = (await call(root + '/events', 'author', 'POST', input)).json()
  const edited = await call(
    root + '/events/' + event.id + '/edit',
    'author',
    'POST',
    { ...input, location: 'Outro local', version: 0 },
  )
  expect(edited.statusCode, edited.body).toBe(200)
  // Worker is also the recovery path for recipients beyond the first page.
  await worker().run()
  await worker().run()
  const items = await page()
  for (const [type, id] of [
    ['club.wall.post.created', wall.json().id],
    ['club.reading.started', book],
    ['club.event.created', event.id],
    ['club.event.updated', event.id],
    ['club.event.reminder', event.id],
  ])
    expect(
      items.some((n) => n.type === type && n.targetId === id),
      type,
    ).toBe(true)
  expect(
    (
      await call('/me/notifications', 'outside', 'POST', {
        recipientId: ids.reader,
      })
    ).statusCode,
  ).toBe(404)
})
