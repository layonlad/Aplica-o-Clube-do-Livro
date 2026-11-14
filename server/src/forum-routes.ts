import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import { ForumService } from './forum-service.js'
import { forumQuery, replyInput, topicInput } from './forum-contracts.js'
import { pageInput } from './pagination.js'
const clubParams = z.object({ clubId: z.uuid() }),
  topicParams = clubParams.extend({ topicId: z.uuid() })
export async function registerForumRoutes(api: FastifyInstance, pool: Pool) {
  const forum = new ForumService(pool)
  api.get('/clubs/:clubId/forum/topics', (request) =>
    forum.list(
      request.user,
      clubParams.parse(request.params).clubId,
      forumQuery.parse(request.query),
    ),
  )
  api.post(
    '/clubs/:clubId/forum/topics',
    { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          await forum.create(
            request.user,
            clubParams.parse(request.params).clubId,
            topicInput.parse(request.body),
          ),
        ),
  )
  api.get('/clubs/:clubId/forum/topics/:topicId', (request) => {
    const { clubId, topicId } = topicParams.parse(request.params)
    return forum.get(request.user, clubId, topicId)
  })
  api.post('/clubs/:clubId/forum/topics/:topicId/edit', (request) => {
    const { clubId, topicId } = topicParams.parse(request.params)
    return forum.edit(
      request.user,
      clubId,
      topicId,
      z
        .object({
          title: z.string().trim().min(1).max(150),
          body: z.string().trim().min(1).max(5000),
          spoiler: z.boolean(),
          version: z.number().int().min(0),
        })
        .strict()
        .parse(request.body),
    )
  })
  api.post('/clubs/:clubId/forum/topics/:topicId/moderation', (request) => {
    const { clubId, topicId } = topicParams.parse(request.params)
    return forum.moderate(
      request.user,
      clubId,
      topicId,
      z
        .object({
          version: z.number().int().min(0),
          pinned: z.boolean().optional(),
          closed: z.boolean().optional(),
        })
        .strict()
        .refine((input) => input.pinned !== undefined || input.closed !== undefined)
        .parse(request.body),
    )
  })
  api.post('/clubs/:clubId/forum/topics/:topicId/like', (request) => {
    const { clubId, topicId } = topicParams.parse(request.params)
    return forum.like(
      request.user,
      clubId,
      topicId,
      z.object({ value: z.boolean() }).strict().parse(request.body).value,
    )
  })
  api.delete('/clubs/:clubId/forum/topics/:topicId', async (request, reply) => {
    const { clubId, topicId } = topicParams.parse(request.params)
    await forum.remove(request.user, clubId, topicId)
    return reply.code(204).send()
  })
  api.get('/clubs/:clubId/forum/topics/:topicId/replies', (request) => {
    const { clubId, topicId } = topicParams.parse(request.params)
    return forum.replies(request.user, clubId, topicId, pageInput.strict().parse(request.query))
  })
  api.post(
    '/clubs/:clubId/forum/topics/:topicId/replies',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { clubId, topicId } = topicParams.parse(request.params)
      return reply
        .code(201)
        .send(await forum.reply(request.user, clubId, topicId, replyInput.parse(request.body)))
    },
  )
  api.delete('/clubs/:clubId/forum/topics/:topicId/replies/:replyId', async (request, reply) => {
    const { clubId, topicId, replyId } = topicParams
      .extend({ replyId: z.uuid() })
      .parse(request.params)
    await forum.removeReply(request.user, clubId, topicId, replyId)
    return reply.code(204).send()
  })
}
