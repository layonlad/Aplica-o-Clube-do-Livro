import { afterAll, beforeAll, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { testDatabase } from './database.js'
import { buildApp } from '../src/app.js'
import { createSignalPublisher, type Signal } from '../src/notification-signals.js'

let db: Awaited<ReturnType<typeof testDatabase>>, app: Awaited<ReturnType<typeof buildApp>>
const ids: Record<string, string> = {}
let written: Signal[][] = []
let failWrites = false
const writer = async (batch: Signal[]) => {
  if (failWrites) throw Error('Firestore fora do ar')
  written.push(batch)
}
let publisher: ReturnType<typeof createSignalPublisher>
const call = (path: string, uid = 'reader', method: 'GET' | 'POST' = 'GET', payload?: Record<string, unknown>) =>
  app.inject({ url: '/v1' + path, headers: { authorization: 'Bearer ' + uid }, method, payload })
const version = async (uid = 'reader') =>
  (await db.pool.query('SELECT s.version::int AS v,s.published::int AS p FROM notification_signals s WHERE s.user_id=$1', [ids[uid]])).rows[0] as
    | { v: number; p: number }
    | undefined
const notice = (recipient = 'reader', actor = 'author') =>
  db.pool.query(
    "INSERT INTO notifications(recipient_id,actor_id,kind,target_type,target_id,category,dedupe_key) VALUES($1,$2,'like','post',$3,'interactions',$4) RETURNING id",
    [ids[recipient], ids[actor], randomUUID(), 'like:' + randomUUID()],
  )
const settle = async () => {
  await delay(30)
  await publisher.flush()
}

beforeAll(async () => {
  db = await testDatabase()
  publisher = createSignalPublisher(db.pool, writer)
  app = await buildApp({
    pool: db.pool,
    origin: 'http://localhost',
    rateMax: 10000,
    verifyToken: async (uid) => ({ uid, email: uid + '@example.test', emailVerified: true, name: uid }),
    notificationSignals: publisher.request,
  })
  for (const uid of ['author', 'reader', 'other']) ids[uid] = (await call('/me', uid)).json().user.id
})
afterAll(async () => {
  await app?.close()
  await db?.close()
})

it('agrupa um lote de notificações em uma versão por pessoa e publica só uid e número', async () => {
  written = []
  await db.pool.query(
    `INSERT INTO notifications(recipient_id,actor_id,kind,target_type,target_id,category,dedupe_key)
     SELECT r,$3,'like','post',gen_random_uuid(),'interactions','batch:'||g||':'||r FROM unnest($1::uuid[]) r, generate_series(1,$2) g`,
    [[ids.reader, ids.other], 3, ids.author],
  )
  expect(await version('reader')).toEqual({ v: 1, p: 0 }) // um INSERT com 3 avisos = uma versão
  expect(await publisher.flush()).toBe(2)
  const sent = written.flat()
  expect(sent).toEqual(expect.arrayContaining([{ uid: 'reader', version: 1 }, { uid: 'other', version: 1 }]))
  for (const signal of sent) expect(Object.keys(signal).sort()).toEqual(['uid', 'version'])
  expect(await version('reader')).toEqual({ v: 1, p: 1 })
  written = []
  expect(await publisher.flush()).toBe(0) // nada pendente, nada gravado
  expect(written).toEqual([])
})

it('marca leitura pela API, publica na resposta e ignora quem não tem aviso', async () => {
  await notice()
  const before = (await version())!.v
  await settle()
  written = []
  await call('/me/notifications/read', 'reader', 'POST', {})
  await settle()
  expect((await version())!.v).toBe(before + 1)
  expect(written.flat()).toEqual([{ uid: 'reader', version: before + 1 }])
  const author = await version('author')
  await call('/me/notifications/read', 'author', 'POST', {}) // nada para marcar: sem nova versão
  expect(await version('author')).toEqual(author)
})

it('avisa quando um aviso não lido some ou é reagrupado, e não quando um já lido some', async () => {
  const { rows } = await notice()
  let current = (await version())!.v
  await db.pool.query("UPDATE notifications SET created_at=now()+interval '1 second' WHERE id=$1", [rows[0].id])
  expect((await version())!.v).toBe(++current)
  await db.pool.query('DELETE FROM notifications WHERE id=$1', [rows[0].id])
  expect((await version())!.v).toBe(++current)
  const read = await notice()
  current++
  await db.pool.query('UPDATE notifications SET read_at=now() WHERE id=$1', [read.rows[0].id])
  current++
  await db.pool.query('DELETE FROM notifications WHERE id=$1', [read.rows[0].id])
  expect((await version())!.v).toBe(current)
})

it('falha no Firestore não perde o sinal e a próxima tentativa publica a versão mais nova', async () => {
  await settle()
  failWrites = true
  await notice()
  await expect(publisher.flush()).rejects.toThrow()
  failWrites = false
  await notice()
  written = []
  await publisher.flush()
  const latest = (await version())!
  expect(written.flat()).toEqual([{ uid: 'reader', version: latest.v }])
  expect(latest.p).toBe(latest.v)
})

it('chamadas simultâneas não gravam em paralelo', async () => {
  await notice()
  let active = 0,
    peak = 0
  const slow = createSignalPublisher(db.pool, async () => {
    active++
    peak = Math.max(peak, active)
    await delay(20)
    active--
  })
  await Promise.all([slow.flush(), slow.flush(), slow.flush()])
  expect(peak).toBe(1)
})

it('um papel sem acesso à tabela de sinais cria avisos e não consegue ler nem forjar sinais', async () => {
  const grants = await readFile(new URL('../ops/runtime-grants.sql', import.meta.url), 'utf8')
  expect(grants).toContain('GRANT SELECT,UPDATE(published) ON notification_signals TO clube_runtime')
  const role = 'signal_' + randomUUID().replaceAll('-', '').slice(0, 12)
  const schema = (await db.pool.query('SELECT current_schema() AS s')).rows[0].s as string
  await db.pool.query(`CREATE ROLE ${role}`)
  const client = await db.pool.connect()
  try {
    await db.pool.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`)
    await db.pool.query(`GRANT SELECT,INSERT ON notifications TO ${role}`)
    await db.pool.query(`GRANT SELECT,INSERT ON push_deliveries,push_subscriptions TO ${role}`)
    await db.pool.query(`GRANT SELECT ON users,notification_settings,club_memberships,profiles,user_blocks TO ${role}`)
    const before = (await version('other'))!.v
    await client.query('BEGIN')
    await client.query(`SET LOCAL ROLE ${role}`)
    await client.query(
      "INSERT INTO notifications(recipient_id,actor_id,kind,target_type,target_id,category,dedupe_key) VALUES($1,$2,'like','post',$3,'interactions',$4)",
      [ids.other, ids.author, randomUUID(), 'role:' + randomUUID()],
    )
    await client.query('SAVEPOINT probe')
    await expect(client.query('SELECT 1 FROM notification_signals')).rejects.toThrow(/permission denied/)
    await client.query('ROLLBACK TO SAVEPOINT probe')
    await expect(client.query('SELECT bump_notification_signals(ARRAY[$1::uuid])', [ids.other])).rejects.toThrow(/permission denied/)
    await client.query('ROLLBACK')
    await client.query('BEGIN')
    await client.query(`SET LOCAL ROLE ${role}`)
    await client.query(
      "INSERT INTO notifications(recipient_id,actor_id,kind,target_type,target_id,category,dedupe_key) VALUES($1,$2,'like','post',$3,'interactions',$4)",
      [ids.other, ids.author, randomUUID(), 'role:' + randomUUID()],
    )
    await client.query('COMMIT')
    expect((await version('other'))!.v).toBe(before + 1)
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    client.release()
    await db.pool.query(`DROP OWNED BY ${role}`)
    await db.pool.query(`DROP ROLE ${role}`)
  }
})
