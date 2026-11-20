import { createHash, randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import { transaction } from '../database.js'
import { HttpError } from '../errors.js'
import { parseClippings } from './clippings.js'
import { lockPersonalBook } from './privacy.js'
import { maxImportEntries, type ImportedClipping } from './providers.js'

const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase()
  .trim().replace(/\s+/g, ' ')
const fingerprint = (item: ImportedClipping) => createHash('sha256').update(JSON.stringify([
  normalize(item.sourceBook), item.kind, item.location.replace(/\s/g, ''), normalize(item.content),
])).digest('hex')

export function matchBook(source: string, books: { id: string; title: string; author: string }[]) {
  const match = /^(.*?)\s+\(([^()]+)\)$/.exec(source)
  if (!match) return null
  const candidates = books.filter((book) => normalize(book.title) === normalize(match[1])
    && normalize(book.author) === normalize(match[2]))
  return candidates.length === 1 ? candidates[0].id : null
}

export class AnnotationImportService {
  constructor(private pool: Pool) {}

  async list(userId: string, bookId: string) {
    return transaction(this.pool, async (client) => {
      await lockPersonalBook(client, userId, bookId)
      const result = await client.query(
        `SELECT id,kind,source_book AS "sourceBook",location,source_date AS "sourceDate",content,
         personal_note AS "personalNote",imported_at AS "importedAt" FROM imported_reading_annotations
         WHERE user_id=$1 AND book_id=$2 AND provider='kindle' ORDER BY imported_at DESC,id`,
        [userId, bookId],
      )
      return result.rows
    })
  }

  async preview(userId: string, bytes: Uint8Array) {
    const { entries, skipped } = parseClippings(bytes)
    const { rows: books } = await this.pool.query<{ id: string; title: string; author: string }>(
      `SELECT item->>'id' AS id,item->>'title' AS title,item->>'author' AS author
       FROM personal_workspaces CROSS JOIN LATERAL jsonb_array_elements(state->'books') AS item
       WHERE user_id=$1`, [userId],
    )
    const groups = new Map<string, { sourceBook: string; suggestedBookId: string | null; entries: ImportedClipping[] }>()
    for (const entry of entries) {
      let group = groups.get(entry.sourceBook)
      if (!group) {
        group = { sourceBook: entry.sourceBook, suggestedBookId: matchBook(entry.sourceBook, books), entries: [] }
        groups.set(entry.sourceBook, group)
      }
      group.entries.push(entry)
    }
    return { groups: [...groups.values()], skipped }
  }

  import(userId: string, bookId: string, sourceBook: string, selected: number[], bytes: Uint8Array) {
    const group = parseClippings(bytes).entries.filter((item) => item.sourceBook === sourceBook)
    const indexes = [...new Set(selected)]
    const entries = indexes.map((index) => group[index])
    if (entries.some((entry) => !entry))
      throw new HttpError(400, 'CLIPPINGS_SELECTION', 'Selecione as notas da obra na prévia.')
    return transaction(this.pool, async (client) => {
      await lockPersonalBook(client, userId, bookId)
      const { rows } = await client.query<{ fingerprint: string }>(
        "SELECT fingerprint FROM imported_reading_annotations WHERE user_id=$1 AND book_id=$2 AND provider='kindle'",
        [userId, bookId],
      )
      const known = new Set(rows.map((row) => row.fingerprint))
      const pending = []
      for (const item of entries) {
        const hash = fingerprint(item)
        if (known.has(hash)) continue
        known.add(hash)
        pending.push({ ...item, id: randomUUID(), fingerprint: hash })
      }
      if (known.size > 250)
        throw new HttpError(409, 'CLIPPINGS_QUOTA', 'O livro pode guardar até 250 anotações Kindle. Exclua algumas ou reduza a seleção.')
      if (pending.length) {
        await client.query(
          `INSERT INTO imported_reading_annotations(id,user_id,book_id,provider,fingerprint,kind,source_book,location,source_date,content)
           SELECT item.id,$1,$2,'kindle',item.fingerprint,item.kind,item."sourceBook",item.location,item."sourceDate",item.content
           FROM jsonb_to_recordset($3::jsonb) AS item(id uuid,fingerprint text,kind text,"sourceBook" text,location text,"sourceDate" text,content text)`,
          [userId, bookId, JSON.stringify(pending)],
        )
      }
      return { imported: pending.length, duplicates: selected.length - pending.length, limitPerImport: maxImportEntries }
    })
  }

  async edit(userId: string, bookId: string, id: string, personalNote: string) {
    const result = await this.pool.query(
      `UPDATE imported_reading_annotations SET personal_note=$4
       WHERE user_id=$1 AND book_id=$2 AND id=$3 AND provider='kindle'`, [userId, bookId, id, personalNote],
    )
    if (!result.rowCount) throw this.missing()
  }

  async remove(userId: string, bookId: string, id: string) {
    const result = await this.pool.query(
      `DELETE FROM imported_reading_annotations
       WHERE user_id=$1 AND book_id=$2 AND id=$3 AND provider='kindle'`, [userId, bookId, id],
    )
    if (!result.rowCount) throw this.missing()
  }

  private missing() {
    return new HttpError(404, 'CLIPPING_NOT_FOUND', 'Anotação indisponível.')
  }
}
