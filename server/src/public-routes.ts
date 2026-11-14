import { PublicDiscovery } from './public-discovery.js'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import { PostService } from './post-service.js'
import { ProfileService } from './profile-service.js'
import { ModerationService } from './moderation-service.js'
import { MediaService } from './media-service.js'
import type { PrivateStorage } from './private-storage.js'
import { postInput, postQuery } from './community-contracts.js'
import { pageInput } from './pagination.js'
const idParams = z.object({ id: z.uuid() }),
  commentParams = idParams.extend({ commentId: z.uuid() }),
  bool = z.object({ value: z.boolean() }).strict()
const profileInput = z
  .object({
    handle: z.string().regex(/^[a-z0-9_]{3,30}$/),
    displayName: z.string().trim().min(1).max(100),
    bio: z.string().trim().max(1000),
    genres: z.array(z.string().trim().min(1).max(40)).max(12),
    isPublic: z.boolean(),
    showLibrary: z.boolean(),
    showStats: z.boolean(),
    showClubs: z.boolean(),
    goal: z.number().int().min(1).max(1000),
    avatarId: z.uuid().nullable().optional(),
    coverId: z.uuid().nullable().optional(),
    version: z.number().int().min(0),
  })
  .strict()
export async function registerPublicReads(
  app: FastifyInstance,
  pool: Pool,
  optionalAuth: (request: FastifyRequest) => Promise<void>,
  storage?: PrivateStorage,
  moderatorUids: string[] = [],
) {
  const posts = new PostService(pool, moderatorUids),
    profiles = new ProfileService(pool),
    media = new MediaService(pool, storage)
  await app.register(
    async (publicApi) => {
      publicApi.addHook('onRequest', optionalAuth)
      publicApi.get('/discover', (request) => new PublicDiscovery(pool).get(request.user ?? null))
      publicApi.get('/posts', (request) =>
        posts.list(
          request.user ?? null,
          null,
          postQuery
            .extend({
              author: z.uuid().optional(),
              following: z
                .enum(['1'])
                .optional()
                .transform((value) => value === '1'),
              saved: z
                .enum(['1'])
                .optional()
                .transform((value) => value === '1'),
            })
            .parse(request.query),
        ),
      )
      publicApi.get('/posts/:id', (request) =>
        posts.get(request.user ?? null, null, idParams.parse(request.params).id),
      )
      publicApi.get('/posts/:id/comments', (request) =>
        posts.comments(
          request.user ?? null,
          null,
          idParams.parse(request.params).id,
          pageInput.strict().parse(request.query),
        ),
      )
      publicApi.get('/profiles', (request) =>
        profiles.search(
          request.user ?? null,
          pageInput
            .extend({
              q: z.string().trim().min(2).max(100).optional(),
              genre: z.string().trim().min(1).max(40).optional(),
            })
            .strict()
            .parse(request.query),
        ),
      )
      publicApi.get('/profiles/:id', (request) =>
        profiles.get(request.user ?? null, idParams.parse(request.params).id),
      )
      publicApi.get('/media/:id/content', async (request, reply) => {
        const value = await media.publicContent(
          request.user?.id ?? null,
          idParams.parse(request.params).id,
          z
            .object({ variant: z.enum(['thumbnail', 'full']).default('thumbnail') })
            .strict()
            .parse(request.query).variant === 'thumbnail',
        )
        return reply
          .type(value.mimeType)
          .header('Content-Disposition', 'inline')
          .send(Buffer.from(value.bytes))
      })
    },
    { prefix: '/v1/public' },
  )
}
export async function registerPublicMutations(
  api: FastifyInstance,
  pool: Pool,
  storage?: PrivateStorage,
  moderatorUids: string[] = [],
) {
  const posts = new PostService(pool, moderatorUids),
    profiles = new ProfileService(pool),
    moderation = new ModerationService(pool, moderatorUids),
    media = new MediaService(pool, storage)
  api.get('/me/profile', (request) => profiles.mine(request.user))
  api.post('/me/profile', (request) =>
    profiles.update(request.user, profileInput.parse(request.body)),
  )
  api.get('/me/blocks', (request) =>
    profiles.blocks(request.user, pageInput.strict().parse(request.query)),
  )
  api.post('/public/profiles/:id/follow', (request) =>
    profiles.follow(
      request.user,
      idParams.parse(request.params).id,
      bool.parse(request.body).value,
    ),
  )
  api.post('/public/profiles/:id/block', (request) =>
    profiles.block(request.user, idParams.parse(request.params).id, bool.parse(request.body).value),
  )
  api.post(
    '/public/posts',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) =>
      reply.code(201).send(await posts.create(request.user, null, postInput.parse(request.body))),
  )
  api.post(
    '/public/posts/:id/share',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) =>
      reply.code(201).send(
        await posts.share(
          request.user,
          idParams.parse(request.params).id,
          z
            .object({ body: z.string().trim().max(5000).default('') })
            .strict()
            .parse(request.body).body,
        ),
      ),
  )
  api.post('/public/posts/:id/edit', (request) =>
    posts.edit(
      request.user,
      null,
      idParams.parse(request.params).id,
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
    ),
  )
  api.delete('/public/posts/:id', async (request, reply) => {
    await posts.remove(request.user, null, idParams.parse(request.params).id)
    return reply.code(204).send()
  })
  for (const kind of ['like', 'save'] as const)
    api.post(`/public/posts/:id/${kind}`, (request) =>
      posts.react(
        request.user,
        null,
        idParams.parse(request.params).id,
        kind,
        bool.parse(request.body).value,
      ),
    )
  api.post('/public/posts/:id/vote', (request) =>
    posts.vote(
      request.user,
      null,
      idParams.parse(request.params).id,
      z.object({ optionId: z.uuid() }).strict().parse(request.body).optionId,
    ),
  )
  api.post(
    '/public/posts/:id/comments',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) =>
      reply.code(201).send(
        await posts.comment(
          request.user,
          null,
          idParams.parse(request.params).id,
          z
            .object({ body: z.string().trim().min(1).max(2000), parentId: z.uuid().optional() })
            .strict()
            .parse(request.body),
        ),
      ),
  )
  api.delete('/public/posts/:id/comments/:commentId', async (request, reply) => {
    const { id, commentId } = commentParams.parse(request.params)
    await posts.removeComment(request.user, null, id, commentId)
    return reply.code(204).send()
  })
  api.post('/public/posts/:id/comments/:commentId/like', (request) => {
    const { id, commentId } = commentParams.parse(request.params)
    return posts.likeComment(request.user, null, id, commentId, bool.parse(request.body).value)
  })
  api.get('/public/media/drafts', (request) =>
    media.drafts(request.user.id, null, pageInput.strict().parse(request.query)),
  )
  api.post(
    '/public/media',
    { bodyLimit: 15000000, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
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
          await media.upload(request.user.id, null, input.kind, Buffer.from(input.data, 'base64')),
        )
    },
  )
  api.post(
    '/reports',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = z
        .object({
          kind: z.enum(['post', 'comment', 'profile', 'topic', 'reply']),
          targetId: z.uuid(),
          reason: z.string().trim().min(5).max(1000),
        })
        .strict()
        .parse(request.body)
      return reply
        .code(201)
        .send(await moderation.report(request.user, input.kind, input.targetId, input.reason))
    },
  )
  api.get('/me/moderation', (request) => moderation.permissions(request.user))
  api.get('/moderation/reports', (request) => {
    const { clubId, ...input } = pageInput
      .extend({ clubId: z.uuid().optional() })
      .strict()
      .parse(request.query)
    return moderation.list(request.user, clubId ?? null, input)
  })
  api.post('/moderation/reports/:id/review', (request) => {
    const input = z
      .object({
        decision: z.enum(['dismissed', 'removed']),
        reason: z.string().trim().min(5).max(1000),
      })
      .strict()
      .parse(request.body)
    return moderation.review(
      request.user,
      idParams.parse(request.params).id,
      input.decision,
      input.reason,
    )
  })
}
