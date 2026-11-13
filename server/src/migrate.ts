import { readConfig } from './config.js'
import { createPool } from './database.js'
import { migrate } from './migrations.js'

const pool = createPool(readConfig().DATABASE_URL)
try { await migrate(pool); console.log('Migrations aplicadas.') }
finally { await pool.end() }
