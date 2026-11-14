import { beforeAll, afterAll, it, expect } from 'vitest'
import { testDatabase } from './database.js'
import { buildApp } from '../src/app.js'
let db: Awaited<ReturnType<typeof testDatabase>>,
  app: Awaited<ReturnType<typeof buildApp>>,
  club: string,
  other: string,
  member: string
const call = (
  path: string,
  uid = 'events-owner',
  method = 'GET',
  payload?: Record<string, unknown>,
) =>
  app.inject({
    url: '/v1' + path,
    headers: { authorization: 'Bearer ' + uid },
    method: method as 'GET' | 'POST' | 'DELETE',
    payload,
  })
beforeAll(async () => {
  db = await testDatabase()
  app = await buildApp({
    pool: db.pool,
    origin: 'https://club.example',
    rateMax: 3000,
    verifyToken: async (uid) => ({
      uid,
      email: uid + '@example.com',
      name: uid,
      emailVerified: true,
    }),
  })
  member = (await call('/me', 'events-member')).json().user.id
  club = (await call('/clubs', undefined, 'POST', { name: 'Encontros A' })).json().id
  other = (await call('/clubs', undefined, 'POST', { name: 'Encontros B' })).json().id
  await db.pool.query("INSERT INTO club_memberships(club_id,user_id,role) VALUES($1,$2,'member')", [
    club,
    member,
  ])
})
afterAll(async () => {
  await app?.close()
  await db?.close()
})
it('persiste encontros paginados, presença e vínculos no clube correto, com controle de versão', async () => {
  const root = `/clubs/${club}/events`,
    date = new Date(Date.now() + 3600000).toISOString(),
    input = {
      title: 'Café com livros',
      date,
      location: 'Sala de leitura',
      description: 'Um encontro presencial',
    }
  expect((await call(root, 'events-member', 'POST', input)).statusCode).toBe(403)
  const created = await call(root, undefined, 'POST', input)
  expect(created.statusCode, created.body).toBe(201)
  const id = created.json().id
  expect((await call(root + '/' + id, 'events-outsider')).statusCode).toBe(403)
  expect((await call(`/clubs/${other}/events/${id}`)).statusCode).toBe(404)
  for (let i = 0; i < 2; i++)
    expect(
      (await call(root + `/${id}/rsvp`, 'events-member', 'POST', { value: 'yes' })).statusCode,
    ).toBe(200)
  expect((await call(root + '/' + id)).json().confirmed).toBe(1)
  expect(
    (await call(root + `/${id}/attendees/${member}`, 'events-member', 'POST', { attended: true }))
      .statusCode,
  ).toBe(403)
  expect(
    (await call(root + `/${id}/attendees/${member}`, undefined, 'POST', { attended: true }))
      .statusCode,
  ).toBe(200)
  expect((await call(root + `/${id}/attendees`)).json().items[0]).toMatchObject({
    id: member,
    attended: true,
  })
  expect(
    (
      await call(root + `/${id}/edit`, undefined, 'POST', {
        ...input,
        title: 'Café e poesia',
        version: 0,
      })
    ).statusCode,
  ).toBe(200)
  expect(
    (await call(root + `/${id}/edit`, undefined, 'POST', { ...input, version: 0 })).statusCode,
  ).toBe(409)
  const album = await call(`/clubs/${club}/albums`, undefined, 'POST', {
    title: 'Memórias',
    eventDate: date.slice(0, 10),
    eventId: id,
  })
  expect(album.statusCode, album.body).toBe(201)
  expect(
    (
      await call(`/clubs/${other}/albums`, undefined, 'POST', {
        title: 'Escopo errado',
        eventDate: date.slice(0, 10),
        eventId: id,
      })
    ).statusCode,
  ).toBe(400)
  const filtered = (await call(`/clubs/${club}/albums?eventId=${id}`)).json()
  expect(filtered.items.map((a: { id: string }) => a.id)).toEqual([album.json().id])
  for (let i = 0; i < 3; i++)
    await call(root, undefined, 'POST', {
      ...input,
      title: 'Página ' + i,
      date: new Date(Date.now() + 7200000 + i * 1000).toISOString(),
    })
  const first = (await call(root + '?order=asc&limit=2')).json(),
    next = (await call(root + '?order=asc&limit=2&cursor=' + first.nextCursor)).json()
  expect(first.items).toHaveLength(2)
  expect(next.items).toHaveLength(2)
  expect(new Set([...first.items, ...next.items].map((e) => e.id)).size).toBe(4)
  const notices = (await call('/me/notifications', 'events-member')).json()
  expect(
    notices.items.some(
      (n: { kind: string; targetId: string }) => n.kind === 'event_reminder' && n.targetId === id,
    ),
  ).toBe(true)
  expect((await call(root + '/' + id, undefined, 'DELETE')).statusCode).toBe(204)
  expect((await call(root + '/' + id)).statusCode).toBe(404)
  expect(
    (await call('/me/notifications', 'events-member'))
      .json()
      .items.some((n: { targetId: string }) => n.targetId === id),
  ).toBe(false)
  // Existing album remains accessible as an archive after event deletion.
  expect((await call(`/clubs/${club}/albums/${album.json().id}`, 'events-member')).statusCode).toBe(
    200,
  )
})
it('mantém o contrato antigo sem perder dados e notifica novos livros e leituras coletivas', async () => {
  let workspace = (await call(`/clubs/${club}/workspace`)).json()
  const added = await call(`/clubs/${club}/workspace`, undefined, 'POST', {
    version: workspace.version,
    action: {
      type: 'event.add',
      title: 'Encontro via cliente anterior',
      date: '2026-12-01T12:00:00Z',
      location: 'Virtual',
      description: 'Formato antigo',
    },
  })
  expect(added.statusCode, added.body).toBe(200)
  const event = added
    .json()
    .state.events.find((e: { title: string }) => e.title === 'Encontro via cliente anterior')
  expect(event).toBeTruthy()
  workspace = (await call(`/clubs/${club}/workspace`, 'events-member')).json()
  expect(
    (
      await call(`/clubs/${club}/workspace`, 'events-member', 'POST', {
        version: workspace.version,
        action: { type: 'event.rsvp', id: event.id, value: 'yes' },
      })
    ).statusCode,
  ).toBe(200)
  expect((await call(`/clubs/${club}/events/${event.id}`)).json().confirmed).toBe(1)
  workspace = (await call(`/clubs/${club}/workspace`)).json()
  const book = (
    await call(`/clubs/${club}/workspace`, undefined, 'POST', {
      version: workspace.version,
      action: {
        type: 'book.add',
        title: 'Leitura coletiva',
        author: 'Autora',
        category: '',
        content: '',
      },
    })
  ).json()
  const id = book.state.books[0].id
  expect(
    (await call('/me/notifications', 'events-member'))
      .json()
      .items.some(
        (n: { kind: string; targetId: string }) => n.kind === 'book' && n.targetId === id,
      ),
  ).toBe(true)
  expect(
    (
      await call(`/clubs/${club}/workspace`, undefined, 'POST', {
        version: book.version,
        action: { type: 'book.current', id },
      })
    ).statusCode,
  ).toBe(200)
  expect(
    (await call('/me/notifications', 'events-member'))
      .json()
      .items.some(
        (n: { kind: string; targetId: string }) => n.kind === 'reading' && n.targetId === id,
      ),
  ).toBe(true)
})
