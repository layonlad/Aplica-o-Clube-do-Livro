import { localStorage } from './local-storage.js'
import { localProfile } from './local-profile.js'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createServer } from 'vite'
import { buildApp } from '../src/app.js'
import { createFirebaseVerifier } from '../src/auth.js'
import { readConfig } from '../src/config.js'
import { createPool } from '../src/database.js'
import { migrate } from '../src/migrations.js'

const config = readConfig()
const staging = process.env.VITE_APP_ENVIRONMENT === 'staging'
const profile = localProfile(staging)
const root = fileURLToPath(new URL('../../', import.meta.url))
const directory = join(root, profile.directory)
const origin = `http://localhost:${profile.frontend}`
const database = new URL(config.DATABASE_URL)
if (config.FIREBASE_PROJECT_ID !== profile.projectId ||
    config.FIREBASE_AUTH_EMULATOR_HOST !== `127.0.0.1:${profile.auth}` ||
    config.FRONTEND_ORIGIN !== origin || config.HOST !== '127.0.0.1' || config.PORT !== profile.api ||
    database.hostname !== '127.0.0.1' || database.port !== String(profile.postgres) || database.pathname !== '/clube_local') {
  throw new Error('Este comando é exclusivo do ambiente local.')
}
const pool = createPool(config.DATABASE_URL)
await migrate(pool)
const app = await buildApp({
  pool, verifyToken: createFirebaseVerifier(config.FIREBASE_PROJECT_ID), origin,
  moderatorUids: config.PLATFORM_MODERATOR_UIDS, storage: localStorage(join(directory, 'media-private')),
})
const vite = await createServer({ root, server: { host: '127.0.0.1', port: profile.frontend, strictPort: true } })
async function close() { await vite.close(); await app.close(); await pool.end() }
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void close() })
try {
  await app.listen({ host: config.HOST, port: config.PORT })
  await vite.listen()
  if (staging) {
    const reference = execFileSync(process.execPath, ['scripts/release-source.mjs'], { cwd: root, encoding: 'utf8' })
    const file = join(directory, 'release.json')
    if (JSON.parse(reference)) await writeFile(file, reference, { mode: 0o600 })
    else {
      await rm(file, { force: true })
      console.log('Staging com alterações locais. Reinicie com o commit salvo para registrar a candidata.')
    }
  }
  console.log(`\n${staging ? 'Staging' : 'Clube do Livro'}: ${origin}\nContas, arquivos e banco locais em ${profile.directory}/.\n`)
} catch (error) { await close(); throw error }
