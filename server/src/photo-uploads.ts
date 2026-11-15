import type { Pool, PoolClient } from 'pg'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { transaction } from './database.js'
import { HttpError } from './errors.js'
import { authorize } from './service.js'
import { requirePublicProfile } from './public-policy.js'
import type { UserProfile } from './contracts.js'
import type { PrivateStorage } from './private-storage.js'
import { processPhotoFile } from './media-processing.js'

const unavailable = () =>
  new HttpError(
    503,
    'DIRECT_UPLOAD_UNAVAILABLE',
    'O envio de fotos está temporariamente indisponível.',
  )
let finalizing = false
interface Upload {
  id: string
  owner_user_id: string
  club_id: string | null
  content_type: string
  byte_size: number
  object_key: string
  state: string
  expires_at: Date
}
export class PhotoUploads {
  constructor(
    private pool: Pool,
    private storage?: PrivateStorage,
  ) {}
  private async access(client: PoolClient, userId: string, clubId: string | null) {
    if (clubId) await authorize(client, clubId, userId, false, 'update')
    else await requirePublicProfile(client, userId)
  }
  async prepare(
    user: UserProfile,
    input: { id: string; clubId: string | null; contentType: string; byteSize: number },
  ) {
    if (!this.storage?.preparePhotoUpload || !this.storage.copyPhotoToFile) throw unavailable()
    const upload = await transaction(this.pool, async (client) => {
      await this.access(client, user.id, input.clubId)
      // Serializes bounded reservations across accounts; no file bytes pass through this transaction.
      await client.query('SELECT pg_advisory_xact_lock(57291105)')
      const previous = (
        await client.query<Upload>('SELECT * FROM photo_uploads WHERE id=$1 FOR UPDATE', [input.id])
      ).rows[0]
      if (previous) {
        if (
          previous.owner_user_id !== user.id ||
          previous.club_id !== input.clubId ||
          previous.content_type !== input.contentType ||
          previous.byte_size !== input.byteSize
        )
          throw new HttpError(409, 'UPLOAD_CHANGED', 'Este envio já pertence a outro arquivo.')
        if (previous.state === 'completed') return previous
        if (previous.state !== 'issued' || previous.expires_at.getTime() <= Date.now())
          throw new HttpError(410, 'UPLOAD_EXPIRED', 'O envio expirou. Selecione a foto novamente.')
        return previous
      }
      const usage = (
        await client.query(
          `SELECT count(*) FILTER(WHERE owner_user_id=$1 AND created_at>now()-interval '24 hours') AS daily,count(*) FILTER(WHERE owner_user_id=$1 AND state='issued' AND expires_at>now()) AS pending,COALESCE(sum(byte_size) FILTER(WHERE state<>'purged'),0) AS staging FROM photo_uploads`,
          [user.id],
        )
      ).rows[0]
      if (Number(usage.pending) >= 1)
        throw new HttpError(
          409,
          'PHOTO_UPLOAD_IN_PROGRESS',
          'Há um envio de foto em aberto. Cancele-o ou conclua antes de continuar.',
        )
      if (Number(usage.daily) >= 40 || Number(usage.staging) + input.byteSize > 1000000000)
        throw new HttpError(
          429,
          'PHOTO_UPLOAD_QUOTA',
          'Aguarde concluir o envio anterior ou tente novamente mais tarde.',
        )
      const quota = (
        await client.query(
          "SELECT COALESCE(sum(byte_size+thumbnail_size+feed_size),0) AS bytes FROM media_objects WHERE owner_user_id=$1 AND state<>'purged'",
          [user.id],
        )
      ).rows[0]
      if (Number(quota.bytes) >= 50000000)
        throw new HttpError(409, 'MEDIA_QUOTA', 'Sua conta atingiu a cota de mídia.')
      return (
        await client.query<Upload>(
          'INSERT INTO photo_uploads(id,owner_user_id,club_id,content_type,byte_size,object_key) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
          [
            input.id,
            user.id,
            input.clubId,
            input.contentType,
            input.byteSize,
            `photo-staging/${user.id}/${input.id}`,
          ],
        )
      ).rows[0]
    })
    if (upload.state === 'completed')
      return { id: upload.id, completed: true, media: await this.completed(user.id, upload.id) }
    try {
      const staged = await this.storage.photoStatus?.(upload.object_key)
      if (staged?.byteSize === upload.byte_size && staged.contentType === upload.content_type)
        return { id: upload.id, completed: false, uploaded: true }
      return {
        id: upload.id,
        completed: false,
        uploaded: false,
        ...(await this.storage.preparePhotoUpload(
          upload.object_key,
          upload.byte_size,
          upload.content_type,
          Math.max(1, Math.min(300, Math.floor((upload.expires_at.getTime() - Date.now()) / 1000))),
        )),
      }
    } catch {
      throw new HttpError(
        503,
        'UPLOAD_UNAVAILABLE',
        'Não foi possível preparar o envio. Tente novamente.',
      )
    }
  }
  private async completed(userId: string, id: string, client?: PoolClient) {
    const row = (
      await (client ?? this.pool).query(
        "SELECT id,kind,width,height,duration FROM media_objects WHERE id=$1 AND owner_user_id=$2 AND state='active'",
        [id, userId],
      )
    ).rows[0]
    if (!row) throw new HttpError(404, 'MEDIA_NOT_FOUND', 'Esta foto não está disponível.')
    return row
  }
  async complete(user: UserProfile, id: string) {
    if (!this.storage?.copyPhotoToFile) throw unavailable()
    if (finalizing)
      throw new HttpError(
        429,
        'MEDIA_BUSY',
        'Outro arquivo está sendo preparado. Aguarde e tente novamente.',
      )
    finalizing = true
    const storage = this.storage
    let original: string | undefined
    try {
      const result = await transaction(this.pool, async (client) => {
        const upload = (
          await client.query<Upload>(
            'SELECT * FROM photo_uploads WHERE id=$1 AND owner_user_id=$2 FOR UPDATE NOWAIT',
            [id, user.id],
          )
        ).rows[0]
        if (!upload) throw new HttpError(404, 'UPLOAD_NOT_FOUND', 'Este envio não está disponível.')
        if (upload.state === 'completed') return this.completed(user.id, id, client)
        if (upload.state !== 'issued' || upload.expires_at.getTime() <= Date.now())
          throw new HttpError(410, 'UPLOAD_EXPIRED', 'O envio expirou. Selecione a foto novamente.')
        // The row lock makes finalization idempotent, including a lost HTTP response.
        const directory = await mkdtemp(join(tmpdir(), 'clube-photo-'))
        try {
          const path = join(directory, 'original')
          await storage.copyPhotoToFile!(upload.object_key, path, upload.byte_size)
          const photo = await processPhotoFile(path, upload.content_type)
          await this.access(client, user.id, upload.club_id)
          await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id])
          const quota = (
            await client.query(
              "SELECT COALESCE(sum(byte_size+thumbnail_size+feed_size),0) AS bytes FROM media_objects WHERE owner_user_id=$1 AND state<>'purged'",
              [user.id],
            )
          ).rows[0]
          const total = photo.bytes.length + photo.thumbnail.length + photo.feed!.length
          if (Number(quota.bytes) + total > 50000000)
            throw new HttpError(409, 'MEDIA_QUOTA', 'Sua conta atingiu a cota de mídia.')
          const key = `club-media/${upload.club_id}/${id}.webp`,
            thumb = `club-media/${upload.club_id}/${id}-thumb.webp`,
            feed = `club-media/${upload.club_id}/${id}-feed.webp`
          await client.query(
            `INSERT INTO media_objects(id,owner_user_id,club_id,object_key,thumbnail_key,feed_key,kind,mime_type,byte_size,thumbnail_size,feed_size,width,height,state) VALUES($1,$2,$3,$4,$5,$6,'image','image/webp',$7,$8,$9,$10,$11,'pending')`,
            [
              id,
              user.id,
              upload.club_id,
              key,
              thumb,
              feed,
              photo.bytes.length,
              photo.thumbnail.length,
              photo.feed!.length,
              photo.width,
              photo.height,
            ],
          )
          await storage.put(key, photo.bytes, 'image/webp')
          await storage.put(thumb, photo.thumbnail, 'image/webp')
          await storage.put(feed, photo.feed!, 'image/webp')
          await client.query("UPDATE media_objects SET state='active' WHERE id=$1", [id])
          await client.query("UPDATE photo_uploads SET state='completed' WHERE id=$1", [id])
          original = upload.object_key
          return {
            id,
            kind: 'image' as const,
            width: photo.width,
            height: photo.height,
            duration: null,
          }
        } finally {
          await rm(directory, { recursive: true, force: true })
        }
      })
      // A signed POST can still be replayed until expiry; the worker removes this key again later.
      if (original) await storage.remove(original).catch(() => {})
      return result
    } catch (error) {
      if ((error as { code?: string }).code === '55P03')
        throw new HttpError(
          429,
          'MEDIA_BUSY',
          'Esta foto já está sendo preparada. Aguarde e tente novamente.',
        )
      if (error instanceof HttpError) throw error
      throw new HttpError(
        503,
        'PHOTO_PROCESS_FAILED',
        'Não foi possível concluir a foto. Tente novamente o mesmo envio.',
      )
    } finally {
      finalizing = false
    }
  }
  pending(user: UserProfile) {
    return this.pool
      .query(
        "SELECT id FROM photo_uploads WHERE owner_user_id=$1 AND state='issued' AND expires_at>now() ORDER BY created_at DESC LIMIT 1",
        [user.id],
      )
      .then((r) => ({ items: r.rows as { id: string }[] }))
  }
  async cancel(user: UserProfile, id: string) {
    const row = (
      await this.pool.query<Upload>(
        "UPDATE photo_uploads SET state='cancelled' WHERE id=$1 AND owner_user_id=$2 AND state='issued' RETURNING *",
        [id, user.id],
      )
    ).rows[0]
    if (row) await this.storage?.remove(row.object_key).catch(() => {})
    return { cancelled: !!row }
  }
  async cleanup(limit = 20) {
    if (!this.storage) return { purged: 0, failed: 0 }
    const rows = (
      await this.pool.query<Upload>(
        "SELECT * FROM photo_uploads WHERE (expires_at<now()-interval '15 minutes' AND state<>'purged' AND (last_cleanup_at IS NULL OR last_cleanup_at<now()-interval '15 minutes')) OR (state='purged' AND expires_at>now()-interval '1 day' AND last_cleanup_at<now()-interval '1 hour') ORDER BY COALESCE(last_cleanup_at,expires_at) LIMIT $1",
        [limit],
      )
    ).rows
    let purged = 0,
      failed = 0
    for (const candidate of rows) {
      try {
        const removed = await transaction(this.pool, async (client) => {
          const row = (
            await client.query<Upload>(
              "SELECT * FROM photo_uploads WHERE id=$1 AND expires_at<now()-interval '15 minutes' FOR UPDATE SKIP LOCKED",
              [candidate.id],
            )
          ).rows[0]
          if (!row) return false
          await this.storage!.remove(row.object_key)
          if (!(await client.query('SELECT 1 FROM media_objects WHERE id=$1', [row.id])).rowCount) {
            for (const suffix of ['.webp', '-thumb.webp', '-feed.webp'])
              await this.storage!.remove(`club-media/${row.club_id}/${row.id}${suffix}`)
          }
          await client.query(
            "UPDATE photo_uploads SET state='purged',last_cleanup_at=now(),last_cleanup_error=NULL WHERE id=$1",
            [row.id],
          )
          return true
        })
        if (removed) purged++
      } catch {
        failed++
        await this.pool.query(
          "UPDATE photo_uploads SET last_cleanup_at=now(),cleanup_attempts=cleanup_attempts+1,last_cleanup_error='STORAGE' WHERE id=$1",
          [candidate.id],
        )
      }
    }
    await this.pool.query(
      "DELETE FROM photo_uploads WHERE id IN(SELECT id FROM photo_uploads WHERE state='purged' AND expires_at<now()-interval '7 days' ORDER BY expires_at LIMIT 100)",
    )
    return { purged, failed }
  }
}
