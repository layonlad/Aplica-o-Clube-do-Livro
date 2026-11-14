import { createHash, randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import type { UserProfile } from './contracts.js'
import { transaction } from './database.js'
import { authorize } from './service.js'
import { can, assertCapability } from './permissions.js'
import { HttpError } from './errors.js'
import { validateEpub, type PrivateStorage } from './private-storage.js'
const missing = () =>
  new HttpError(404, 'FILE_NOT_FOUND', 'Este arquivo não está disponível no clube.')
const unavailable = () =>
  new HttpError(
    503,
    'STORAGE_UNAVAILABLE',
    'O armazenamento ainda não está configurado neste ambiente.',
  )
interface FileRow {
  id: string
  club_id: string
  book_id: string
  object_key: string
  filename: string
}
export class ClubFiles {
  constructor(
    private pool: Pool,
    private storage?: PrivateStorage,
  ) {}
  private async book(client: PoolClient, clubId: string, bookId: string) {
    if (
      !(
        await client.query(
          "SELECT 1 FROM club_workspaces WHERE club_id=$1 AND state->'books' @> $2::jsonb",
          [clubId, JSON.stringify([{ id: bookId }])],
        )
      ).rowCount
    )
      throw missing()
  }
  list(user: UserProfile, clubId: string, bookId: string) {
    return transaction(this.pool, async (client) => {
      const club = await authorize(client, clubId, user.id, false, 'share')
      await this.book(client, clubId, bookId)
      const { rows } = await client.query(
        'SELECT id,filename,source,license,byte_size AS "byteSize",created_at AS "createdAt" FROM club_book_files WHERE club_id=$1 AND book_id=$2 AND state=\'active\' ORDER BY created_at DESC LIMIT 1',
        [clubId, bookId],
      )
      return { enabled: !!this.storage, canManage: can(club.role, 'manageLibrary'), items: rows }
    })
  }
  async upload(
    user: UserProfile,
    clubId: string,
    bookId: string,
    input: { filename: string; source: string; license: string },
    bytes: Buffer,
  ) {
    if (!this.storage) throw unavailable()
    validateEpub(bytes)
    const id = randomUUID(),
      key = `club-epub/${clubId}/${id}.epub`,
      hash = createHash('sha256').update(bytes).digest('hex')
    await transaction(this.pool, async (client) => {
      assertCapability((await authorize(client, clubId, user.id)).role, 'manageLibrary')
      await this.book(client, clubId, bookId)
      if (
        (
          await client.query(
            "SELECT 1 FROM club_book_files WHERE club_id=$1 AND book_id=$2 AND state IN ('pending','active')",
            [clubId, bookId],
          )
        ).rowCount
      )
        throw new HttpError(409, 'FILE_EXISTS', 'Este título já tem um EPUB no clube.')
      const total = (
        await client.query(
          "SELECT COALESCE(sum(byte_size),0)::bigint AS bytes FROM club_book_files WHERE club_id=$1 AND state<>'purged'",
          [clubId],
        )
      ).rows[0]
      if (Number(total.bytes) + bytes.length > 50000000)
        throw new HttpError(
          409,
          'FILE_QUOTA',
          'Este clube atingiu a cota inicial de 50 MB de EPUBs compartilhados.',
        )
      await client.query(
        'INSERT INTO club_book_files(id,club_id,book_id,uploaded_by,filename,source,license,object_key,sha256,byte_size) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [
          id,
          clubId,
          bookId,
          user.id,
          input.filename,
          input.source,
          input.license,
          key,
          hash,
          bytes.length,
        ],
      )
    })
    try {
      await this.storage.put(key, bytes)
      await transaction(this.pool, async (client) => {
        assertCapability((await authorize(client, clubId, user.id)).role, 'manageLibrary')
        await this.book(client, clubId, bookId)
        if (
          !(
            await client.query(
              "UPDATE club_book_files SET state='active' WHERE id=$1 AND state='pending'",
              [id],
            )
          ).rowCount
        )
          throw missing()
        await client.query(
          "INSERT INTO audit_logs(club_id,actor_user_id,action,entity_id) VALUES($1,$2,'club-file.published',$3)",
          [clubId, user.id, id],
        )
      })
      return { id, filename: input.filename, byteSize: bytes.length }
    } catch (error) {
      await this.pool.query(
        "UPDATE club_book_files SET state='deleted',deleted_at=COALESCE(deleted_at,now()),purge_after=GREATEST(purge_after,now()+interval '30 minutes') WHERE id=$1 AND state IN ('pending','deleted')",
        [id],
      )
      if (error instanceof HttpError) throw error
      throw new HttpError(503, 'UPLOAD_FAILED', 'Não foi possível publicar o EPUB autorizado.')
    }
  }
  async download(user: UserProfile, id: string) {
    if (!this.storage) throw unavailable()
    const file = await transaction(this.pool, async (client) => {
      const {
        rows: [file],
      } = await client.query<FileRow>(
        "SELECT * FROM club_book_files WHERE id=$1 AND state='active'",
        [id],
      )
      if (!file) throw missing()
      await authorize(client, file.club_id, user.id, false, 'share')
      await this.book(client, file.club_id, file.book_id)
      return file
    })
    try {
      return { bytes: await this.storage.get(file.object_key), filename: file.filename }
    } catch {
      throw new HttpError(503, 'DOWNLOAD_FAILED', 'Não foi possível carregar este arquivo agora.')
    }
  }
  async remove(user: UserProfile, id: string) {
    if (!this.storage) throw unavailable()
    const file = await transaction(this.pool, async (client) => {
      const {
        rows: [file],
      } = await client.query<FileRow>(
        "SELECT * FROM club_book_files WHERE id=$1 AND state IN ('active','deleted')",
        [id],
      )
      if (!file) throw missing()
      assertCapability((await authorize(client, file.club_id, user.id)).role, 'manageLibrary')
      await client.query(
        "UPDATE club_book_files SET state='deleted',deleted_at=COALESCE(deleted_at,now()) WHERE id=$1",
        [id],
      )
      await client.query(
        "INSERT INTO audit_logs(club_id,actor_user_id,action,entity_id) VALUES($1,$2,'club-file.deleted',$3)",
        [file.club_id, user.id, id],
      )
      return file
    })
    try {
      await this.purge(file)
      return { purged: true }
    } catch {
      return { purged: false }
    }
  }
  private async purge(file: FileRow) {
    await this.storage!.remove(file.object_key)
    await this.pool.query(
      "UPDATE club_book_files SET state='purged',last_purge_at=now() WHERE id=$1 AND state IN ('deleted','purged')",
      [file.id],
    )
  }
  async cleanup(limit = 20) {
    if (!this.storage) throw unavailable()
    limit = Math.max(1, Math.min(50, limit))
    await this.pool.query(
      "UPDATE club_book_files SET state='deleted',deleted_at=now() WHERE id IN(SELECT id FROM club_book_files WHERE state='pending' AND created_at<now()-interval '30 minutes' LIMIT $1 FOR UPDATE SKIP LOCKED)",
      [limit],
    )
    const { rows } = await this.pool.query<FileRow>(
      "SELECT * FROM club_book_files WHERE (state='deleted' AND purge_after<=now()) OR (state='purged' AND deleted_at>now()-interval '7 days' AND last_purge_at<now()-interval '1 day') ORDER BY created_at LIMIT $1",
      [limit],
    )
    let purged = 0,
      failed = 0
    for (const file of rows) {
      try {
        await this.purge(file)
        purged++
      } catch {
        failed++
      }
    }
    return { purged, failed }
  }
}
