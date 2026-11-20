import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import { transaction } from '../database.js'
import { HttpError } from '../errors.js'
import { validateEpub } from '../private-storage.js'
import type { PrivateFiles } from '../private-files.js'
import { authorizedEditionAsset, editionFile } from '../literary/free-books.js'
import { lockPersonalBook } from './privacy.js'
import { readingProviders, type exportEvents, type exportPermissions } from './providers.js'

type Permission = (typeof exportPermissions)[number]
type ExportEvent = (typeof exportEvents)[number]
interface ExportableFile { id: string; byteSize: number; filename: string; permission: Permission; editionId?: string }

export function validateKindleFile(file: Pick<ExportableFile, 'byteSize' | 'filename' | 'permission'>) {
  if (file.permission === 'blocked')
    throw new HttpError(403, 'EXPORT_BLOCKED', 'Confirme os direitos deste EPUB para preparar o envio.')
  if (file.byteSize > readingProviders.kindle.webLimitBytes)
    throw new HttpError(413, 'KINDLE_SIZE_LIMIT', 'O Send to Kindle para Web aceita até 200 MB por arquivo.')
  if (file.byteSize > 10_000_000)
    throw new HttpError(413, 'LIBRARY_SIZE_LIMIT', 'A biblioteca prepara EPUBs pessoais de até 10 MB.')
  if (file.byteSize <= 0 || !/\.epub$/i.test(file.filename))
    throw new HttpError(400, 'INVALID_EPUB', 'O original precisa ser um EPUB válido.')
}

export class KindleExportService {
  constructor(private pool: Pool, private files: PrivateFiles) {}

  async info(userId: string, bookId: string) {
    return transaction(this.pool, async (client) => {
      const file = await this.file(client, userId, bookId)
      const history = await client.query<{ id: string; status: string; createdAt: string }>(
        `SELECT id,status,created_at AS "createdAt" FROM reading_export_attempts
         WHERE user_id=$1 AND book_id=$2 AND provider='kindle' ORDER BY created_at DESC,id DESC LIMIT 20`,
        [userId, bookId],
      )
      return { file: file ?? null, history: history.rows }
    })
  }

  setPermission(userId: string, bookId: string, fileId: string, permission: Permission) {
    return transaction(this.pool, async (client) => {
      await lockPersonalBook(client, userId, bookId)
      const result = await client.query(
        `UPDATE private_book_files SET export_permission=$4
         WHERE owner_user_id=$1 AND book_id=$2 AND id=$3 AND state='active'`,
        [userId, bookId, fileId, permission],
      )
      if (!result.rowCount) throw this.missing()
    })
  }

  async prepare(userId: string, bookId: string, fileId: string) {
    const attemptId = randomUUID()
    const file = await transaction(this.pool, async (client) => {
      const current = await this.file(client, userId, bookId)
      this.check(current)
      if (current.id !== fileId) throw this.missing()
      await client.query(
        `INSERT INTO reading_export_attempts(id,user_id,book_id,provider,status)
         VALUES($1,$2,$3,'kindle','preparing')`, [attemptId, userId, bookId],
      )
      await client.query(
        `DELETE FROM reading_export_attempts WHERE id IN
         (SELECT id FROM reading_export_attempts WHERE user_id=$1 AND book_id=$2 AND provider='kindle'
          ORDER BY created_at DESC,id DESC OFFSET 20)`, [userId, bookId],
      )
      return current
    })
    try {
      const original = file.editionId
        ? await editionFile(file.editionId, 'transfer')
        : await this.files.download(userId, file.id)
      validateKindleFile({ ...file, byteSize: original.bytes.byteLength })
      if (original.bytes.byteLength !== file.byteSize)
        throw new HttpError(409, 'EXPORT_FILE_CHANGED', 'O tamanho do original mudou. Revise o arquivo antes de exportar.')
      const bytes = Buffer.from(original.bytes)
      validateEpub(bytes)
      await transaction(this.pool, async (client) => {
        const current = await this.file(client, userId, bookId, true)
        this.check(current)
        if (current.id !== file.id || current.editionId !== file.editionId)
          throw new HttpError(409, 'EXPORT_FILE_CHANGED', 'O original mudou. Prepare o novo arquivo.')
        const result = await client.query(
          "UPDATE reading_export_attempts SET status='available' WHERE id=$1 AND user_id=$2 AND status='preparing'",
          [attemptId, userId],
        )
        if (!result.rowCount)
          throw new HttpError(409, 'EXPORT_EXPIRED', 'A preparação expirou. Tente novamente.')
      })
      return { bytes, filename: original.filename, attemptId }
    } catch (error) {
      await this.pool.query(
        "UPDATE reading_export_attempts SET status='preparation_failed' WHERE id=$1 AND user_id=$2 AND status='preparing'",
        [attemptId, userId],
      )
      throw error
    }
  }

  async record(userId: string, bookId: string, attemptId: string, status: ExportEvent) {
    const result = await this.pool.query(
      `UPDATE reading_export_attempts SET status=$4
       WHERE user_id=$1 AND book_id=$2 AND id=$3 AND provider='kindle'
       AND status IN ('available','download_started','share_requested')`, [userId, bookId, attemptId, status],
    )
    if (!result.rowCount) throw this.missing()
  }

  async clearHistory(userId: string, bookId: string) {
    await this.pool.query('DELETE FROM reading_export_attempts WHERE user_id=$1 AND book_id=$2', [userId, bookId])
  }

  private async file(client: PoolClient, userId: string, bookId: string, lock = false): Promise<ExportableFile | undefined> {
    const { editionId } = await lockPersonalBook(client, userId, bookId)
    const { rows } = await client.query<ExportableFile>(
      `SELECT id,filename,byte_size AS "byteSize",export_permission AS permission FROM private_book_files
       WHERE owner_user_id=$1 AND book_id=$2 AND state='active'${lock ? ' FOR UPDATE' : ''}`,
      [userId, bookId],
    )
    if (rows[0] || !editionId) return rows[0]
    const curated = authorizedEditionAsset(editionId, 'transfer')
    if (curated) return {
      id: bookId, editionId, filename: curated.filename, byteSize: curated.byteSize,
      permission: curated.basis === 'public-domain' ? 'public_domain' : 'licensed_transfer',
    }
  }

  private missing() {
    return new HttpError(404, 'EXPORT_NOT_FOUND', 'Nenhum EPUB pessoal ou preparação disponível para este livro.')
  }

  private check(file: ExportableFile | undefined): asserts file is ExportableFile {
    if (!file) throw this.missing()
    validateKindleFile(file)
  }
}
