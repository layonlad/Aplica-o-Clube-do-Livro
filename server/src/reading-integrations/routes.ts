import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import { HttpError } from '../errors.js'
import type { PrivateFiles } from '../private-files.js'
import { AnnotationImportService } from './annotations.js'
import { KindleExportService } from './kindle-export.js'
import { progressInput, ReadingProgressService } from './progress.js'
import { exportEvents, exportPermissions, maxClippingsBytes, maxImportEntries, readingProviders } from './providers.js'

const bookParams = z.object({ bookId: z.uuid(), provider: z.enum(Object.keys(readingProviders) as (keyof typeof readingProviders)[]) })
const kindleParams = bookParams.pick({ bookId: true })
const resourceParams = kindleParams.extend({ id: z.uuid() })
const fileInput = {
  filename: z.string().min(5).max(200).regex(/\.txt$/i),
  mime: z.enum(['', 'text/plain', 'application/octet-stream']),
  data: z.base64().max(Math.ceil(maxClippingsBytes / 3) * 4),
}
const importLimit = 350_000

function bytes(data: string) {
  const result = Buffer.from(data, 'base64')
  if (result.byteLength > maxClippingsBytes)
    throw new HttpError(413, 'CLIPPINGS_SIZE', 'Escolha um TXT com até 256 KB.')
  return result
}

export function registerReadingIntegrations(api: FastifyInstance, pool: Pool, files: PrivateFiles) {
  const exports = new KindleExportService(pool, files)
  const progress = new ReadingProgressService(pool)
  const annotations = new AnnotationImportService(pool)
  const limited = (max: number) => ({
    rateLimit: { max, timeWindow: '1 minute', hook: 'preHandler' as const, keyGenerator: (request: { user: { id: string } }) => request.user.id },
  })
  api.get('/me/reading-integrations', (request) => progress.list(request.user.id))
  api.post('/me/reading-integrations/:provider/books/:bookId/progress', (request) => {
    const { bookId, provider } = bookParams.parse(request.params)
    return progress.save(request.user.id, bookId, provider, progressInput.parse(request.body))
  })
  api.delete('/me/reading-integrations/:provider/books/:bookId/progress', async (request, reply) => {
    const { bookId, provider } = bookParams.parse(request.params)
    const { revision } = z.object({ revision: z.coerce.number().int().positive() }).strict().parse(request.query)
    await progress.remove(request.user.id, bookId, provider, revision)
    return reply.code(204).send()
  })
  api.get('/me/reading-integrations/kindle/books/:bookId/exports', (request) => exports.info(request.user.id, kindleParams.parse(request.params).bookId))
  api.post('/me/reading-integrations/kindle/books/:bookId/permission', async (request, reply) => {
    const { bookId } = kindleParams.parse(request.params)
    const { fileId, permission } = z.object({ fileId: z.uuid(), permission: z.enum(exportPermissions) }).strict().parse(request.body)
    await exports.setPermission(request.user.id, bookId, fileId, permission)
    return reply.code(204).send()
  })
  api.post('/me/reading-integrations/kindle/books/:bookId/exports', { config: limited(6) }, async (request, reply) => {
    const { fileId } = z.object({ fileId: z.uuid() }).strict().parse(request.body)
    const file = await exports.prepare(request.user.id, kindleParams.parse(request.params).bookId, fileId)
    return reply.type('application/epub+zip')
      .header('X-Reading-Export-Id', file.attemptId)
      .header('Content-Disposition', `attachment; filename="book.epub"; filename*=UTF-8''${encodeURIComponent(file.filename)}`)
      .send(file.bytes)
  })
  api.post('/me/reading-integrations/kindle/books/:bookId/exports/:id', async (request, reply) => {
    const { bookId, id } = resourceParams.parse(request.params)
    const { status } = z.object({ status: z.enum(exportEvents) }).strict().parse(request.body)
    await exports.record(request.user.id, bookId, id, status)
    return reply.code(204).send()
  })
  api.delete('/me/reading-integrations/kindle/books/:bookId/exports', async (request, reply) => {
    await exports.clearHistory(request.user.id, kindleParams.parse(request.params).bookId)
    return reply.code(204).send()
  })
  api.get('/me/reading-integrations/kindle/books/:bookId/annotations', (request) => annotations.list(request.user.id, kindleParams.parse(request.params).bookId))
  api.post('/me/reading-integrations/kindle/annotations/preview', { bodyLimit: importLimit, config: limited(12) }, (request) => {
    const file = z.object(fileInput).strict().parse(request.body)
    return annotations.preview(request.user.id, bytes(file.data))
  })
  api.post('/me/reading-integrations/kindle/books/:bookId/annotations', { bodyLimit: importLimit, config: limited(12) }, (request) => {
    const { bookId } = kindleParams.parse(request.params)
    const input = z.object({
      ...fileInput,
      sourceBook: z.string().min(1).max(400),
      selected: z.array(z.number().int().min(0).max(999)).min(1).max(maxImportEntries),
    }).strict().parse(request.body)
    return annotations.import(request.user.id, bookId, input.sourceBook, input.selected, bytes(input.data))
  })
  api.post('/me/reading-integrations/kindle/books/:bookId/annotations/:id', async (request, reply) => {
    const { bookId, id } = resourceParams.parse(request.params)
    const { note } = z.object({ note: z.string().trim().max(2000).refine((text) => !text.includes('\0')) }).strict().parse(request.body)
    await annotations.edit(request.user.id, bookId, id, note)
    return reply.code(204).send()
  })
  api.delete('/me/reading-integrations/kindle/books/:bookId/annotations/:id', async (request, reply) => {
    const { bookId, id } = resourceParams.parse(request.params)
    await annotations.remove(request.user.id, bookId, id)
    return reply.code(204).send()
  })
}
