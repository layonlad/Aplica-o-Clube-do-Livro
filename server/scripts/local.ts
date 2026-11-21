import EmbeddedPostgres from 'embedded-postgres'
import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { localMode, localProfile } from './local-profile.js'

// A local-only launcher. It never reads server/.env or connects to a cloud project.
const root = fileURLToPath(new URL('../../', import.meta.url))
const profile = localProfile(localMode(process.argv))
const staging = profile.mode === 'staging'
const origin = `http://localhost:${profile.frontend}`
const authHost = `127.0.0.1:${profile.auth}`
const directory = join(root, profile.directory)
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
  databaseDir: join(directory, 'postgres'), user: 'clube_local', password, port: profile.postgres,
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
    'emulators:exec', '--only', profile.emulators, '--project', profile.projectId,
    '--config', join(root, profile.config),
    ...(imported ? [`--import=${authData}`] : []), `--export-on-exit=${authData}`,
    'npm run local:app --workspace server',
  ], {
    cwd: root, stdio: 'inherit',
    env: {
      ...process.env, NODE_ENV: 'development', LOCAL_MODE: profile.mode,
      CLUB_CHAT_ENABLED: String(profile.chat), VITE_CLUB_CHAT_ENABLED: String(profile.chat),
      // O sinal de tempo real das notificações usa o emulador do Firestore que já sobe com o chat.
      NOTIFICATION_SIGNALS_ENABLED: String(profile.chat), VITE_NOTIFICATION_SIGNALS: String(profile.chat),
      ...(profile.firestore ? { VITE_FIRESTORE_EMULATOR_HOST: '127.0.0.1:' + profile.firestore } : {}),
      DATABASE_URL: `postgresql://clube_local:${password}@127.0.0.1:${profile.postgres}/clube_local`,
      FIREBASE_PROJECT_ID: profile.projectId, FIREBASE_AUTH_EMULATOR_HOST: authHost,
      FRONTEND_ORIGIN: origin, HOST: '127.0.0.1', PORT: String(profile.api),
      VITE_APP_ENVIRONMENT: staging ? 'staging' : 'local',
      VITE_APP_MODE: 'connected', VITE_API_URL: `http://localhost:${profile.api}`,
      VITE_FIREBASE_API_KEY: 'demo-key', VITE_FIREBASE_PROJECT_ID: profile.projectId,
      VITE_FIREBASE_AUTH_DOMAIN: profile.projectId + '.firebaseapp.com', VITE_FIREBASE_AUTH_EMULATOR_URL: 'http://' + authHost,
    },
  })
  process.once('SIGINT', () => child.kill('SIGINT'))
  process.once('SIGTERM', () => child.kill('SIGTERM'))
  process.exitCode = await new Promise<number>((resolve, reject) => { child.once('error', reject); child.once('exit', (code) => resolve(code ?? 0)) })
} finally { await postgres.stop() }
