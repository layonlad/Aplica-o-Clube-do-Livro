import { beforeAll, afterAll, it, expect } from 'vitest'
import { writeFile, truncate } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { testDatabase } from './database.js'
import { buildApp } from '../src/app.js'
import { PhotoUploads } from '../src/photo-uploads.js'
import type { PrivateStorage } from '../src/private-storage.js'
let db: Awaited<ReturnType<typeof testDatabase>>,
  app: Awaited<ReturnType<typeof buildApp>>,
  club: string,
  otherClub: string
const users: Record<string, string> = {},
  objects = new Map<string, Buffer>(),
  sizes = new Map<string, number>()
let photo: Buffer
const storage: PrivateStorage = {
  put: async (key, bytes) => {
    objects.set(key, bytes)
  },
  get: async (key) => {
    if (!objects.has(key)) throw Error('missing')
    return objects.get(key)!
  },
  remove: async (key) => {
    objects.delete(key)
  },
  preparePhotoUpload: async (key, byteSize, contentType) => {
    sizes.set(key, byteSize)
    return { url: 'https://storage.example.test', fields: { key, 'Content-Type': contentType } }
  },
  copyPhotoToFile: async (key, path, maxBytes) => {
    const source = objects.get(key)
    if (!source) throw Error('missing')
    await writeFile(path, source, { flag: 'wx', mode: 0o600 })
    // A sparse original exercises the real file-backed decoder at the 100 MB boundary.
    if (sizes.get(key) === 100000000) await truncate(path, 100000000)
    else if (source.length !== maxBytes) throw Error('incomplete')
    return { byteSize: maxBytes, contentType: 'image/png' }
  },
}
const call = (
  path: string,
  uid = 'mobile-owner',
  method = 'GET',
  payload?: Record<string, unknown>,
) =>
  app.inject({
    url: '/v1' + path,
    method: method as 'GET' | 'POST' | 'DELETE',
    headers: { authorization: 'Bearer ' + uid },
    payload,
  })
beforeAll(async () => {
  db = await testDatabase()
  app = await buildApp({
    pool: db.pool,
    storage,
    origin: 'https://club.example',
    photoCleanupToken: 'a'.repeat(43),
    rateMax: 2000,
    verifyToken: async (uid) => ({
      uid,
      email: uid + '@example.com',
      name: uid,
      emailVerified: true,
    }),
  })
  for (const uid of ['mobile-owner', 'mobile-member', 'mobile-stranger'])
    users[uid] = (await call('/me', uid)).json().user.id
  club = (await call('/clubs', undefined, 'POST', { name: 'Fotos privadas' })).json().id
  otherClub = (await call('/clubs', undefined, 'POST', { name: 'Outro clube' })).json().id
  await db.pool.query("INSERT INTO club_memberships(club_id,user_id,role) VALUES($1,$2,'member')", [
    club,
    users['mobile-member'],
  ])
  photo = await sharp({ create: { width: 32, height: 48, channels: 3, background: '#462b70' } })
    .png()
    .toBuffer()
})
afterAll(async () => {
  await app?.close()
  await db?.close()
})
async function upload(byteSize = photo.length) {
  const id = randomUUID(),
    ticket = await call('/photo-uploads', undefined, 'POST', {
      id,
      clubId: club,
      contentType: 'image/png',
      byteSize,
    })
  expect(ticket.statusCode, ticket.body).toBe(200)
  objects.set(ticket.json().fields.key, photo)
  const result = await call(`/photo-uploads/${id}/complete`, undefined, 'POST', {})
  expect(result.statusCode, result.body).toBe(200)
  return { id, ticket, result }
}
it('recebe original de 100 MB por arquivo temporário, otimiza e finaliza uma única vez', async () => {
  const { id, result, ticket } = await upload(100000000)
  expect(result.json()).toMatchObject({ id, kind: 'image', width: 32, height: 48 })
  expect(objects.has(ticket.json().fields.key)).toBe(false)
  const again = await call(`/photo-uploads/${id}/complete`, undefined, 'POST', {})
  expect(again.json()).toEqual(result.json())
  expect(
    (await db.pool.query('SELECT count(*)::int AS count FROM media_objects WHERE id=$1', [id]))
      .rows[0].count,
  ).toBe(1)
  const row = (await db.pool.query('SELECT * FROM media_objects WHERE id=$1', [id])).rows[0]
  expect(row.byte_size + row.thumbnail_size + row.feed_size).toBeLessThan(100000)
  expect(objects.has(row.feed_key)).toBe(true)
  const denied = await call('/photo-uploads', undefined, 'POST', {
    id: randomUUID(),
    clubId: club,
    contentType: 'image/png',
    byteSize: 100000001,
  })
  expect(denied.statusCode).toBe(400)
  const stranger = await call(`/photo-uploads/${id}/complete`, 'mobile-stranger', 'POST', {})
  expect(stranger.statusCode).toBe(404)
})
it('cancela envio interrompido, revalida associação e rejeita conteúdo disfarçado', async () => {
  const id = randomUUID(),
    input = { id, clubId: club, contentType: 'image/jpeg', byteSize: photo.length }
  const prepared = await call('/photo-uploads', undefined, 'POST', input)
  expect(prepared.statusCode, prepared.body).toBe(200)
  objects.set(prepared.json().fields.key, photo)
  expect((await call(`/photo-uploads/${id}/complete`, undefined, 'POST', {})).statusCode).toBe(400)
  expect(
    (await call('/photo-uploads', undefined, 'POST', { ...input, id: randomUUID() })).json().error
      .code,
  ).toBe('PHOTO_UPLOAD_IN_PROGRESS')
  expect((await call(`/photo-uploads/${id}`, 'mobile-stranger', 'DELETE')).json().cancelled).toBe(
    false,
  )
  expect((await call(`/photo-uploads/${id}`, undefined, 'DELETE')).json().cancelled).toBe(true)
  expect((await call(`/photo-uploads/${id}/complete`, undefined, 'POST', {})).statusCode).toBe(410)
  const stranger = await call('/photo-uploads', 'mobile-stranger', 'POST', {
    ...input,
    id: randomUUID(),
  })
  expect(stranger.statusCode).toBe(403)
  const memberTicket = await call('/photo-uploads', 'mobile-member', 'POST', {
    ...input,
    id: randomUUID(),
    contentType: 'image/png',
  })
  const memberId = memberTicket.json().id
  objects.set(memberTicket.json().fields.key, photo)
  await db.pool.query(
    "UPDATE club_memberships SET status='removed',removed_at=now() WHERE club_id=$1 AND user_id=$2",
    [club, users['mobile-member']],
  )
  expect(
    (await call(`/photo-uploads/${memberId}/complete`, 'mobile-member', 'POST', {})).statusCode,
  ).toBe(403)
  await call(`/photo-uploads/${memberId}`, 'mobile-member', 'DELETE')
  await db.pool.query(
    "UPDATE club_memberships SET status='active',removed_at=NULL WHERE club_id=$1 AND user_id=$2",
    [club, users['mobile-member']],
  )
})
it('preserva texto longo e parágrafos, evita duplicação e mantém fotos inteiras no DTO', async () => {
  const image = await upload(),
    clientRequestId = randomUUID(),
    body = 'Primeiro parágrafo.\n\n' + 'PalavraSemEspaço'.repeat(500) + '\nÚltimo parágrafo.'
  const input = { body, mediaIds: [image.id], clientRequestId }
  const first = await call(`/clubs/${club}/posts`, undefined, 'POST', input)
  expect(first.statusCode, first.body).toBe(201)
  const same = await call(`/clubs/${club}/posts`, undefined, 'POST', input)
  expect(same.json().id).toBe(first.json().id)
  expect(
    (await call(`/clubs/${club}/posts`, undefined, 'POST', { ...input, body: 'Alterado' }))
      .statusCode,
  ).toBe(409)
  const saved = await call(`/clubs/${club}/posts/${first.json().id}`)
  expect(saved.json().body).toBe(body)
  expect(saved.json().media[0]).toMatchObject({ id: image.id, width: 32, height: 48 })
  const video = randomUUID()
  await db.pool.query(
    "INSERT INTO media_objects(id,owner_user_id,club_id,object_key,thumbnail_key,kind,mime_type,byte_size,thumbnail_size,width,height,duration,state) VALUES($1,$2,$3,$4,$5,'video','video/mp4',1,1,8,8,1,'active')",
    [video, users['mobile-owner'], club, video, video + 'thumb'],
  )
  expect(
    (
      await call(`/clubs/${club}/posts`, undefined, 'POST', {
        body: 'Sem vídeo novo',
        mediaIds: [video],
      })
    ).statusCode,
  ).toBe(400)
})
it('anexa fotos a comentários, permite edição própria e mantém privacidade e agrupamento', async () => {
  const image = await upload(),
    post = (await call(`/clubs/${club}/posts`, undefined, 'POST', { body: 'Uma conversa' })).json()
  const path = `/clubs/${club}/posts/${post.id}/comments`
  const root = (
    await call(path, undefined, 'POST', { body: 'Minha foto\nSegunda linha', mediaIds: [image.id] })
  ).json()
  const reply = (
    await call(path, 'mobile-member', 'POST', { body: 'Resposta', parentId: root.id })
  ).json()
  const nested = (
    await call(path, undefined, 'POST', { body: 'Resposta à resposta', parentId: reply.id })
  ).json()
  const nestedDto = await call(`${path}/${nested.id}`)
  expect(nestedDto.json().parentId).toBe(root.id)
  expect(
    (
      await db.pool.query(
        "SELECT 1 FROM notifications WHERE recipient_id=$1 AND context_id=$2 AND kind='reply'",
        [users['mobile-member'], nested.id],
      )
    ).rowCount,
  ).toBe(1)
  const edit = await call(`${path}/${root.id}/edit`, undefined, 'POST', {
    body: 'Editado\ncom parágrafos',
    version: 0,
  })
  expect(edit.statusCode, edit.body).toBe(200)
  expect(
    (await call(`${path}/${root.id}/edit`, undefined, 'POST', { body: 'Concorrente', version: 0 }))
      .statusCode,
  ).toBe(409)
  expect(
    (
      await call(`${path}/${root.id}/edit`, 'mobile-member', 'POST', {
        body: 'Outra pessoa',
        version: 1,
      })
    ).statusCode,
  ).toBe(403)
  const dto = (await call(`${path}/${root.id}`)).json()
  expect(dto.media.map((m: { id: string }) => m.id)).toEqual([image.id])
  expect(dto.canEdit).toBe(true)
  expect((await call(`/media/${image.id}/content?variant=feed`, 'mobile-member')).statusCode).toBe(
    200,
  )
  expect(
    (await call(`/media/${image.id}/content?variant=feed`, 'mobile-stranger')).statusCode,
  ).toBe(404)
  const otherPost = (
    await call(`/clubs/${otherClub}/posts`, undefined, 'POST', { body: 'Outro clube' })
  ).json()
  expect(
    (
      await call(`/clubs/${otherClub}/posts/${otherPost.id}/comments`, undefined, 'POST', {
        body: 'Escopo errado',
        mediaIds: [image.id],
      })
    ).statusCode,
  ).toBe(400)
  await expect(
    db.pool.query(
      'INSERT INTO comment_media(comment_id,post_id,scope_id,media_id,position) VALUES($1,$2,$3,$4,0)',
      [root.id, post.id, otherClub, image.id],
    ),
  ).rejects.toThrow()
  await call(`${path}/${root.id}`, undefined, 'DELETE')
  expect((await call(`/media/${image.id}/content?variant=feed`, 'mobile-member')).statusCode).toBe(
    404,
  )
})
it('limpa originais expirados e arquivos órfãos conhecidos sem remover mídia finalizada', async () => {
  const { id, result } = await upload()
  const row = (await db.pool.query('SELECT * FROM photo_uploads WHERE id=$1', [id])).rows[0]
  objects.set(row.object_key, photo) // Replay is possible only until the signed POST expires.
  await db.pool.query(
    "UPDATE photo_uploads SET expires_at=now()-interval '20 minutes' WHERE id=$1",
    [id],
  )
  expect((await new PhotoUploads(db.pool, storage).cleanup()).purged).toBeGreaterThan(0)
  expect(objects.has(row.object_key)).toBe(false)
  expect((await call(`/media/${result.json().id}/content?variant=full`)).statusCode).toBe(200)
})

it('exige a credencial de manutenção e não entrega chaves de arquivos ao executor', async () => {
  const denied = await app.inject({ url: '/internal/photo-cleanup', method: 'POST' })
  expect(denied.statusCode).toBe(401)
  const allowed = await app.inject({
    url: '/internal/photo-cleanup',
    method: 'POST',
    headers: { authorization: 'Bearer ' + 'a'.repeat(43) },
  })
  expect(allowed.statusCode, allowed.body).toBe(200)
  expect(Object.keys(allowed.json()).sort()).toEqual(['failed', 'purged'])
})
it('usa os novos fluxos com a matriz exata do papel de runtime', async () => {
  const { Pool } = await import('pg'),
    { readFile } = await import('node:fs/promises')
  const role = 'photo_runtime_' + randomUUID().replaceAll('-', ''),
    schema = (await db.pool.query('SELECT current_schema() AS name')).rows[0].name
  await db.pool.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`)
  let runtime: InstanceType<typeof Pool> | undefined,
    runtimeApp: Awaited<ReturnType<typeof buildApp>> | undefined
  try {
    await db.pool.query(
      (await readFile(new URL('../ops/runtime-grants.sql', import.meta.url), 'utf8')).replaceAll(
        'clube_runtime',
        role,
      ),
    )
    runtime = new Pool({
      connectionString: db.pool.options.connectionString,
      options: `-c search_path=${schema} -c role=${role}`,
    })
    runtimeApp = await buildApp({
      pool: runtime,
      storage,
      origin: 'https://club.example',
      verifyToken: async (uid) => ({
        uid,
        email: uid + '@example.com',
        name: uid,
        emailVerified: true,
      }),
    })
    const id = randomUUID(),
      headers = { authorization: 'Bearer mobile-owner' }
    const ticket = await runtimeApp.inject({
      url: '/v1/photo-uploads',
      method: 'POST',
      headers,
      payload: { id, clubId: club, contentType: 'image/png', byteSize: photo.length },
    })
    expect(ticket.statusCode, ticket.body).toBe(200)
    objects.set(ticket.json().fields.key, photo)
    const complete = await runtimeApp.inject({
      url: `/v1/photo-uploads/${id}/complete`,
      method: 'POST',
      headers,
      payload: {},
    })
    expect(complete.statusCode, complete.body).toBe(200)
    const post = await runtimeApp.inject({
      url: `/v1/clubs/${club}/posts`,
      method: 'POST',
      headers,
      payload: { body: 'Runtime restrito', mediaIds: [id] },
    })
    expect(post.statusCode, post.body).toBe(201)
    const comment = await runtimeApp.inject({
      url: `/v1/clubs/${club}/posts/${post.json().id}/comments`,
      method: 'POST',
      headers,
      payload: { body: 'Foto no comentário', mediaIds: [id] },
    })
    expect(comment.statusCode, comment.body).toBe(201)
    await expect(runtime.query('SELECT * FROM schema_migrations')).rejects.toThrow(
      'permission denied',
    )
    await expect(runtime.query('DELETE FROM users WHERE false')).rejects.toThrow(
      'permission denied',
    )
  } finally {
    await runtimeApp?.close()
    await runtime?.end()
    await db.pool.query(`DROP OWNED BY ${role}`)
    await db.pool.query(`DROP ROLE ${role}`)
  }
})
it('impõe a cota diária de originais mesmo depois da limpeza', async () => {
  const uid = 'photo-quota-user',
    owner = (await call('/me', uid)).json().user.id,
    ownedClub = (await call('/clubs', uid, 'POST', { name: 'Cota sintética' })).json().id
  for (let i = 0; i < 40; i++)
    await db.pool.query(
      "INSERT INTO photo_uploads(id,owner_user_id,club_id,content_type,byte_size,object_key,state) VALUES($1,$2,$3,'image/png',1,$4,'purged')",
      [randomUUID(), owner, ownedClub, 'quota/' + randomUUID()],
    )
  const result = await call('/photo-uploads', uid, 'POST', {
    id: randomUUID(),
    clubId: ownedClub,
    contentType: 'image/png',
    byteSize: photo.length,
  })
  expect(result.statusCode).toBe(429)
  expect(result.json().error.code).toBe('PHOTO_UPLOAD_QUOTA')
})
