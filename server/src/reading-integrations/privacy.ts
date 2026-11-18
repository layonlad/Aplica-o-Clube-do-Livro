import type { PoolClient } from 'pg'
import { HttpError } from '../errors.js'

export async function lockPersonalBook(client: PoolClient, userId: string, bookId: string) {
  const result = await client.query(
    "SELECT 1 FROM personal_workspaces WHERE user_id=$1 AND state->'books' @> $2::jsonb FOR UPDATE",
    [userId, JSON.stringify([{ id: bookId }])],
  )
  if (!result.rowCount)
    throw new HttpError(404, 'BOOK_NOT_FOUND', 'Este livro não está na sua biblioteca pessoal.')
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
