import { createPool } from '../src/database.js'
import { readConfig } from '../src/config.js'
import { syncLiteraryNews } from '../src/literary/news.js'

const configuration = readConfig()
const address = new URL(configuration.DATABASE_URL)
if (!['127.0.0.1','localhost'].includes(address.hostname) || !/^\/(clube_test|clube_local|clube_staging)$/.test(address.pathname) ||
    configuration.NODE_ENV === 'production')
  throw Error('Use um PostgreSQL local de teste ou de staging.')
const pool = createPool(configuration.DATABASE_URL, configuration.DB_POOL_MAX)
try {
  const result = await syncLiteraryNews(pool)
  console.log(JSON.stringify(result))
  if (result.failedSources) process.exitCode = 1
} finally {
  await pool.end()
}
