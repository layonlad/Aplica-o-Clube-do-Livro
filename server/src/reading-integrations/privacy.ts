import type { PoolClient } from 'pg'
import { HttpError } from '../errors.js'

export async function lockPersonalBook(client: PoolClient, userId: string, bookId: string) {
  const result = await client.query<{ editionId: string | null }>(
    `SELECT book->'metadata'->>'literaryEditionId' AS "editionId"
     FROM personal_workspaces w CROSS JOIN LATERAL jsonb_array_elements(w.state->'books') book
     WHERE w.user_id=$1 AND book->>'id'=$2 FOR UPDATE OF w`,
    [userId, bookId],
  )
  if (!result.rowCount)
    throw new HttpError(404, 'BOOK_NOT_FOUND', 'Este livro não está na sua biblioteca pessoal.')
  return result.rows[0]
}

/** Invoked under the same workspace lock as book removal or replacement. */
export async function pruneIntegrations(client: PoolClient, userId: string, bookIds: string[]) {
  for (const table of ['external_reading_progress', 'imported_reading_annotations', 'reading_export_attempts']) {
    await client.query(
      `DELETE FROM ${table} WHERE user_id=$1 AND NOT (book_id=ANY($2::uuid[]))`,
      [userId, bookIds],
    )
  }
}
