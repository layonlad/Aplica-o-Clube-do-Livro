import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Pool } from 'pg'
import type { PrivateStorage } from './private-storage.js'
import { PostService } from './post-service.js'
import { AlbumService } from './album-service.js'
import { MediaService } from './media-service.js'
import { postInput, postQuery } from './community-contracts.js'
import { pageInput } from './pagination.js'
const clubParams = z.object({ clubId: z.uuid() }),
  postParams = clubParams.extend({ postId: z.uuid() }),
  albumParams = clubParams.extend({ albumId: z.uuid() })
const bool = z.object({ value: z.boolean() }).strict()
const albumInput = z
  .object({
    title: z.string().trim().min(1).max(150),
    description: z.string().trim().max(2000).default(''),
    eventId: z.uuid().nullable().optional(),
    eventDate: z.iso.date(),
    allowMemberUpload: z.boolean().default(true),
    allowDownload: z.boolean().default(false),
    allowPublicShare: z.boolean().default(false),
  })
  .strict()
export async function registerCommunityRoutes(
  api: FastifyInstance,
  pool: Pool,
  storage?: PrivateStorage,
) {
  const posts = new PostService(pool),
    albums = new AlbumService(pool, storage),
    media = new MediaService(pool, storage)
  api.get('/clubs/:clubId/posts', (request) =>
    posts.list(
      request.user,
      clubParams.parse(request.params).clubId,
      postQuery.parse(request.query),
    ),
  )
  api.post(
    '/clubs/:clubId/posts',
    { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          await posts.create(
            request.user,
            clubParams.parse(request.params).clubId,
            postInput.parse(request.body),
          ),
        ),
  )
  api.get('/clubs/:clubId/posts/:postId', (request) => {
    const { clubId, postId } = postParams.parse(request.params)
    return posts.get(request.user, clubId, postId)
  })
  api.post('/clubs/:clubId/posts/:postId/edit', (request) => {
    const { clubId, postId } = postParams.parse(request.params)
    return posts.edit(
      request.user,
      clubId,
      postId,
      z
        .object({
          body: z.string().trim().max(5000),
          quote: z.string().trim().max(280),
          source: z.string().trim().max(500),
          version: z.number().int().min(0),
        })
        .strict()
        .refine((input) => !!input.body || !!input.quote)
        .parse(request.body),
    )
  })
  api.delete('/clubs/:clubId/posts/:postId', async (request, reply) => {
    const { clubId, postId } = postParams.parse(request.params)
    await posts.remove(request.user, clubId, postId)
    return reply.code(204).send()
  })
  for (const kind of ['like', 'save'] as const)
    api.post(`/clubs/:clubId/posts/:postId/${kind}`, (request) => {
      const { clubId, postId } = postParams.parse(request.params)
      return posts.react(request.user, clubId, postId, kind, bool.parse(request.body).value)
    })
  api.post('/clubs/:clubId/posts/:postId/vote', (request) => {
    const { clubId, postId } = postParams.parse(request.params)
    return posts.vote(
      request.user,
      clubId,
      postId,
      z.object({ optionId: z.uuid() }).strict().parse(request.body).optionId,
    )
  })
  api.get('/clubs/:clubId/posts/:postId/comments', (request) => {
    const { clubId, postId } = postParams.parse(request.params)
    return posts.comments(request.user, clubId, postId, pageInput.strict().parse(request.query))
  })
  api.post(
    '/clubs/:clubId/posts/:postId/comments',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { clubId, postId } = postParams.parse(request.params)
      return reply.code(201).send(
        await posts.comment(
          request.user,
          clubId,
          postId,
          z
            .object({ body: z.string().trim().min(1).max(2000), parentId: z.uuid().optional() })
            .strict()
            .parse(request.body),
        ),
      )
    },
  )
  api.delete('/clubs/:clubId/posts/:postId/comments/:commentId', async (request, reply) => {
    const { clubId, postId, commentId } = postParams
      .extend({ commentId: z.uuid() })
      .parse(request.params)
    await posts.removeComment(request.user, clubId, postId, commentId)
    return reply.code(204).send()
  })
  api.post('/clubs/:clubId/posts/:postId/comments/:commentId/like', (request) => {
    const { clubId, postId, commentId } = postParams
      .extend({ commentId: z.uuid() })
      .parse(request.params)
    return posts.likeComment(
      request.user,
      clubId,
      postId,
      commentId,
      bool.parse(request.body).value,
    )
  })
  api.get('/clubs/:clubId/media/drafts', (request) =>
    media.drafts(
      request.user.id,
      clubParams.parse(request.params).clubId,
      pageInput.strict().parse(request.query),
    ),
  )
  api.post(
    '/clubs/:clubId/media',
    { bodyLimit: 15000000, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { clubId } = clubParams.parse(request.params)
      const input = z
        .object({
          kind: z.enum(['image', 'video']),
          data: z
            .string()
            .min(4)
            .max(13333336)
            .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
        })
        .strict()
        .parse(request.body)
      return reply
        .code(201)
        .send(
          await media.upload(
            request.user.id,
            clubId,
            input.kind,
            Buffer.from(input.data, 'base64'),
          ),
        )
    },
  )
  api.get('/media/:id/content', async (request, reply) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params),
      input = z
        .object({
          variant: z.enum(['thumbnail', 'full']).default('thumbnail'),
          download: z.enum(['1']).optional(),
        })
        .strict()
        .parse(request.query)
    const value = await media.content(
      request.user.id,
      id,
      input.variant === 'thumbnail',
      input.download === '1',
    )
    return reply
      .type(value.mimeType)
      .header(
        'Content-Disposition',
        `${input.download ? 'attachment' : 'inline'}; filename="clube-media.${value.mimeType === 'video/mp4' ? 'mp4' : 'webp'}"`,
      )
      .send(Buffer.from(value.bytes))
  })
  api.delete('/media/:id', async (request, reply) => {
    const value = await media.remove(
      request.user.id,
      z.object({ id: z.uuid() }).parse(request.params).id,
    )
    return reply.code(value.purged ? 200 : 202).send(value)
  })
  api.get('/clubs/:clubId/albums', (request) =>
    albums.list(
      request.user,
      clubParams.parse(request.params).clubId,
      pageInput.extend({ eventId: z.uuid().optional() }).strict().parse(request.query),
    ),
  )
  api.post('/clubs/:clubId/albums', async (request, reply) =>
    reply
      .code(201)
      .send(
        await albums.create(
          request.user,
          clubParams.parse(request.params).clubId,
          albumInput.parse(request.body),
        ),
      ),
  )
  api.get('/clubs/:clubId/albums/:albumId', (request) => {
    const { clubId, albumId } = albumParams.parse(request.params)
    return albums.get(request.user, clubId, albumId)
  })
  api.post('/clubs/:clubId/albums/:albumId/policy', (request) => {
    const { clubId, albumId } = albumParams.parse(request.params)
    return albums.updatePolicy(
      request.user,
      clubId,
      albumId,
      z
        .object({
          version: z.number().int().min(0),
          allowMemberUpload: z.boolean(),
          allowDownload: z.boolean(),
          allowPublicShare: z.boolean(),
        })
        .strict()
        .parse(request.body),
    )
  })
  api.post(
    '/clubs/:clubId/albums/:albumId/photos/:mediaId/publish-public',
    { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { clubId, albumId, mediaId } = albumParams
          .extend({ mediaId: z.uuid() })
          .parse(request.params),
        input = z
          .object({ body: z.string().trim().min(1).max(5000), authorized: z.literal(true) })
          .strict()
          .parse(request.body)
      return reply
        .code(201)
        .send(await albums.publishPublic(request.user, clubId, albumId, mediaId, input.body))
    },
  )
  api.get('/clubs/:clubId/albums/:albumId/photos/:mediaId', (request) => {
    const { clubId, albumId, mediaId } = albumParams
      .extend({ mediaId: z.uuid() })
      .parse(request.params)
    return albums.photo(request.user, clubId, albumId, mediaId)
  })
  api.delete('/clubs/:clubId/albums/:albumId', async (request, reply) => {
    const { clubId, albumId } = albumParams.parse(request.params)
    await albums.remove(request.user, clubId, albumId)
    return reply.code(204).send()
  })
  api.get('/clubs/:clubId/albums/:albumId/photos', (request) => {
    const { clubId, albumId } = albumParams.parse(request.params)
    return albums.photos(request.user, clubId, albumId, pageInput.strict().parse(request.query))
  })
  api.post('/clubs/:clubId/albums/:albumId/photos', async (request, reply) => {
    const { clubId, albumId } = albumParams.parse(request.params)
    return reply.code(201).send(
      await albums.addPhotos(
        request.user,
        clubId,
        albumId,
        z
          .object({
            mediaIds: z
              .array(z.uuid())
              .min(1)
              .max(4)
              .refine((ids) => new Set(ids).size === ids.length),
            caption: z.string().trim().max(500).default(''),
          })
          .strict()
          .parse(request.body),
      ),
    )
  })
  api.delete('/clubs/:clubId/albums/:albumId/photos/:mediaId', async (request, reply) => {
    const { clubId, albumId, mediaId } = albumParams
      .extend({ mediaId: z.uuid() })
      .parse(request.params)
    await albums.removePhoto(request.user, clubId, albumId, mediaId)
    return reply.code(204).send()
  })
  api.post(
    '/clubs/:clubId/albums/:albumId/photos/:mediaId/tags',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    (request) => {
      const { clubId, albumId, mediaId } = albumParams
        .extend({ mediaId: z.uuid() })
        .parse(request.params)
      return albums.proposeTag(
        request.user,
        clubId,
        albumId,
        mediaId,
        z.object({ userId: z.uuid() }).strict().parse(request.body).userId,
      )
    },
  )
  api.post('/clubs/:clubId/albums/:albumId/photos/:mediaId/consent', (request) => {
    const { clubId, albumId, mediaId } = albumParams
      .extend({ mediaId: z.uuid() })
      .parse(request.params)
    return albums.consentTag(
      request.user,
      clubId,
      albumId,
      mediaId,
      z.object({ accept: z.boolean() }).strict().parse(request.body).accept,
    )
  })
}
