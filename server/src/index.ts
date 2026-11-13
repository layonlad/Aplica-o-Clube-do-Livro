import { readConfig } from './config.js'
import { createPool } from './database.js'
import { createFirebaseVerifier } from './auth.js'
import { buildApp } from './app.js'

const config = readConfig()
const pool = createPool(config.DATABASE_URL)
const app = await buildApp({ pool, verifyToken: createFirebaseVerifier(config.FIREBASE_PROJECT_ID, config.FIREBASE_WEB_API_KEY), origin: config.FRONTEND_ORIGIN, logger: true })
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => { await app.close(); await pool.end() })
try { await app.listen({ host: config.HOST, port: config.PORT }) }
catch { console.error('Não foi possível iniciar a API. Confira a configuração e a porta.'); await pool.end(); process.exitCode = 1 }
