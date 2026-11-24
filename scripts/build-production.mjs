import { loadEnvFile } from 'node:process'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { assertPromotion } from './release-version.mjs'
import { releaseManifest } from './release-source.mjs'

const candidate = releaseManifest('production')
if (!candidate) throw new Error('Use uma cópia limpa do commit que será publicado.')
let staged
try {
  staged = JSON.parse(readFileSync(process.env.STAGING_RELEASE_FILE ?? '.local-data/staging/release.json', 'utf8'))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  throw new Error('Abra esta candidata em Staging local e informe o registro em STAGING_RELEASE_FILE.')
}
if (staged?.environment !== 'staging' || staged.source !== candidate.source || staged.version !== candidate.version) {
  throw new Error('O registro de Staging local precisa corresponder à candidata de produção.')
}

try { loadEnvFile('.env.production.local') }
catch (error) { if (error.code !== 'ENOENT') throw error }
const project = JSON.parse(readFileSync('.firebaserc', 'utf8')).projects.production
for (const key of ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_API_URL', 'VITE_LEGAL_CONTROLLER', 'VITE_PRIVACY_CONTACT', 'VITE_LEGAL_TRANSFER']) {
  if (!process.env[key]?.trim()) throw new Error(`Configuração de publicação ausente: ${key}`)
}
if (!/^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(process.env.VITE_PRIVACY_CONTACT.trim())) {
  throw new Error('Configure o endereço público de atendimento à LGPD.')
}
if (process.env.VITE_FIREBASE_PROJECT_ID !== project) throw new Error('O app Firebase deve pertencer ao projeto de produção configurado.')
if (![project + '.firebaseapp.com', project + '.web.app'].includes(process.env.VITE_FIREBASE_AUTH_DOMAIN)) {
  throw new Error('Domínio de autenticação divergente.')
}
if (process.env.VITE_FIREBASE_AUTH_EMULATOR_URL) throw new Error('Remova a configuração de emulador antes de publicar.')
const api = new URL(process.env.VITE_API_URL)
if (api.protocol !== 'https:' || api.username || api.password || api.hostname.endsWith('.invalid')) throw new Error('Configure uma API HTTPS real antes de publicar.')
const [health, deployed] = await Promise.all([
  fetch(new URL('/health', api), { signal: AbortSignal.timeout(75000), cache: 'no-store' }),
  fetch(`https://${project}.web.app/release.json?verify=${candidate.commit}`, { signal: AbortSignal.timeout(25000), cache: 'no-store' }),
])
if (!health.ok || (await health.json()).status !== 'ok') throw new Error('A API e o banco precisam estar disponíveis antes da publicação.')
if (!deployed.ok) throw new Error('Versão publicada indisponível.')
// Antes do manifesto, a reescrita do Hosting entrega o HTML da SPA.
const live = deployed.headers.get('content-type')?.startsWith('text/html') ? null : await deployed.json()
if (live && live.environment !== 'production') throw new Error('Manifesto de produção inválido.')
assertPromotion(candidate, staged, live)

const result = spawnSync('npm', ['run', 'build'], {
  stdio: 'inherit', env: { ...process.env, VITE_APP_MODE: 'connected', VITE_APP_ENVIRONMENT: 'production', VITE_APP_NATIVE: '0' },
})
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
writeFileSync('dist/release.json', JSON.stringify(candidate, null, 2) + '\n')
const map = spawnSync(process.execPath, ['scripts/mapa/build.mjs', '--out', 'dist/mapa'], { stdio: 'inherit' })
if (map.error) throw map.error
process.exitCode = map.status ?? 1
