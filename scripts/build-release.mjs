import { createHash } from 'node:crypto'
import { loadEnvFile } from 'node:process'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { assertPromotion, nextVersion } from './release-version.mjs'

const target = process.argv[2]
const demo = process.argv.slice(3).includes('--demo')
if (!['staging', 'production'].includes(target) || (target === 'production' && demo)) {
  throw new Error('Escolha staging ou production como destino do build.')
}
const projects = JSON.parse(readFileSync('.firebaserc', 'utf8')).projects
const { stagingSite, stagingApi, productionApi } = JSON.parse(readFileSync('infra/google/releases.json', 'utf8'))
const { version } = JSON.parse(readFileSync('release.json', 'utf8'))
nextVersion(version)
function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}
if (git('status', '--porcelain', '--untracked-files=no')) {
  throw new Error('Use uma cópia limpa do commit que será publicado.')
}
const commit = git('rev-parse', 'HEAD')
const source = createHash('sha256').update(git('ls-tree', '-rz', 'HEAD', '--', '.', ':(exclude)docs', ':(exclude)*.md')).digest('hex')
const manifest = { environment: target, mode: demo ? 'demo' : 'connected', version, commit, source }

async function readRelease(site, production = false) {
  const response = await fetch(`https://${site}.web.app/release.json?verify=${commit}`, {
    cache: 'no-store', signal: AbortSignal.timeout(25000),
  })
  if (!response.ok) throw new Error('Versão publicada indisponível em ' + site + '.')
  // A versão anterior à inclusão deste manifesto entrega o HTML da SPA.
  if (production && response.headers.get('content-type')?.startsWith('text/html')) return null
  return response.json()
}

const env = {
  ...process.env,
  VITE_APP_ENVIRONMENT: target,
  VITE_APP_MODE: manifest.mode,
  VITE_FIREBASE_API_KEY: '',
  VITE_FIREBASE_AUTH_DOMAIN: '',
  VITE_FIREBASE_PROJECT_ID: '',
  VITE_FIREBASE_AUTH_EMULATOR_URL: '',
  VITE_API_URL: '',
}
if (!demo) {
  try { loadEnvFile(`.env.${target}.local`) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  for (const key of ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_API_URL']) {
    if (!process.env[key]) throw new Error(`Configuração de publicação ausente: ${key}`)
    env[key] = process.env[key]
  }
  if (process.env.VITE_FIREBASE_AUTH_EMULATOR_URL) throw new Error('Build hospedado exige o Firebase do ambiente.')
  if (env.VITE_FIREBASE_PROJECT_ID !== projects[target]) throw new Error('Projeto de autenticação divergente.')
  const authDomains = [projects[target] + '.firebaseapp.com', projects[target] + '.web.app']
  if (!authDomains.includes(env.VITE_FIREBASE_AUTH_DOMAIN)) throw new Error('Domínio de autenticação divergente.')
  const origin = target === 'staging' ? stagingApi : productionApi
  if (!origin || env.VITE_API_URL !== origin) throw new Error('API divergente para o ambiente selecionado.')
  const response = await fetch(new URL('/health', origin), { signal: AbortSignal.timeout(75000), cache: 'no-store' })
  if (!response.ok || (await response.json()).status !== 'ok') throw new Error('A API e o banco precisam estar disponíveis.')
}
if (target === 'production') {
  const [staged, live] = await Promise.all([readRelease(stagingSite), readRelease(projects.production, true)])
  if (live && live.environment !== 'production') throw new Error('Manifesto de produção inválido.')
  assertPromotion(manifest, staged, live)
}
const result = spawnSync('npm', ['run', 'build', '--', '--mode', target], { stdio: 'inherit', env })
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
writeFileSync('dist/release.json', JSON.stringify(manifest, null, 2) + '\n')
const map = spawnSync(process.execPath, ['scripts/mapa/build.mjs', '--out', 'dist/mapa'], { stdio: 'inherit' })
if (map.error) throw map.error
process.exitCode = map.status ?? 1
