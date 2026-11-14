import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import { EventService } from './event-service.js'
import { pageInput } from './pagination.js'
const clubParams = z.object({ clubId: z.uuid() }),
  eventParams = clubParams.extend({ id: z.uuid() })
const input = z
  .object({
    title: z.string().trim().min(1).max(150),
    date: z.iso.datetime({ offset: true }),
    location: z.string().trim().max(200).default(''),
    description: z.string().trim().max(2000).default(''),
    bookId: z.uuid().nullable().optional(),
    topicId: z.uuid().nullable().optional(),
  })
  .strict()
export async function registerEventRoutes(api: FastifyInstance, pool: Pool) {
  const events = new EventService(pool)
  api.get('/clubs/:clubId/events', (request) =>
    events.list(
      request.user,
      clubParams.parse(request.params).clubId,
      pageInput
        .extend({
          from: z.iso.datetime().optional(),
          until: z.iso.datetime().optional(),
          order: z.enum(['asc', 'desc']).default('desc'),
        })
        .strict()
        .parse(request.query),
    ),
  )
  api.get('/clubs/:clubId/events/:id', (request) => {
    const { clubId, id } = eventParams.parse(request.params)
    return events.get(request.user, clubId, id)
  })
  api.post(
    '/clubs/:clubId/events',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          await events.create(
            request.user,
            clubParams.parse(request.params).clubId,
            input.parse(request.body),
          ),
        ),
  )
  api.post('/clubs/:clubId/events/:id/edit', (request) => {
    const { clubId, id } = eventParams.parse(request.params)
    return events.edit(
      request.user,
      clubId,
      id,
      input.extend({ version: z.number().int().min(0) }).parse(request.body),
    )
  })
  api.delete('/clubs/:clubId/events/:id', async (request, reply) => {
    const { clubId, id } = eventParams.parse(request.params)
    await events.remove(request.user, clubId, id)
    return reply.code(204).send()
  })
  api.post('/clubs/:clubId/events/:id/rsvp', (request) => {
    const { clubId, id } = eventParams.parse(request.params)
    return events.rsvp(
      request.user,
      clubId,
      id,
      z
        .object({ value: z.enum(['yes', 'maybe', 'no']) })
        .strict()
        .parse(request.body).value,
    )
  })
  api.get('/clubs/:clubId/events/:id/attendees', (request) => {
    const { clubId, id } = eventParams.parse(request.params)
    return events.attendees(request.user, clubId, id, pageInput.strict().parse(request.query))
  })
  api.post('/clubs/:clubId/events/:id/attendees/:userId', (request) => {
    const { clubId, id, userId } = eventParams.extend({ userId: z.uuid() }).parse(request.params)
    return events.attendance(
      request.user,
      clubId,
      id,
      userId,
      z.object({ attended: z.boolean() }).strict().parse(request.body).attended,
    )
  })
  api.get('/clubs/:clubId/events/:id/legacy-photos', (request) => {
    const { clubId, id } = eventParams.parse(request.params)
    return events.photos(request.user, clubId, id)
  })
}
