import { z } from 'zod'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Pool } from 'pg'
import { pageInput } from '../pagination.js'
import type { WorkspaceService } from '../workspace-service.js'
import { authorDetails, authorPattern, editionPattern, openEdition, searchAuthors, searchWorks, workDetails, workEditions, workPattern } from './open-library.js'
import { bookRecommendations, editionClubs, editionCover, editionFile, freeEdition, searchFree } from './free-books.js'
import { NewsService, newsCategories } from './news.js'

const bookId = z.object({ id: z.string().regex(/^[a-z0-9-]{1,100}$/) })
const uuid = z.object({ id: z.uuid() })
const page = z.object({ page: z.coerce.number().int().min(1).max(50).default(1), limit: z.coerce.number().int().min(1).max(20).default(12) })
const term = z.string().trim().min(2).max(120).optional()
const language = z.string().regex(/^[a-z]{3}$/).optional()
const category = z.enum(Object.keys(newsCategories) as Array<keyof typeof newsCategories>)
const upstreamRate = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }
const workId = z.object({ id: z.string().regex(workPattern) })
const authorId = z.object({ id: z.string().regex(authorPattern) })
const searchInput = page.extend({
  q: term, title: term, author: term, isbn: z.string().regex(/^(?:\d{9}[\dX]|\d{13})$/).optional(),
  subject: term, language, sort: z.enum(['relevance','new','old','popular']).optional(),
}).strict().refine(value => !!(value.q || value.title || value.author || value.isbn || value.subject || value.language))
const freeInput = page.extend({
  q: term, title: term, author: term, genre: z.string().regex(/^[a-z-]{1,50}$/).optional(), language,
  availability: z.enum(['internal','external','catalog']).optional(), format: z.enum(['epub','web']).optional(),
  sort: z.enum(['relevance','new','old']).optional(),
}).strict()
const newsInput = pageInput.extend({ category: category.optional(), followed: z.literal('1').optional() }).strict()

export async function registerLiteraryReads(
  app: FastifyInstance,
  pool: Pool,
  optionalAuth: (request: FastifyRequest) => Promise<void>,
) {
  const news = new NewsService(pool)
  await app.register(async literary => {
    literary.get('/search', upstreamRate, request => searchWorks(searchInput.parse(request.query)))
    literary.get('/works/:id', upstreamRate, request => workDetails(workId.parse(request.params).id))
    literary.get('/works/:id/editions', upstreamRate, request =>
      workEditions(workId.parse(request.params).id, page.strict().parse(request.query)))
    literary.get('/open-editions/:id', upstreamRate, request =>
      openEdition(z.object({ id: z.string().regex(editionPattern) }).parse(request.params).id))
    literary.get('/authors', upstreamRate, request => {
      const { q, ...paging } = page.extend({ q: z.string().trim().min(2).max(120) }).strict().parse(request.query)
      return searchAuthors(q, paging)
    })
    literary.get('/authors/:id', upstreamRate, request => authorDetails(authorId.parse(request.params).id))
    literary.get('/free', request => searchFree(freeInput.parse(request.query)))
    literary.get('/free/:id', request => freeEdition(bookId.parse(request.params).id))
    literary.get('/free/:id/cover', async (request, reply) =>
      reply.type('image/jpeg').header('Cross-Origin-Resource-Policy', 'cross-origin')
        .send(await editionCover(bookId.parse(request.params).id)))
    literary.get('/news', { onRequest: optionalAuth }, request => {
      const { followed, ...input } = newsInput.parse(request.query)
      return news.list(request.user ?? null, { ...input, followed: followed === '1' })
    })
    literary.get('/news/:id', { onRequest: optionalAuth }, request => news.get(request.user ?? null, uuid.parse(request.params).id))
  }, { prefix: '/v1/literary' })
}

export function registerLiteraryAccountRoutes(api: FastifyInstance, pool: Pool, workspace: WorkspaceService, moderatorUids?: string[]) {
  const news = new NewsService(pool, moderatorUids)
  api.post('/me/literary/books/:id', async (request, reply) => {
    const edition = freeEdition(bookId.parse(request.params).id)
    const result = await workspace.addLiteraryEdition(request.user, edition)
    return reply.code(result.created ? 201 : 200).send(result)
  })
  api.get('/me/literary/books/:id/epub', async (request, reply) => {
    const { purpose } = z.object({ purpose: z.enum(['read','download','transfer']).default('read') }).strict().parse(request.query)
    const file = await editionFile(bookId.parse(request.params).id, purpose)
    return reply.type('application/epub+zip')
      .header('Content-Disposition', `${purpose === 'read' ? 'inline' : 'attachment'}; filename="${file.filename}"`)
      .send(file.bytes)
  })
  api.get('/me/literary/books/:id/clubs', request => editionClubs(pool, request.user, freeEdition(bookId.parse(request.params).id)))
  api.get('/me/literary/recommendations', async request => {
    const [recommendations, followed] = await Promise.all([
      bookRecommendations(pool, request.user), news.list(request.user, { followed: true, limit: 5 }),
    ])
    return { ...recommendations, news: followed.items }
  })
  api.get('/me/literary/follows', request => news.follows(request.user))
  api.post('/me/literary/follows', request => news.follow(request.user, z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('topic'), key: category, value: z.boolean() }).strict(),
    z.object({ kind: z.literal('debate'), key: z.uuid(), value: z.boolean() }).strict(),
  ]).parse(request.body)))
  api.post('/me/literary/news/:id/share', { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } }, async (request, reply) => {
    const input = z.union([
      z.object({ clubId: z.uuid(), clientRequestId: z.uuid().optional() }).strict(),
      z.object({ debate: z.literal(true), clientRequestId: z.uuid().optional() }).strict(),
    ]).parse(request.body)
    return reply.code(201).send(await news.share(request.user, uuid.parse(request.params).id, input, input.clientRequestId))
  })
}
