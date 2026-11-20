import {cleanupChatMetadata} from './maintenance.js'
import { createHash, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import type { PrivateStorage } from './private-storage.js'
import { PhotoUploads } from './photo-uploads.js'
import { HttpError } from './errors.js'
/** The external scheduler can request bounded cleanup without receiving storage credentials. */
export function registerPhotoMaintenance(
  app: FastifyInstance,
  pool: Pool,
  storage?: PrivateStorage,
  token?: string,
  afterCleanup?: () => Promise<{ inserted: number; failedSources: number; skipped: boolean }>,
) {
  app.post(
    '/internal/photo-cleanup',
    { bodyLimit: 128, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request) => {
      if (!token) throw new HttpError(404, 'NOT_FOUND', 'Recurso não disponível.')
      const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.authorization ?? '')
      if (
        !match ||
        !timingSafeEqual(
          createHash('sha256').update(match[1]).digest(),
          createHash('sha256').update(token).digest(),
        )
      )
        throw new HttpError(401, 'AUTH_REQUIRED', 'Acesso não autorizado.')
      if (!storage) throw new HttpError(503, 'STORAGE_UNAVAILABLE', 'Armazenamento indisponível.')
      await cleanupChatMetadata(pool)
      const photos = await new PhotoUploads(pool, storage).cleanup(20)
      if (!afterCleanup) return photos
      try {
        return { ...photos, literaryNews: await afterCleanup() }
      } catch {
        request.log.warn('Falha na atualização de metadados literários.')
        return { ...photos, literaryNews: { inserted: 0, failedSources: 1, skipped: false } }
      }
    },
  )
}
