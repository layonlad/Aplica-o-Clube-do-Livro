import {localStorage} from './local-storage.js'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { buildApp } from '../src/app.js'
import { createFirebaseVerifier } from '../src/auth.js'
import { readConfig } from '../src/config.js'
import { createPool } from '../src/database.js'
import { migrate } from '../src/migrations.js'

const config = readConfig()
if (config.FIREBASE_PROJECT_ID !== 'demo-clube-do-livro' || !config.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Este comando é exclusivo do ambiente local.')
const pool = createPool(config.DATABASE_URL)
await migrate(pool)
const app = await buildApp({ pool, verifyToken: createFirebaseVerifier(config.FIREBASE_PROJECT_ID), origin: config.FRONTEND_ORIGIN,moderatorUids:config.PLATFORM_MODERATOR_UIDS,storage:localStorage(fileURLToPath(new URL('../../.local-data/media-private/',import.meta.url))) })
const vite = await createServer({ root: fileURLToPath(new URL('../../', import.meta.url)), server: { host: '127.0.0.1', port: 5173, strictPort: true } })
async function close() { await vite.close(); await app.close(); await pool.end() }
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void close() })
try {
  await app.listen({ host: config.HOST, port: config.PORT })
  await vite.listen()
  console.log('\nClube do Livro: http://localhost:5173\nContas e banco locais em .local-data/. Use Ctrl+C para encerrar e salvar.\n')
} catch (error) { await close(); throw error }
