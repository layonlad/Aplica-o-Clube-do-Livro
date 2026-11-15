import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import type { PrivateStorage } from './private-storage.js'
import { PhotoUploads } from './photo-uploads.js'
export async function registerPhotoRoutes(
  api: FastifyInstance,
  pool: Pool,
  storage?: PrivateStorage,
) {
  const photos = new PhotoUploads(pool, storage),
    params = z.object({ id: z.uuid() })
  api.get('/photo-uploads', (request) => photos.pending(request.user))
  api.post(
    '/photo-uploads',
    {
      config: {
        rateLimit: {
          max: 15,
          timeWindow: '1 minute',
          hook: 'preHandler',
          keyGenerator: (request) => request.user.id,
        },
      },
    },
    (request) =>
      photos.prepare(
        request.user,
        z
          .object({
            id: z.uuid(),
            clubId: z.uuid().nullable(),
            contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
            byteSize: z.number().int().min(1).max(100000000),
          })
          .strict()
          .parse(request.body),
      ),
  )
  api.post(
    '/photo-uploads/:id/complete',
    {
      config: {
        rateLimit: {
          max: 15,
          timeWindow: '1 minute',
          hook: 'preHandler',
          keyGenerator: (request) => request.user.id,
        },
      },
    },
    (request) => photos.complete(request.user, params.parse(request.params).id),
  )
  api.delete('/photo-uploads/:id', (request) =>
    photos.cancel(request.user, params.parse(request.params).id),
  )
}
