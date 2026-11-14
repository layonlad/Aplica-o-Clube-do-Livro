import { createHash, randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import { transaction } from './database.js'
import { HttpError } from './errors.js'
import { validateEpub, type PrivateStorage } from './private-storage.js'
interface FileRow {
  id: string
  book_id: string
  filename: string
  byte_size: number
  object_key: string
  state: string
}
const unavailable = () =>
  new HttpError(
    503,
    'STORAGE_UNAVAILABLE',
    'O armazenamento privado ainda não está configurado neste ambiente.',
  )
const missing = () =>
  new HttpError(404, 'FILE_NOT_FOUND', 'Arquivo não encontrado na sua biblioteca pessoal.')
export class PrivateFiles {
  constructor(
    private pool: Pool,
    private storage?: PrivateStorage,
  ) {}
  private async book(client: PoolClient, userId: string, bookId: string) {
    const result = await client.query(
      "SELECT 1 FROM personal_workspaces WHERE user_id=$1 AND state->'books' @> $2::jsonb",
      [userId, JSON.stringify([{ id: bookId }])],
    )
    if (!result.rowCount) throw missing()
  }
  async list(userId: string, bookId: string) {
    return transaction(this.pool, async (client) => {
      await this.book(client, userId, bookId)
      const result = await client.query(
        'SELECT id,filename,byte_size AS "byteSize",created_at AS "createdAt" FROM private_book_files WHERE owner_user_id=$1 AND book_id=$2 AND state=\'active\' ORDER BY created_at DESC LIMIT 1',
        [userId, bookId],
      )
      return { enabled: !!this.storage, items: result.rows }
    })
  }
  async upload(userId: string, bookId: string, filename: string, bytes: Buffer) {
    const storage = this.storage
    if (!storage) throw unavailable()
    validateEpub(bytes)
    const id = randomUUID(),
      key = `private-epub/${userId}/${id}.epub`,
      hash = createHash('sha256').update(bytes).digest('hex')
    await transaction(this.pool, async (client) => {
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId])
      await this.book(client, userId, bookId)
      const existing = await client.query(
        "SELECT 1 FROM private_book_files WHERE owner_user_id=$1 AND (book_id=$2 OR sha256=$3) AND state IN ('active','pending')",
        [userId, bookId, hash],
      )
      if (existing.rowCount)
        throw new HttpError(
          409,
          'FILE_EXISTS',
          'Este livro ou arquivo já possui uma cópia na sua biblioteca. Não foi criada outra cópia.',
        )
      const total = await client.query(
        "SELECT COALESCE(sum(byte_size),0)::int AS bytes FROM private_book_files WHERE owner_user_id=$1 AND state IN ('active','pending','deleted')",
        [userId],
      )
      if (total.rows[0].bytes + bytes.length > 50000000)
        throw new HttpError(
          409,
          'FILE_QUOTA',
          'Sua conta atingiu a cota inicial de 50 MB de arquivos EPUB.',
        )
      await client.query(
        'INSERT INTO private_book_files(id,owner_user_id,book_id,object_key,filename,sha256,byte_size) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [id, userId, bookId, key, filename, hash, bytes.length],
      )
    })
    try {
      await storage.put(key, bytes)
      await transaction(this.pool, async (client) => {
        await this.book(client, userId, bookId)
        const result = await client.query(
          "UPDATE private_book_files SET state='active' WHERE id=$1 AND owner_user_id=$2 AND state='pending'",
          [id, userId],
        )
        if (!result.rowCount)
          throw new HttpError(
            409,
            'UPLOAD_CANCELLED',
            'O envio foi cancelado porque o livro ou arquivo foi alterado.',
          )
      })
      return { id, filename, byteSize: bytes.length }
    } catch (error) {
      await this.pool.query(
        "UPDATE private_book_files SET state='deleted',deleted_at=COALESCE(deleted_at,now()),purge_after=GREATEST(purge_after,now()+interval '30 minutes') WHERE id=$1 AND state IN ('pending','deleted')",
        [id],
      )
      if (error instanceof HttpError) throw error
      throw new HttpError(
        503,
        'UPLOAD_FAILED',
        'O envio não foi concluído. Nenhum arquivo foi disponibilizado.',
      )
    }
  }
  private async purge(id: string, key: string) {
    await this.storage!.remove(key)
    await this.pool.query(
      "UPDATE private_book_files SET state='purged',last_purge_at=now() WHERE id=$1 AND state IN ('deleted','purged')",
      [id],
    )
  }
  async download(userId: string, id: string) {
    if (!this.storage) throw unavailable()
    const file = await transaction(this.pool, async (client) => {
      const {
        rows: [file],
      } = await client.query<FileRow>(
        "SELECT * FROM private_book_files WHERE id=$1 AND owner_user_id=$2 AND state='active'",
        [id, userId],
      )
      if (!file) throw missing()
      await this.book(client, userId, file.book_id)
      return file
    })
    try {
      return { bytes: await this.storage.get(file.object_key), filename: file.filename }
    } catch {
      throw new HttpError(503, 'DOWNLOAD_FAILED', 'Não foi possível recuperar o arquivo agora.')
    }
  }
  async remove(userId: string, id: string) {
    if (!this.storage) throw unavailable()
    const {
      rows: [file],
    } = await this.pool.query<FileRow>(
      "UPDATE private_book_files SET state='deleted',deleted_at=COALESCE(deleted_at,now()) WHERE id=$1 AND owner_user_id=$2 AND state IN ('active','deleted') RETURNING *",
      [id, userId],
    )
    if (!file) throw missing()
    try {
      await this.purge(id, file.object_key)
      return { purged: true }
    } catch {
      return { purged: false }
    }
  }
  async cleanup(limit = 20) {
    if (!this.storage) throw unavailable()
    await this.pool.query(
      "UPDATE private_book_files SET state='deleted',deleted_at=now() WHERE id IN (SELECT id FROM private_book_files WHERE state='pending' AND created_at<now()-interval '15 minutes' ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED)",
      [Math.max(1, Math.min(50, limit))],
    )
    const { rows } = await this.pool.query<FileRow>(
      "SELECT * FROM private_book_files WHERE (state='deleted' AND purge_after<=now()) OR (state='purged' AND deleted_at>now()-interval '7 days' AND last_purge_at<now()-interval '1 day') ORDER BY created_at LIMIT $1",
      [Math.max(1, Math.min(50, limit))],
    )
    let purged = 0,
      failed = 0
    for (const file of rows) {
      try {
        await this.purge(file.id, file.object_key)
        purged++
      } catch {
        failed++
      }
    }
    return { purged, failed }
  }
}
