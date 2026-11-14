import { beforeAll, afterAll, expect, it } from 'vitest'
import sharp from 'sharp'
import { buildApp } from '../src/app.js'
import { testDatabase } from './database.js'
import type { Club, Session } from '../src/contracts.js'
import type { Page, PostDto, AlbumPhoto } from '../src/community-contracts.js'
import { MediaService } from '../src/media-service.js'
let db: Awaited<ReturnType<typeof testDatabase>>,
  app: Awaited<ReturnType<typeof buildApp>>,
  club: Club,
  other: Club,
  imageId: string
const ids: Record<string, string> = {},
  objects = new Map<string, Buffer>()
let failDelete = false
const storage = {
  put: async (key: string, bytes: Buffer) => {
    objects.set(key, bytes)
  },
  get: async (key: string) => {
    if (!objects.has(key)) throw Error('missing')
    return objects.get(key)!
  },
  remove: async (key: string) => {
    if (failDelete) throw Error('temporary outage')
    objects.delete(key)
  },
}
const headers = (uid = 'social-owner') => ({ authorization: `Bearer ${uid}` })
const base = () => `/v1/clubs/${club.id}`
const createPost = async (
  input: Record<string, unknown>,
  uid = 'social-owner',
  clubId = club.id,
) => {
  const response = await app.inject({
    url: `/v1/clubs/${clubId}/posts`,
    method: 'POST',
    headers: headers(uid),
    payload: { kind: 'reflection', body: 'Uma leitura para conversar.', ...input },
  })
  expect(response.statusCode, response.body).toBe(201)
  return response.json<{ id: string }>().id
}
const createAlbum = async (input: Record<string, unknown> = {}, clubId = club.id) => {
  const response = await app.inject({
    url: `/v1/clubs/${clubId}/albums`,
    method: 'POST',
    headers: headers(),
    payload: { title: 'Encontro de leitores', eventDate: '2026-11-13', ...input },
  })
  expect(response.statusCode, response.body).toBe(201)
  return response.json<{ id: string }>().id
}
const upload = async (uid = 'social-owner') => {
  const bytes = await sharp({
    create: { width: 80, height: 60, channels: 3, background: '#794384' },
  })
    .jpeg()
    .withMetadata()
    .toBuffer()
  const result = await app.inject({
    url: base() + '/media',
    method: 'POST',
    headers: headers(uid),
    payload: { kind: 'image', data: bytes.toString('base64') },
  })
  expect(result.statusCode, result.body).toBe(201)
  return result.json<{ id: string }>().id
}
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
  for (const uid of [
    'social-owner',
    'social-member',
    'social-moderator',
    'social-other',
    'social-outsider',
  ])
    ids[uid] = (await app.inject({ url: '/v1/me', headers: headers(uid) })).json<Session>().user.id
  club = (
    await app.inject({
      url: '/v1/clubs',
      method: 'POST',
      headers: headers(),
      payload: { name: 'Comunidade A' },
    })
  ).json<Club>()
  other = (
    await app.inject({
      url: '/v1/clubs',
      method: 'POST',
      headers: headers(),
      payload: { name: 'Comunidade B' },
    })
  ).json<Club>()
  await db.pool.query(
    "INSERT INTO club_memberships(club_id,user_id,role) VALUES($1,$2,'member'),($1,$3,'moderator'),($4,$5,'member')",
    [club.id, ids['social-member'], ids['social-moderator'], other.id, ids['social-other']],
  )
})
afterAll(async () => {
  await app?.close()
  await db?.close()
})
it('pagina o mural privado e mantém autoria, edições, likes, comentários e respostas autorizados', async () => {
  const memberPage = (
    await app.inject({ url: base() + '/members?limit=1', headers: headers('social-member') })
  ).json<Page<{ id: string; name: string }>>()
  expect(memberPage.items).toHaveLength(1)
  expect(memberPage.nextCursor).toBeTruthy()
  const memberNext = (
    await app.inject({
      url: base() + `/members?limit=1&cursor=${memberPage.nextCursor}`,
      headers: headers('social-member'),
    })
  ).json<Page<{ id: string }>>()
  expect(memberNext.items[0].id).not.toBe(memberPage.items[0].id)
  const id = await createPost({ body: 'Uma reflexão #literatura' }),
    postUrl = base() + `/posts/${id}`
  expect((await app.inject({ url: base() + '/posts' })).statusCode).toBe(401)
  expect((await app.inject({ url: postUrl, headers: headers('social-other') })).statusCode).toBe(
    404,
  )
  const dto = (
    await app.inject({ url: postUrl, headers: headers('social-member') })
  ).json<PostDto>()
  expect(dto.author).toEqual({ id: ids['social-owner'], name: 'social-owner' })
  expect(JSON.stringify(dto)).not.toMatch(/@example.com|firebase_uid|object_key/)
  const reactions = await Promise.all(
    [1, 2].map(() =>
      app.inject({
        url: postUrl + '/like',
        method: 'POST',
        headers: headers('social-member'),
        payload: { value: true },
      }),
    ),
  )
  expect(reactions.every((response) => response.statusCode === 200)).toBe(true)
  expect((await app.inject({ url: postUrl, headers: headers('social-member') })).json().likes).toBe(
    1,
  )
  const root = (
    await app.inject({
      url: postUrl + '/comments',
      method: 'POST',
      headers: headers('social-member'),
      payload: { body: 'Meu comentário' },
    })
  ).json<{ id: string }>()
  const reply = await app.inject({
    url: postUrl + '/comments',
    method: 'POST',
    headers: headers(),
    payload: { body: 'Uma resposta', parentId: root.id },
  })
  expect(reply.statusCode).toBe(201)
  expect(
    (
      await app.inject({
        url: postUrl + '/comments',
        method: 'POST',
        headers: headers(),
        payload: { body: 'Profundidade excessiva', parentId: reply.json().id },
      })
    ).statusCode,
  ).toBe(400)
  const unrelated = await createPost({ body: 'Outra conversa' })
  expect(
    (
      await app.inject({
        url: base() + `/posts/${unrelated}/comments`,
        method: 'POST',
        headers: headers(),
        payload: { body: 'Pai de outro post', parentId: root.id },
      })
    ).statusCode,
  ).toBe(404)
  expect(
    (
      await app.inject({
        url: postUrl + '/edit',
        method: 'POST',
        headers: headers('social-moderator'),
        payload: { body: 'Trocado por outro autor', quote: '', source: '', version: 0 },
      })
    ).statusCode,
  ).toBe(403)
  expect(
    (
      await app.inject({
        url: postUrl + '/edit',
        method: 'POST',
        headers: headers(),
        payload: { body: 'Revisão da reflexão', quote: '', source: '', version: 0 },
      })
    ).statusCode,
  ).toBe(200)
  expect(
    (
      await app.inject({
        url: postUrl + '/edit',
        method: 'POST',
        headers: headers(),
        payload: { body: 'Revisão obsoleta', quote: '', source: '', version: 0 },
      })
    ).statusCode,
  ).toBe(409)
  const deleted = await app.inject({
    url: postUrl + `/comments/${root.id}`,
    method: 'DELETE',
    headers: headers('social-moderator'),
  })
  expect(deleted.statusCode).toBe(204)
  const comments = (
    await app.inject({ url: postUrl + '/comments', headers: headers('social-member') })
  ).json<Page<{ id: string; deleted: boolean; body: string; author: unknown }>>()
  expect(comments.items.find((item) => item.id === root.id)).toMatchObject({
    deleted: true,
    body: '',
    author: null,
  })
  expect(comments.items.some((item) => item.id === reply.json().id)).toBe(true)
  const pageIds = []
  for (let index = 0; index < 3; index++)
    pageIds.push(await createPost({ body: 'Pagina estável ' + index }))
  await db.pool.query('UPDATE social_posts SET created_at=$2 WHERE id=ANY($1::uuid[])', [
    pageIds,
    '2026-11-13T15:10:10.987654Z',
  ])
  const first = (
    await app.inject({ url: base() + '/posts?q=Pagina&limit=2', headers: headers() })
  ).json<Page<PostDto>>()
  const second = (
    await app.inject({
      url: base() + `/posts?q=Pagina&limit=2&cursor=${first.nextCursor}`,
      headers: headers(),
    })
  ).json<Page<PostDto>>()
  expect(first.items).toHaveLength(2)
  expect(second.items).toHaveLength(1)
  expect(new Set([...first.items, ...second.items].map((post) => post.id)).size).toBe(3)
  expect(second.nextCursor).toBeNull()
  expect(
    (await app.inject({ url: postUrl, method: 'DELETE', headers: headers('social-member') }))
      .statusCode,
  ).toBe(403)
  expect(
    (await app.inject({ url: postUrl, method: 'DELETE', headers: headers('social-moderator') }))
      .statusCode,
  ).toBe(204)
  expect((await app.inject({ url: postUrl, headers: headers() })).statusCode).toBe(404)
})
it('mantém um voto por pessoa e impede votar numa opção de outra publicação', async () => {
  const id = await createPost({
    kind: 'poll',
    body: 'Qual a próxima leitura?',
    options: ['Romance', 'Poesia'],
  })
  const post = (
    await app.inject({ url: base() + `/posts/${id}`, headers: headers('social-member') })
  ).json<PostDto>()
  for (const option of post.options)
    expect(
      (
        await app.inject({
          url: base() + `/posts/${id}/vote`,
          method: 'POST',
          headers: headers('social-member'),
          payload: { optionId: option.id },
        })
      ).statusCode,
    ).toBe(200)
  const next = (
    await app.inject({ url: base() + `/posts/${id}`, headers: headers('social-member') })
  ).json<PostDto>()
  expect(next.options.map((option) => option.votes)).toEqual([0, 1])
  expect(next.options[1].selected).toBe(true)
  const second = await createPost({ kind: 'poll', body: 'Outra pergunta', options: ['A', 'B'] })
  expect(
    (
      await app.inject({
        url: base() + `/posts/${second}/vote`,
        method: 'POST',
        headers: headers('social-member'),
        payload: { optionId: post.options[0].id },
      })
    ).statusCode,
  ).toBe(404)
  expect(
    (
      await app.inject({
        url: base() + '/posts',
        method: 'POST',
        headers: headers(),
        payload: { kind: 'poll', body: 'Inválida', options: ['Repetida', 'Repetida'] },
      })
    ).statusCode,
  ).toBe(400)
})
it('processa fotos privadas de verdade e impede mídia de outro titular ou clube mesmo no banco', async () => {
  imageId = await upload()
  const drafts = (await app.inject({ url: base() + '/media/drafts', headers: headers() })).json<
    Page<{ id: string }>
  >()
  expect(drafts.items.some((item) => item.id === imageId)).toBe(true)
  expect(
    (await app.inject({ url: base() + '/media/drafts', headers: headers('social-member') }))
      .json()
      .items.some((item: { id: string }) => item.id === imageId),
  ).toBe(false)
  const initial = await app.inject({
    url: `/v1/media/${imageId}/content`,
    headers: headers('social-member'),
  })
  expect(initial.statusCode).toBe(404)
  const id = await createPost({ body: 'Nossa foto privada', mediaIds: [imageId] })
  expect(
    (await app.inject({ url: base() + '/media/drafts', headers: headers() }))
      .json()
      .items.some((item: { id: string }) => item.id === imageId),
  ).toBe(false)
  const thumb = await app.inject({
    url: `/v1/media/${imageId}/content`,
    headers: headers('social-member'),
  })
  expect(thumb.statusCode).toBe(200)
  expect(thumb.headers['content-type']).toContain('image/webp')
  expect(thumb.headers['cache-control']).toBe('no-store')
  expect((await sharp(thumb.rawPayload).metadata()).exif).toBeUndefined()
  expect(
    (await app.inject({ url: `/v1/media/${imageId}/content`, headers: headers('social-other') }))
      .statusCode,
  ).toBe(404)
  expect(
    (
      await app.inject({
        url: `/v1/media/${imageId}/content?variant=full&download=1`,
        headers: headers('social-member'),
      })
    ).statusCode,
  ).toBe(403)
  expect(
    (
      await app.inject({
        url: base() + '/posts',
        method: 'POST',
        headers: headers('social-member'),
        payload: { kind: 'meeting', body: 'Imagem não é minha', mediaIds: [imageId] },
      })
    ).statusCode,
  ).toBe(400)
  const otherId = await createPost({ body: 'Outro clube' }, 'social-owner', other.id)
  expect(
    (
      await app.inject({
        url: `/v1/clubs/${other.id}/posts`,
        method: 'POST',
        headers: headers(),
        payload: { kind: 'meeting', body: 'Cruzar escopo', mediaIds: [imageId] },
      })
    ).statusCode,
  ).toBe(400)
  await expect(
    db.pool.query('INSERT INTO post_media(post_id,media_id,scope_id,position) VALUES($1,$2,$3,0)', [
      otherId,
      imageId,
      other.id,
    ]),
  ).rejects.toThrow('foreign key')
  expect((await app.inject({ url: base() + `/posts/${id}`, headers: headers() })).body).not.toMatch(
    /club-media|thumbnail_key|object_key/,
  )
  expect(
    (
      await app.inject({
        url: base() + '/media',
        method: 'POST',
        payload: { kind: 'image', data: 'AAAA' },
      })
    ).statusCode,
  ).toBe(401)
})
it('mantém álbuns no clube correto e só identifica participantes após consentimento', async () => {
  const album = await createAlbum({ allowMemberUpload: false }),
    otherAlbum = await createAlbum({}, other.id)
  expect(
    (
      await app.inject({
        url: base() + `/albums/${album}/photos`,
        method: 'POST',
        headers: headers(),
        payload: { mediaIds: [imageId], caption: 'Nosso encontro' },
      })
    ).statusCode,
  ).toBe(201)
  expect(
    (
      await app.inject({
        url: base() + `/albums/${album}/photos`,
        headers: headers('social-other'),
      })
    ).statusCode,
  ).toBe(404)
  expect(
    (
      await app.inject({
        url: `/v1/clubs/${other.id}/albums/${otherAlbum}/photos`,
        method: 'POST',
        headers: headers(),
        payload: { mediaIds: [imageId] },
      })
    ).statusCode,
  ).toBe(400)
  expect(
    (
      await app.inject({
        url: base() + `/albums/${album}/photos`,
        method: 'POST',
        headers: headers('social-member'),
        payload: { mediaIds: [imageId] },
      })
    ).statusCode,
  ).toBe(403)
  const tagUrl = base() + `/albums/${album}/photos/${imageId}`
  expect(
    (
      await app.inject({
        url: tagUrl + '/tags',
        method: 'POST',
        headers: headers(),
        payload: { userId: ids['social-member'] },
      })
    ).statusCode,
  ).toBe(200)
  const singleAlbum = (
    await app.inject({ url: base() + `/albums/${album}`, headers: headers('social-member') })
  ).json()
  expect(singleAlbum.canUpload).toBe(false)
  expect(singleAlbum.photoCount).toBe(1)
  const singlePhoto = (
    await app.inject({ url: tagUrl, headers: headers('social-member') })
  ).json<AlbumPhoto>()
  expect(singlePhoto.myPendingTag).toBe(true)
  expect(singlePhoto.tags).toEqual([])
  const pending = (
    await app.inject({ url: base() + `/albums/${album}/photos`, headers: headers('social-member') })
  ).json<Page<AlbumPhoto>>()
  expect(pending.items[0].tags).toEqual([])
  expect(pending.items[0].myPendingTag).toBe(true)
  expect(
    (
      await app.inject({
        url: tagUrl + '/consent',
        method: 'POST',
        headers: headers('social-other'),
        payload: { accept: true },
      })
    ).statusCode,
  ).toBe(404)
  expect(
    (
      await app.inject({
        url: tagUrl + '/consent',
        method: 'POST',
        headers: headers('social-member'),
        payload: { accept: true },
      })
    ).statusCode,
  ).toBe(200)
  const accepted = (
    await app.inject({ url: base() + `/albums/${album}/photos`, headers: headers() })
  ).json<Page<AlbumPhoto>>()
  expect(accepted.items[0].tags).toEqual([{ id: ids['social-member'], name: 'social-member' }])
  expect(accepted.items[0].myPendingTag).toBe(false)
  const published = (
    await app.inject({
      url: base() + `/posts/${accepted.items[0].postId}`,
      headers: headers('social-member'),
    })
  ).json<PostDto>()
  expect(published.kind).toBe('meeting')
  expect(published.media[0].id).toBe(imageId)
  expect(
    (await app.inject({ url: tagUrl, method: 'DELETE', headers: headers('social-member') }))
      .statusCode,
  ).toBe(403)
  expect(
    (await app.inject({ url: tagUrl, method: 'DELETE', headers: headers('social-moderator') }))
      .statusCode,
  ).toBe(204)
  expect(
    (await app.inject({ url: base() + `/posts/${accepted.items[0].postId}`, headers: headers() }))
      .statusCode,
  ).toBe(404)
})
it('só publica cópia pública de foto com permissão do álbum e confirmação explícita', async () => {
  const {
    id: profileId,
    suspended,
    ...profile
  } = (await app.inject({ url: '/v1/me/profile', headers: headers() })).json()
  expect(
    (
      await app.inject({
        url: '/v1/me/profile',
        method: 'POST',
        headers: headers(),
        payload: { ...profile, isPublic: true, displayName: 'Leitora da comunidade' },
      })
    ).statusCode,
  ).toBe(200)
  const image = await upload(),
    album = await createAlbum()
  expect(
    (
      await app.inject({
        url: base() + `/albums/${album}/photos`,
        method: 'POST',
        headers: headers(),
        payload: { mediaIds: [image], caption: 'Registro privado' },
      })
    ).statusCode,
  ).toBe(201)
  const url = base() + `/albums/${album}/photos/${image}/publish-public`
  expect(
    (
      await app.inject({
        url,
        method: 'POST',
        headers: headers(),
        payload: { body: 'Publicação deliberada', authorized: true },
      })
    ).statusCode,
  ).toBe(403)
  expect(
    (
      await app.inject({
        url: base() + `/albums/${album}/policy`,
        method: 'POST',
        headers: headers('social-member'),
        payload: {
          version: 0,
          allowMemberUpload: true,
          allowDownload: false,
          allowPublicShare: true,
        },
      })
    ).statusCode,
  ).toBe(403)
  expect(
    (
      await app.inject({
        url: base() + `/albums/${album}/policy`,
        method: 'POST',
        headers: headers(),
        payload: {
          version: 0,
          allowMemberUpload: true,
          allowDownload: false,
          allowPublicShare: true,
        },
      })
    ).statusCode,
  ).toBe(200)
  expect(
    (
      await app.inject({
        url,
        method: 'POST',
        headers: headers(),
        payload: { body: 'Sem confirmação', authorized: false },
      })
    ).statusCode,
  ).toBe(400)
  const shared = await app.inject({
    url,
    method: 'POST',
    headers: headers(),
    payload: { body: 'Publicação deliberada', authorized: true },
  })
  expect(shared.statusCode, shared.body).toBe(201)
  const post = (await app.inject({ url: '/v1/public/posts/' + shared.json().id })).json<PostDto>()
  expect(post.body).toBe('Publicação deliberada')
  expect(post.media[0].id).not.toBe(image)
  expect((await app.inject({ url: `/v1/public/media/${image}/content` })).statusCode).toBe(404)
  expect(
    (await app.inject({ url: `/v1/public/media/${post.media[0].id}/content` })).statusCode,
  ).toBe(200)
  expect(JSON.stringify(post)).not.toContain('Registro privado')
})
it('só expõe capa do clube após autorização separada e oculta ao voltar para privado', async () => {
  const image = await upload(),
    settingsUrl = base() + '/settings',
    settings = (await app.inject({ url: settingsUrl, headers: headers() })).json()
  const input = { ...settings, visibility: 'public', coverMediaId: image, coverIsPublic: false }
  expect(
    (await app.inject({ url: settingsUrl, method: 'POST', headers: headers(), payload: input }))
      .statusCode,
  ).toBe(200)
  expect((await app.inject({ url: `/v1/public/media/${image}/content` })).statusCode).toBe(404)
  expect(
    (await app.inject({ url: `/v1/media/${image}/content`, headers: headers('social-member') }))
      .statusCode,
  ).toBe(200)
  const publicCover = await app.inject({
    url: settingsUrl,
    method: 'POST',
    headers: headers(),
    payload: { ...input, version: 1, coverIsPublic: true },
  })
  expect(publicCover.statusCode, publicCover.body).toBe(200)
  expect((await app.inject({ url: `/v1/public/media/${image}/content` })).statusCode).toBe(200)
  expect(
    (await app.inject({ url: '/v1/discover/clubs' }))
      .json()
      .items.find((c: { id: string }) => c.id === club.id).coverMediaId,
  ).toBe(image)
  const privateAgain = await app.inject({
    url: settingsUrl,
    method: 'POST',
    headers: headers(),
    payload: { ...input, version: 2, visibility: 'private', coverIsPublic: true },
  })
  expect(privateAgain.statusCode, privateAgain.body).toBe(200)
  expect(privateAgain.json().coverIsPublic).toBe(false)
  expect((await app.inject({ url: `/v1/public/media/${image}/content` })).statusCode).toBe(404)
})
it('revoga novas consultas após remoção do membro e limpa falhas de exclusão sem reabrir acesso', async () => {
  const id = await upload(),
    post = await createPost({ body: 'Acesso será revogado', mediaIds: [id] })
  expect(
    (await app.inject({ url: `/v1/media/${id}/content`, headers: headers('social-member') }))
      .statusCode,
  ).toBe(200)
  expect(
    (
      await app.inject({
        url: base() + `/members/${ids['social-member']}`,
        method: 'DELETE',
        headers: headers(),
      })
    ).statusCode,
  ).toBe(204)
  expect(
    (await app.inject({ url: base() + `/posts/${post}`, headers: headers('social-member') }))
      .statusCode,
  ).toBe(404)
  expect(
    (await app.inject({ url: `/v1/media/${id}/content`, headers: headers('social-member') }))
      .statusCode,
  ).toBe(404)
  failDelete = true
  expect(
    (await app.inject({ url: `/v1/media/${id}`, method: 'DELETE', headers: headers() })).statusCode,
  ).toBe(202)
  expect(
    (await app.inject({ url: `/v1/media/${id}/content`, headers: headers() })).statusCode,
  ).toBe(404)
  failDelete = false
  expect(await new MediaService(db.pool, storage).cleanup()).toEqual({ purged: 1, failed: 0 })
  expect(
    (await db.pool.query('SELECT state FROM media_objects WHERE id=$1', [id])).rows[0].state,
  ).toBe('purged')
})
