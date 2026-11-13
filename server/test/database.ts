import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { migrate } from '../src/migrations.js'

export async function testDatabase(applyMigrations = true) {
  const url = new URL(process.env.TEST_DATABASE_URL ?? '')
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.includes('test')) {
    throw new Error('Testes exigem um banco local cujo nome contenha test.')
  }
  const schema = `test_${randomUUID().replaceAll('-', '')}`
  const admin = new Pool({ connectionString: url.toString() })
  await admin.query(`CREATE SCHEMA ${schema}`)
  const pool = new Pool({ connectionString: url.toString(), options: `-c search_path=${schema}`, max: 10 })
  if (applyMigrations) await migrate(pool)
  return { pool, close: async () => { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end() } }
}
