import { assertVapidConfig } from '../src/push-config.js'
import type { PoolClient } from 'pg'
import { createPool } from '../src/database.js'
import { PushWorker } from '../src/push-worker.js'
import * as webpush from 'web-push'
const required = [
  'NOTIFICATION_DATABASE_URL',
  'PUSH_PUBLIC_KEY',
  'PUSH_PRIVATE_KEY',
  'PUSH_SUBJECT',
  'PHOTO_CLEANUP_URL',
  'PHOTO_CLEANUP_TOKEN',
] as const
for (const name of required)
  if (!process.env[name]) {
    console.error('Configuração ausente: ' + name)
    process.exit(1)
  }
const connection = new URL(process.env.NOTIFICATION_DATABASE_URL!)
if (
  !['postgres:', 'postgresql:'].includes(connection.protocol) ||
  decodeURIComponent(connection.username) !== 'clube_notifications'
) {
  console.error('Use a identidade restrita do executor de notificações.')
  process.exit(1)
}
const pool = createPool(connection.toString())
let lease: PoolClient | undefined
try {
  // Validate VAPID before reading any queue. Keys are never logged.
  assertVapidConfig(
    process.env.PUSH_PUBLIC_KEY!,
    process.env.PUSH_PRIVATE_KEY!,
    process.env.PUSH_SUBJECT!,
  )
  webpush.setVapidDetails(
    process.env.PUSH_SUBJECT!,
    process.env.PUSH_PUBLIC_KEY!,
    process.env.PUSH_PRIVATE_KEY!,
  )
  const subject = new URL(process.env.PUSH_SUBJECT!)
  if (subject.protocol !== 'https:' || subject.hostname === 'localhost')
    throw Error('INVALID_SUBJECT')
  lease = await pool.connect()
  if (!(await lease.query('SELECT pg_try_advisory_lock(57291106) AS locked')).rows[0].locked) {
    console.log('Outro executor já está ativo.')
  } else {
    try {
      const worker = new PushWorker(pool, {
        publicKey: process.env.PUSH_PUBLIC_KEY!,
        privateKey: process.env.PUSH_PRIVATE_KEY!,
        subject: process.env.PUSH_SUBJECT!,
      })
      const result = await worker.run()
      const cleanupUrl = new URL(process.env.PHOTO_CLEANUP_URL!)
      if (
        cleanupUrl.protocol !== 'https:' ||
        cleanupUrl.username ||
        cleanupUrl.password ||
        cleanupUrl.pathname !== '/internal/photo-cleanup' ||
        cleanupUrl.search ||
        cleanupUrl.hash
      )
        throw Error('INVALID_CLEANUP_URL')
      const response = await fetch(cleanupUrl, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + process.env.PHOTO_CLEANUP_TOKEN! },
        redirect: 'error',
        signal: AbortSignal.timeout(75000),
      })
      if (!response.ok) throw Error('PHOTO_CLEANUP_UNAVAILABLE')
      const photos = (await response.json()) as { purged: number; failed: number }
      if (!Number.isSafeInteger(photos.purged) || !Number.isSafeInteger(photos.failed))
        throw Error('INVALID_CLEANUP_RESULT')
      console.log(
        JSON.stringify({
          worker: 'notifications',
          ...result,
          temporaryPhotosPurged: photos.purged,
          temporaryPhotosFailed: photos.failed,
        }),
      )
      if (result.failed || photos.failed) process.exitCode = 1
    } finally {
      await lease.query('SELECT pg_advisory_unlock(57291106)')
    }
  }
} catch {
  console.error('Falha no executor de notificações. Confira a configuração e o estado da fila.')
  process.exitCode = 1
} finally {
  lease?.release()
  await pool.end()
}
