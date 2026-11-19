import type { PoolClient } from 'pg'
import { createPool } from './database.js'
import { assertVapidConfig } from './push-config.js'
import { PushWorker } from './push-worker.js'
import * as webpush from 'web-push'
/** One bounded batch. Both the CLI and the private Cloud Run endpoint use it. */
export async function notificationBatch(env: NodeJS.ProcessEnv = process.env) {
  for (const key of [
    'NOTIFICATION_DATABASE_URL',
    'PUSH_PUBLIC_KEY',
    'PUSH_PRIVATE_KEY',
    'PUSH_SUBJECT',
    'PHOTO_CLEANUP_URL',
    'PHOTO_CLEANUP_TOKEN',
  ])
    if (!env[key]) throw Error('Configuração do executor incompleta.')
  const connection = new URL(env.NOTIFICATION_DATABASE_URL!)
  if (
    !['postgres:', 'postgresql:'].includes(connection.protocol) ||
    decodeURIComponent(connection.username) !== 'clube_notifications'
  )
    throw Error('Use a identidade restrita do executor.')
  assertVapidConfig(env.PUSH_PUBLIC_KEY!, env.PUSH_PRIVATE_KEY!, env.PUSH_SUBJECT!)
  const subject = new URL(env.PUSH_SUBJECT!),
    cleanup = new URL(env.PHOTO_CLEANUP_URL!)
  if (
    subject.protocol !== 'https:' ||
    subject.hostname === 'localhost' ||
    cleanup.protocol !== 'https:' ||
    cleanup.username ||
    cleanup.password ||
    cleanup.pathname !== '/internal/photo-cleanup' ||
    cleanup.search ||
    cleanup.hash
  )
    throw Error('Destino do executor inválido.')
  webpush.setVapidDetails(env.PUSH_SUBJECT!, env.PUSH_PUBLIC_KEY!, env.PUSH_PRIVATE_KEY!)
  const pool = createPool(connection.toString(), Number(env.DB_POOL_MAX ?? 10))
  let lease: PoolClient | undefined
  try {
    lease = await pool.connect()
    if (!(await lease.query('SELECT pg_try_advisory_lock(57291106) AS locked')).rows[0].locked)
      return { worker: 'notifications' as const, skipped: true as const }
    try {
      const worker = new PushWorker(pool, {
        publicKey: env.PUSH_PUBLIC_KEY!,
        privateKey: env.PUSH_PRIVATE_KEY!,
        subject: env.PUSH_SUBJECT!,
      })
      const result = await worker.run()
      const response = await fetch(cleanup, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + env.PHOTO_CLEANUP_TOKEN! },
        redirect: 'error',
        signal: AbortSignal.timeout(75000),
      })
      if (!response.ok) throw Error('Limpeza temporária indisponível.')
      const photos = (await response.json()) as { purged: number; failed: number; literaryNews?: { inserted: number; failedSources: number; skipped: boolean } }
      if (!Number.isSafeInteger(photos.purged) || !Number.isSafeInteger(photos.failed))
        throw Error('Resultado de limpeza inválido.')
      return {
        worker: 'notifications' as const,
        ...result,
        temporaryPhotosPurged: photos.purged,
        temporaryPhotosFailed: photos.failed,
        ...(photos.literaryNews && Number.isSafeInteger(photos.literaryNews.inserted) &&
            Number.isSafeInteger(photos.literaryNews.failedSources) &&
            typeof photos.literaryNews.skipped === 'boolean' ? {
          literaryNewsImported: photos.literaryNews.inserted,
          literaryNewsFailedSources: photos.literaryNews.failedSources,
          literaryNewsSkipped: photos.literaryNews.skipped,
        } : {}),
      }
    } finally {
      await lease.query('SELECT pg_advisory_unlock(57291106)')
    }
  } finally {
    lease?.release()
    await pool.end()
  }
}
