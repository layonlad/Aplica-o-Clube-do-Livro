import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import type { Pool } from 'pg'
import { transaction } from './database.js'

export async function migrate(pool: Pool) {
  const directory = new URL('../migrations/', import.meta.url)
  await transaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(57291103)')
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())')
    const { rows } = await client.query<{ name: string; checksum: string }>('SELECT name, checksum FROM schema_migrations')
    for (const name of (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
      const sql = await readFile(new URL(name, directory), 'utf8')
      const checksum = createHash('sha256').update(sql).digest('hex')
      const previous = rows.find((row) => row.name === name)
      if (previous && previous.checksum !== checksum) throw new Error(`Migration alterada após aplicação: ${name}`)
      if (previous) continue
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [name, checksum])
    }
  })
}
