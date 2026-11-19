import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import type { ClubFiles } from './club-files.js'
import type { PrivateFiles } from './private-files.js'

const bookParams = z.object({ bookId: z.uuid() })
const clubBookParams = bookParams.extend({ clubId: z.uuid() })
const fileParams = z.object({ id: z.uuid() })
const epubInput = z.object({
  filename: z.string().min(1).max(150).regex(/^[^\p{C}]+\.epub$/iu),
  data: z.string().min(4).max(13333336).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
}).strict()
const clubEpubInput = epubInput.extend({
  source: z.string().trim().min(3).max(500),
  license: z.string().trim().min(5).max(1000),
  authorized: z.literal(true),
})
const uploadLimit = { bodyLimit: 15000000, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }

function sendEpub(reply: FastifyReply, file: { filename: string; bytes: Uint8Array }) {
  return reply.type('application/epub+zip')
    .header('Content-Disposition', `attachment; filename="book.epub"; filename*=UTF-8''${encodeURIComponent(file.filename)}`)
    .send(Buffer.from(file.bytes))
}

export function registerBookFileRoutes(api: FastifyInstance, files: PrivateFiles, clubFiles: ClubFiles) {
  api.get('/me/book-files', request => files.usage(request.user.id))
  api.get('/me/book-files/:bookId', request => files.list(request.user.id, bookParams.parse(request.params).bookId))
  api.get('/me/book-files/:bookId/cover', async (request, reply) =>
    reply.type('image/jpeg').send(await files.cover(request.user.id, bookParams.parse(request.params).bookId)))
  api.post('/me/book-files/:bookId', uploadLimit, async (request, reply) => {
    const { bookId } = bookParams.parse(request.params)
    const { filename, data } = epubInput.parse(request.body)
    const file = await files.upload(request.user.id, bookId, filename, Buffer.from(data, 'base64'))
    return reply.code(201).send(file)
  })
  api.get('/me/files/:id/content', async (request, reply) => {
    const { id } = fileParams.parse(request.params)
    return sendEpub(reply, await files.download(request.user.id, id))
  })
  api.delete('/me/files/:id', async (request, reply) => {
    const { id } = fileParams.parse(request.params)
    const result = await files.remove(request.user.id, id)
    return reply.code(result.purged ? 200 : 202).send(result)
  })

  api.get('/clubs/:clubId/book-files/:bookId', request => {
    const { clubId, bookId } = clubBookParams.parse(request.params)
    return clubFiles.list(request.user, clubId, bookId)
  })
  api.post('/clubs/:clubId/book-files/:bookId', uploadLimit, async (request, reply) => {
    const { clubId, bookId } = clubBookParams.parse(request.params)
    const input = clubEpubInput.parse(request.body)
    const file = await clubFiles.upload(request.user, clubId, bookId, input, Buffer.from(input.data, 'base64'))
    return reply.code(201).send(file)
  })
  api.get('/club-files/:id/content', async (request, reply) => {
    const { id } = fileParams.parse(request.params)
    return sendEpub(reply, await clubFiles.download(request.user, id))
  })
  api.delete('/club-files/:id', async (request, reply) => {
    const { id } = fileParams.parse(request.params)
    const result = await clubFiles.remove(request.user, id)
    return reply.code(result.purged ? 200 : 202).send(result)
  })
}
