import { loadEnvFile } from 'node:process'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

try { loadEnvFile('.env.production.local') }
catch (error) { if (error.code !== 'ENOENT') throw error }
const project = JSON.parse(readFileSync('.firebaserc', 'utf8')).projects.production
for (const key of ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_API_URL']) {
  if (!process.env[key]) throw new Error(`Configuração de publicação ausente: ${key}`)
}
if (process.env.VITE_FIREBASE_PROJECT_ID !== project) throw new Error('O app Firebase deve pertencer ao projeto de produção configurado.')
if (process.env.VITE_FIREBASE_AUTH_EMULATOR_URL) throw new Error('Remova a configuração de emulador antes de publicar.')
const api = new URL(process.env.VITE_API_URL)
if (api.protocol !== 'https:' || api.username || api.password || api.hostname.endsWith('.invalid')) throw new Error('Configure uma API HTTPS real antes de publicar.')
const response = await fetch(new URL('/health', api), { signal: AbortSignal.timeout(15000), cache: 'no-store' })
if (!response.ok || (await response.json()).status !== 'ok') throw new Error('A API e o banco precisam estar disponíveis antes da publicação.')
const result = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', env: { ...process.env, VITE_APP_MODE: 'connected' } })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
