import type { Pool } from 'pg'
import { z } from 'zod'
import { transaction } from '../database.js'
import { HttpError } from '../errors.js'
import { lockPersonalBook } from './privacy.js'
import type { ExternalProgress, ReadingProviderId } from './providers.js'

export const progressInput = z.object({
  percentage: z.number().int().min(0).max(100),
  chapter: z.string().trim().max(150).refine((text) => !text.includes('\0')),
  readingDate: z.iso.date().refine((value) => value >= '1900-01-01'),
  observation: z.string().trim().max(1000).refine((text) => !text.includes('\0')),
  includeInSummary: z.boolean(),
  revision: z.number().int().min(0).max(2147483646),
}).strict()

const progressColumns = `book_id AS "bookId",provider,percentage,chapter,reading_date::text AS "readingDate",
  observation,include_in_summary AS "includeInSummary",revision,updated_at AS "updatedAt"`

export class ReadingProgressService {
  constructor(private pool: Pool) {}

  async list(userId: string) {
    const result = await this.pool.query<ExternalProgress>(
      `SELECT ${progressColumns} FROM external_reading_progress WHERE user_id=$1 ORDER BY updated_at DESC`,
      [userId],
    )
    return result.rows.map((row) => ({ ...row, source: 'manual' as const }))
  }

  save(userId: string, bookId: string, provider: ReadingProviderId, input: z.infer<typeof progressInput>) {
    return transaction(this.pool, async (client) => {
      await lockPersonalBook(client, userId, bookId)
      const values = [userId, bookId, provider, input.percentage, input.chapter, input.readingDate,
        input.observation, input.includeInSummary]
      const result = input.revision === 0
        ? await client.query<ExternalProgress>(
            `INSERT INTO external_reading_progress(user_id,book_id,provider,percentage,chapter,reading_date,observation,include_in_summary)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING ${progressColumns}`, values)
        : await client.query<ExternalProgress>(
            `UPDATE external_reading_progress SET percentage=$4,chapter=$5,reading_date=$6,observation=$7,
             include_in_summary=$8,revision=revision+1,updated_at=now()
             WHERE user_id=$1 AND book_id=$2 AND provider=$3 AND revision=$9 RETURNING ${progressColumns}`,
            [...values, input.revision])
      if (!result.rowCount)
        throw new HttpError(409, 'EXTERNAL_PROGRESS_CHANGED', 'O progresso mudou em outro aparelho. Reabra o painel antes de atualizar.')
      return { ...result.rows[0], source: 'manual' as const }
    })
  }

  remove(userId: string, bookId: string, provider: ReadingProviderId, revision: number) {
    return transaction(this.pool, async (client) => {
      await lockPersonalBook(client, userId, bookId)
      const result = await client.query(
        'DELETE FROM external_reading_progress WHERE user_id=$1 AND book_id=$2 AND provider=$3 AND revision=$4',
        [userId, bookId, provider, revision],
      )
      if (!result.rowCount)
        throw new HttpError(409, 'EXTERNAL_PROGRESS_CHANGED', 'O progresso mudou. Reabra o painel.')
    })
  }
}
