import EmbeddedPostgres from 'embedded-postgres'
import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

// A local-only launcher. It never reads server/.env or connects to a cloud project.
const root = fileURLToPath(new URL('../../', import.meta.url))
const directory = join(root, '.local-data')
await mkdir(directory, { recursive: true, mode: 0o700 })
const secretPath = join(directory, 'postgres-password')
let password: string
try { password = await readFile(secretPath, 'utf8') }
catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  password = randomBytes(24).toString('hex')
  await writeFile(secretPath, password, { mode: 0o600, flag: 'wx' })
}
const postgres = new EmbeddedPostgres({
  databaseDir: join(directory, 'postgres'), user: 'clube_local', password, port: 54329,
  authMethod: 'scram-sha-256', persistent: true, createPostgresUser: false,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  postgresFlags: ['-h', '127.0.0.1', '-k', '/tmp'],
  onLog: () => {}, onError: () => {},
})
const initialized = await access(join(directory, 'postgres', 'PG_VERSION')).then(() => true, () => false)
if (!initialized) await postgres.initialise()
await postgres.start()
try {
  const client = postgres.getPgClient('postgres', '127.0.0.1')
  await client.connect()
  try {
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = 'clube_local'")
    if (!exists.rowCount) await client.query('CREATE DATABASE clube_local')
  } finally { await client.end() }
  const authData = join(directory, 'auth')
  const imported = await access(join(authData, 'firebase-export-metadata.json')).then(() => true, () => false)
  const child = spawn(process.execPath, [
    join(root, 'node_modules/firebase-tools/lib/bin/firebase.js'),
    'emulators:exec', '--only', 'auth', '--project', 'demo-clube-do-livro',
    ...(imported ? [`--import=${authData}`] : []), `--export-on-exit=${authData}`,
    'npm run local:app --workspace server',
  ], {
    cwd: root, stdio: 'inherit',
    env: {
      ...process.env, NODE_ENV: 'development',
      DATABASE_URL: `postgresql://clube_local:${password}@127.0.0.1:54329/clube_local`,
      FIREBASE_PROJECT_ID: 'demo-clube-do-livro', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      FRONTEND_ORIGIN: 'http://localhost:5173', HOST: '127.0.0.1', PORT: '3001',
      VITE_APP_MODE: 'connected', VITE_API_URL: 'http://localhost:3001',
      VITE_FIREBASE_API_KEY: 'demo-key', VITE_FIREBASE_PROJECT_ID: 'demo-clube-do-livro',
      VITE_FIREBASE_AUTH_DOMAIN: 'demo-clube-do-livro.firebaseapp.com', VITE_FIREBASE_AUTH_EMULATOR_URL: 'http://127.0.0.1:9099',
    },
  })
  process.once('SIGINT', () => child.kill('SIGINT'))
  process.once('SIGTERM', () => child.kill('SIGTERM'))
  process.exitCode = await new Promise<number>((resolve, reject) => { child.once('error', reject); child.once('exit', (code) => resolve(code ?? 0)) })
} finally { await postgres.stop() }
