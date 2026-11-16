import { beforeAll, afterAll, it, expect } from 'vitest'
import * as webpush from 'web-push'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { testDatabase } from './database.js'
import { buildApp } from '../src/app.js'
import { PushWorker } from '../src/push-worker.js'
let db: Awaited<ReturnType<typeof testDatabase>>,
  app: Awaited<ReturnType<typeof buildApp>>,
  club: string
const ids: Record<string, string> = {},
  keys = webpush.generateVAPIDKeys(),
  deliveries: { endpoint: string; payload: string }[] = []
const subscription = (label: string) => ({
  expirationTime: null,
  endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic-' + label,
  keys: { p256dh: keys.publicKey, auth: Buffer.alloc(16, 7).toString('base64url') },
})
const call = (
  path: string,
  uid = 'push-owner',
  method = 'GET',
  payload?: Record<string, unknown>,
) =>
  app.inject({
    url: '/v1' + path,
    method: method as 'GET' | 'POST' | 'DELETE',
    headers: { authorization: 'Bearer ' + uid },
    payload,
  })
const options = {
  publicKey: keys.publicKey,
  privateKey: keys.privateKey,
  subject: 'https://club.example',
  send: async (device: { endpoint: string }, payload: string) => {
    deliveries.push({ endpoint: device.endpoint, payload })
  },
}
beforeAll(async () => {
  db = await testDatabase()
  app = await buildApp({
    pool: db.pool,
    pushPublicKey: keys.publicKey,
    origin: 'https://club.example',
    rateMax: 2000,
    verifyToken: async (uid) => ({
      uid,
      email: uid + '@example.com',
      name: uid,
      emailVerified: true,
    }),
  })
  for (const uid of ['push-owner', 'push-member', 'push-stranger'])
    ids[uid] = (await call('/me', uid)).json().user.id
  club = (await call('/clubs', undefined, 'POST', { name: 'Clube sintético privado' })).json().id
  await db.pool.query("INSERT INTO club_memberships(club_id,user_id,role) VALUES($1,$2,'member')", [
    club,
    ids['push-member'],
  ])
})
afterAll(async () => {
  await app?.close()
  await db?.close()
})
it('registra só após autenticação, impede SSRF e não transfere aparelho entre contas', async () => {
  expect(
    (
      await app.inject({
        url: '/v1/me/push/subscriptions',
        method: 'POST',
        payload: subscription('first'),
      })
    ).statusCode,
  ).toBe(401)
  for (const endpoint of [
    'http://127.0.0.1/push',
    'https://localhost/push',
    'https://fcm.googleapis.com.evil.example/push',
    'https://user:password@fcm.googleapis.com/push',
  ])
    expect(
      (
        await call('/me/push/subscriptions', undefined, 'POST', {
          ...subscription('first'),
          endpoint,
        })
      ).statusCode,
    ).toBe(400)
  expect(
    (await call('/me/push/subscriptions', 'push-member', 'POST', subscription('member')))
      .statusCode,
  ).toBe(200)
  expect(
    (await call('/me/push/subscriptions', 'push-stranger', 'POST', subscription('member')))
      .statusCode,
  ).toBe(409)
  expect(
    (
      await call('/me/push/status', 'push-stranger', 'POST', {
        endpoint: subscription('member').endpoint,
      })
    ).json().enabled,
  ).toBe(false)
})
it('usa fan-out persistente e payload genérico, deduplica entregas e mantém link autorizado', async () => {
  const post = (
    await call(`/clubs/${club}/posts`, undefined, 'POST', {
      body: 'TRECHO PRIVADO NÃO PODE SAIR DO APP',
    })
  ).json()
  const worker = new PushWorker(db.pool, options)
  await worker.run()
  await worker.run()
  expect(deliveries).toHaveLength(1)
  const payload = JSON.parse(deliveries[0].payload)
  expect(Object.keys(payload)).toEqual(['notificationId'])
  expect(deliveries[0].payload).not.toContain('TRECHO')
  expect(deliveries[0].payload).not.toContain(club)
  const target = await call(`/me/notifications/${payload.notificationId}`, 'push-member')
  expect(target.statusCode, target.body).toBe(200)
  expect(target.json().targetId).toBe(post.id)
  expect(
    (await call(`/me/notifications/${payload.notificationId}`, 'push-stranger')).statusCode,
  ).toBe(404)
})
it('revalida bloqueio, preferências e saída do clube antes de enviar', async () => {
  const worker = new PushWorker(db.pool, options),
    before = deliveries.length
  await call(`/clubs/${club}/posts`, undefined, 'POST', { body: 'Não enviar após bloqueio' })
  await worker.fanout()
  await db.pool.query('INSERT INTO user_blocks(blocker_id,blocked_id) VALUES($1,$2)', [
    ids['push-member'],
    ids['push-owner'],
  ])
  const result = await worker.process()
  expect(result.cancelled).toBeGreaterThan(0)
  expect(deliveries).toHaveLength(before)
  await db.pool.query('DELETE FROM user_blocks')
  await call(`/clubs/${club}/posts`, undefined, 'POST', { body: 'Não enviar após saída' })
  await worker.fanout()
  await db.pool.query(
    "UPDATE club_memberships SET status='removed',removed_at=now() WHERE club_id=$1 AND user_id=$2",
    [club, ids['push-member']],
  )
  expect((await worker.process()).cancelled).toBeGreaterThan(0)
  expect(deliveries).toHaveLength(before)
  await db.pool.query(
    "UPDATE club_memberships SET status='active',removed_at=NULL WHERE club_id=$1 AND user_id=$2",
    [club, ids['push-member']],
  )
  const prefs = (await call('/me/notification-preferences', 'push-member')).json()
  await call(`/clubs/${club}/posts`, undefined, 'POST', { body: 'Não enviar após silenciar' })
  await worker.fanout()
  await call('/me/notification-preferences', 'push-member', 'POST', { ...prefs, clubs: false })
  expect((await worker.process()).cancelled).toBeGreaterThan(0)
  expect(deliveries).toHaveLength(before)
  await call('/me/notification-preferences', 'push-member', 'POST', prefs)
})
it('repete falhas temporárias com backoff e revoga assinaturas inválidas', async () => {
  const post = (
    await call(`/clubs/${club}/posts`, undefined, 'POST', { body: 'Teste de reenvio' })
  ).json()
  const worker = new PushWorker(db.pool, {
    ...options,
    send: async () => {
      throw { statusCode: 503 }
    },
  })
  await worker.fanout()
  expect((await worker.process()).retry).toBeGreaterThan(0)
  const row = (
    await db.pool.query(
      "SELECT d.* FROM push_deliveries d JOIN notifications n ON n.id=d.notification_id WHERE n.target_id=$1 AND d.status='pending'",
      [post.id],
    )
  ).rows[0]
  expect(row.attempts).toBe(1)
  expect(row.available_at.getTime()).toBeGreaterThan(Date.now())
  await db.pool.query('UPDATE push_deliveries SET available_at=now() WHERE notification_id=$1', [
    row.notification_id,
  ])
  const gone = new PushWorker(db.pool, {
    ...options,
    send: async () => {
      throw { statusCode: 410 }
    },
  })
  expect((await gone.process()).cancelled).toBeGreaterThan(0)
  expect(
    (
      await call('/me/push/status', 'push-member', 'POST', {
        endpoint: subscription('member').endpoint,
      })
    ).json().enabled,
  ).toBe(false)
})
it('prepara lembrete configurável uma vez e não depende de abrir a central', async () => {
  await call('/me/push/subscriptions', 'push-member', 'POST', subscription('reminder'))
  const prefs = (await call('/me/notification-preferences', 'push-member')).json()
  await call('/me/notification-preferences', 'push-member', 'POST', {
    ...prefs,
    reminderMinutes: 15,
  })
  const eventId = randomUUID()
  await db.pool.query(
    "INSERT INTO club_events(id,club_id,created_by,title,starts_at) VALUES($1,$2,$3,'Encontro sintético',now()+interval '10 minutes')",
    [eventId, club, ids['push-owner']],
  )
  const worker = new PushWorker(db.pool, options)
  await worker.run()
  await worker.run()
  const rows = (
    await db.pool.query(
      "SELECT id FROM notifications WHERE recipient_id=$1 AND target_id=$2 AND kind='event_reminder'",
      [ids['push-member'], eventId],
    )
  ).rows
  expect(rows).toHaveLength(1)
  expect(
    (
      await db.pool.query('SELECT status FROM push_deliveries WHERE notification_id=$1', [
        rows[0].id,
      ])
    ).rows[0].status,
  ).toBe('sent')
})
it('executa a fila com identidade restrita sem DDL, leitura de migrations ou alteração de contas', async () => {
  const role = 'worker_' + randomUUID().replaceAll('-', ''),
    schema = (await db.pool.query('SELECT current_schema() AS schema')).rows[0].schema
  await db.pool.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`)
  let runtime: Pool | undefined
  try {
    const grants = (
      await readFile(new URL('../ops/notification-worker-grants.sql', import.meta.url), 'utf8')
    ).replaceAll('clube_notifications', role)
    await db.pool.query(grants)
    runtime = new Pool({
      connectionString: db.pool.options.connectionString,
      options: `-c search_path=${schema} -c role=${role}`,
    })
    await call(`/clubs/${club}/posts`, undefined, 'POST', { body: 'Com identidade restrita' })
    expect((await new PushWorker(runtime, options).run()).failed).toBe(0)
    await expect(runtime.query('SELECT suspended FROM profiles WHERE false')).resolves.toMatchObject({rowCount:0})
    await expect(runtime.query('SELECT follower_id,followed_id FROM follows WHERE false')).resolves.toMatchObject({rowCount:0})
    await expect(runtime.query('SELECT bio FROM profiles WHERE false')).rejects.toThrow('permission denied')
    await expect(runtime.query('SELECT * FROM follow_requests WHERE false')).rejects.toThrow('permission denied')
    await expect(runtime.query('SELECT * FROM schema_migrations')).rejects.toThrow(
      'permission denied',
    )
    await expect(runtime.query('CREATE TABLE forbidden_worker(id int)')).rejects.toThrow(
      'permission denied',
    )
    await expect(runtime.query('SELECT body FROM social_posts WHERE false')).rejects.toThrow('permission denied')
   await expect(runtime.query('SELECT state FROM club_workspaces WHERE false')).rejects.toThrow('permission denied')
   await expect(runtime.query('DELETE FROM users WHERE false')).rejects.toThrow(
      'permission denied',
    )
    await expect(runtime.query('UPDATE audit_logs SET action=action WHERE false')).rejects.toThrow(
      'permission denied',
    )
  } finally {
    await runtime?.end()
    await db.pool.query(`DROP OWNED BY ${role}`)
    await db.pool.query(`DROP ROLE ${role}`)
  }
})
it('limita os aparelhos ativos por conta e revoga somente a assinatura do titular',async()=>{
 const uid='push-quota',owner=(await call('/me',uid)).json().user.id
 for(let i=0;i<5;i++){const item=subscription('quota-'+i);await db.pool.query('INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth) VALUES($1,$2,$3,$4)',[owner,item.endpoint,item.keys.p256dh,item.keys.auth])}
 const sixth=await call('/me/push/subscriptions',uid,'POST',subscription('quota-six'))
 expect(sixth.statusCode).toBe(429);expect(sixth.json().error.code).toBe('PUSH_QUOTA')
 await call('/me/push/subscriptions','push-stranger','DELETE',{endpoint:subscription('quota-0').endpoint})
 expect((await call('/me/push/status',uid,'POST',{endpoint:subscription('quota-0').endpoint})).json().enabled).toBe(true)
 await call('/me/push/subscriptions',uid,'DELETE',{endpoint:subscription('quota-0').endpoint})
 expect((await call('/me/push/status',uid,'POST',{endpoint:subscription('quota-0').endpoint})).json().enabled).toBe(false)
})
it('detecta menções válidas, respeita perfis privados do clube e revoga a menção removida na edição',async()=>{
 const uid='push-mentioned',user=(await call('/me',uid)).json().user.id
 await call('/me/profile',uid)
 await db.pool.query("UPDATE profiles SET handle='mention_reader',is_public=false WHERE user_id=$1",[user])
 await db.pool.query("INSERT INTO club_memberships(club_id,user_id,role) VALUES($1,$2,'member')",[club,user])
 await call('/me/push/subscriptions',uid,'POST',subscription('mentioned'))
 const post=(await call(`/clubs/${club}/posts`,undefined,'POST',{body:'nome@mention_reader.example não é uma menção.'})).json()
 expect((await db.pool.query('SELECT 1 FROM post_mentions WHERE post_id=$1 AND user_id=$2',[post.id,user])).rowCount).toBe(0)
 const edited=await call(`/clubs/${club}/posts/${post.id}/edit`,undefined,'POST',{body:'Olá @MENTION_READER',quote:'',source:'',version:0})
 expect(edited.statusCode,edited.body).toBe(200)
 expect((await db.pool.query('SELECT 1 FROM post_mentions WHERE post_id=$1 AND user_id=$2',[post.id,user])).rowCount).toBe(1)
 const comment=(await call(`/clubs/${club}/posts/${post.id}/comments`,undefined,'POST',{body:'Uma resposta para @MENTION_READER'})).json()
 const notice=(await db.pool.query("SELECT id FROM notifications WHERE recipient_id=$1 AND context_id=$2 AND kind='mention'",[user,comment.id])).rows[0]
 expect((await call(`/me/notifications/${notice.id}`,uid)).statusCode).toBe(200)
 await call(`/clubs/${club}/posts/${post.id}/comments/${comment.id}/edit`,undefined,'POST',{body:'Resposta sem menção.',version:0})
 expect((await call(`/me/notifications/${notice.id}`,uid)).statusCode).toBe(404)
 await new PushWorker(db.pool,options).process()
 expect((await db.pool.query('SELECT status FROM push_deliveries WHERE notification_id=$1',[notice.id])).rows[0].status).toBe('cancelled')
})
