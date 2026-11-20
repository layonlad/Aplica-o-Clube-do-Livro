import { expect, it } from 'vitest'
import { Pool } from 'pg'
import { readFile } from 'node:fs/promises'
import { getFirestore } from 'firebase-admin/firestore'
import { randomUUID } from 'node:crypto'
import { initializeApp, getApps } from 'firebase-admin/app'
import { buildApp } from '../src/app.js'
import { testDatabase } from './database.js'

it.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)(
  'conversa real com Firestore, PostgreSQL, dois participantes e visitante',
  async () => {
    if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST!))
      throw Error('Emulador local obrigatório')
    if (!getApps().length) initializeApp({ projectId: 'demo-clube-chat' })
    process.env.CLUB_CHAT_ENABLED = 'true'
    const db = await testDatabase()
    const role = 'chat_test_' + randomUUID().replaceAll('-', '')
    const schema = (await db.pool.query('SELECT current_schema() AS name'))
      .rows[0].name
    await db.pool.query('CREATE ROLE ' + role + ' NOLOGIN')
    await db.pool.query(
      (
        await readFile(
          new URL('../ops/runtime-grants.sql', import.meta.url),
          'utf8',
        )
      ).replaceAll('clube_runtime', role),
    )
    const runtime = new Pool({
      connectionString: db.pool.options.connectionString,
      options: '-c search_path=' + schema + ' -c role=' + role,
    })
    const api = await buildApp({
      pool: runtime,
      origin: 'http://localhost',
      rateMax: 3000,
      verifyToken: async (uid) => ({
        uid,
        email: uid + '@example.test',
        emailVerified: true,
      }),
    })
    const call = (
      url: string,
      uid: string,
      payload?: Record<string, unknown>,
    ) =>
      api.inject({
        url: '/v1' + url,
        method: payload ? 'POST' : 'GET',
        headers: uid ? { authorization: 'Bearer ' + uid } : {},
        payload,
      })
    try {
      const owner = (await call('/me', 'owner')).json().user.id,
        member = (await call('/me', 'member')).json().user.id
      const club = (
          await call('/clubs', 'owner', { name: 'Clube de teste' })
        ).json().id,
        path = '/clubs/' + club + '/chat',
        history = path + '?room=general'
      await db.pool.query(
        "INSERT INTO club_memberships(club_id,user_id,role) VALUES($1,$2,'member')",
        [club, member],
      )
      expect((await call(history, '')).statusCode).toBe(401)
      expect((await call(history, 'other')).statusCode).toBe(403)
      expect(
        (
          await call(path + '/settings', 'owner', {
            type: 'settings',
            enabled: true,
            chapter: 'Capítulo 5',
            slow: 60,
            pins: 2,
          })
        ).statusCode,
      ).toBe(200)
      expect((await call(path + '/members?q=zzz', 'other')).statusCode).toBe(
        403,
      )
      const ids = Array.from({ length: 32 }, () => randomUUID())
      const fs = getFirestore('clube-chat')
      const batch = fs.batch()
      for (const id of ids)
        batch.set(fs.doc('clubs/' + club + '/messages/' + id), {
          text: 'Histórico sintético',
        })
      await batch.commit()
      await db.pool.query(
        "INSERT INTO chat_messages(id,club_id,author_id,room,chapter,spoiler,created_at) SELECT id,$1,$2,'reading','',false,now()-n*interval '1 minute' FROM unnest($3::uuid[]) WITH ORDINALITY t(id,n)",
        [club, member, ids],
      )
      const latest = (await call(path + '?room=reading', 'owner')).json()
      expect(latest.items).toHaveLength(30)
      expect(latest.items.at(-1).id).toBe(ids[0])
      const older = (
        await call(path + '?room=reading&before=' + latest.before, 'owner')
      ).json()
      expect(older.items.map((m: { id: string }) => m.id)).toEqual(
        ids.slice(30).reverse(),
      )
      const directUrl =
        'http://' +
        process.env.FIRESTORE_EMULATOR_HOST +
        '/v1/projects/demo-clube-chat/databases/clube-chat/documents/clubs/' +
        club +
        '/messages'
      expect((await fetch(directUrl)).status).toBe(403)
      const initial = (await call(history, 'member')).json()
      const wait = call(history + '&since=' + initial.version, 'member').then(
        (r) => r.json(),
      )
      const id = randomUUID(),
        message = {
          id,
          room: 'general',
          text: 'Trecho sintético',
          spoiler: true,
          replyTo: null,
          mentions: [member],
        }
      const sent = await call(path, 'owner', message)
      expect(sent.statusCode, sent.body).toBe(200)
      expect((await wait).items).toMatchObject([
        { id, text: message.text, spoiler: true },
      ])
      expect((await call(path, 'owner', message)).statusCode).toBe(200)
      expect((await call(history, 'member')).json().items).toHaveLength(1)
      expect(
        (await call(path, 'owner', { ...message, id: randomUUID() }))
          .statusCode,
      ).toBe(429)
      expect(
        (
          await call(path, 'member', {
            ...message,
            id: randomUUID(),
            replyTo: id,
            mentions: [],
          })
        ).statusCode,
      ).toBe(200)
      expect(
        (await call('/me/notifications', 'member'))
          .json()
          .items.some((n: { targetId: string }) => n.targetId === id),
      ).toBe(true)
      await call(path + '/settings', 'member', {
        type: 'preference',
        value: 'silent',
      })
      expect(
        (await call('/me/notifications', 'member'))
          .json()
          .items.some((n: { targetId: string }) => n.targetId === id),
      ).toBe(false)
      const action = path + '/' + id + '/action'
      expect(
        (await call(action, 'member', { type: 'react', emoji: '📚' }))
          .statusCode,
      ).toBe(200)
      expect(
        (await call(action, 'member', { type: 'pin', on: true })).statusCode,
      ).toBe(403)
      expect(
        (await call(action, 'owner', { type: 'pin', on: true })).statusCode,
      ).toBe(200)
      expect((await call(history, 'member')).json()).toMatchObject({
        pins: [id],
        items: [{ mine: '📚' }, { replyTo: id }],
      })
      expect(
        (await call(action, 'member', { type: 'report', reason: 'Revisar' }))
          .statusCode,
      ).toBe(200)
      expect((await call(path + '/reports', 'owner')).json()).toHaveLength(1)
      expect((await call(path + '/reports', 'member')).statusCode).toBe(403)
      await db.pool.query(
        "UPDATE club_memberships SET role='moderator' WHERE user_id=$1",
        [member],
      )
      expect(
        (await call(action, 'member', { type: 'pin', on: false })).statusCode,
      ).toBe(200)
      await db.pool.query(
        "UPDATE club_memberships SET role='admin' WHERE user_id=$1",
        [member],
      )
      expect(
        (
          await call(path + '/settings', 'member', {
            type: 'settings',
            enabled: false,
            chapter: '',
            pins: 1,
            slow: 1,
          })
        ).statusCode,
      ).toBe(200)
      expect((await call(history, 'owner')).statusCode).toBe(403)
      await call(path + '/settings', 'member', {
        type: 'settings',
        enabled: true,
        chapter: '',
        pins: 1,
        slow: 1,
      })
      await db.pool.query(
        "UPDATE club_memberships SET role='member' WHERE user_id=$1",
        [member],
      )
      expect(
        (
          await call(path + '/settings', 'owner', {
            type: 'mute',
            member,
            on: true,
          })
        ).statusCode,
      ).toBe(200)
      expect(
        (await call(path, 'member', { ...message, id: randomUUID() }))
          .statusCode,
      ).toBe(403)
      await db.pool.query(
        'INSERT INTO user_blocks(blocker_id,blocked_id) VALUES($1,$2)',
        [member, owner],
      )
      expect((await call(history, 'member')).json().items).toHaveLength(1)
      expect((await call(action, 'owner', { type: 'remove' })).statusCode).toBe(
        200,
      )
      await db.pool.query(
        "UPDATE club_memberships SET status='removed',removed_at=now() WHERE user_id=$1",
        [member],
      )
      expect((await call(history, 'member')).statusCode).toBe(403)
    } finally {
      await api.close()
      await runtime.end()
      await db.pool.query('DROP OWNED BY ' + role)
      await db.pool.query('DROP ROLE ' + role)
      await db.close()
      delete process.env.CLUB_CHAT_ENABLED
    }
  },
  40000,
)
