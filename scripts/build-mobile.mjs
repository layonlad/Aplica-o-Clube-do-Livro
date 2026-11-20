import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const env = process.env
const { projects } = JSON.parse(readFileSync('.firebaserc', 'utf8'))
const productionHosts = new Set([
  'clube-livro-api-34owu4acjq-uc.a.run.app',
  ...Object.values(projects).flatMap((id) => [id + '.web.app', id + '.firebaseapp.com']),
])

const project = env.VITE_FIREBASE_PROJECT_ID
if (!project || Object.values(projects).includes(project) || project.startsWith('demo-') ||
    !env.VITE_FIREBASE_API_KEY || env.VITE_FIREBASE_AUTH_DOMAIN !== project + '.firebaseapp.com' ||
    env.VITE_FIREBASE_AUTH_EMULATOR_URL) {
  throw new Error('Informe o projeto Firebase exclusivo de staging em .env.mobile.local.')
}

for (const key of ['VITE_API_URL', 'VITE_NATIVE_LINK_ORIGIN']) {
  const address = new URL(env[key] ?? 'http://invalid.invalid')
  if (address.protocol !== 'https:' || address.username || address.password || productionHosts.has(address.hostname) ||
      address.href !== address.origin + '/') {
    throw new Error(`Informe uma origem HTTPS de staging em ${key}.`)
  }
}

const result = spawnSync('npm', ['run', 'build', '--', '--outDir', 'dist-mobile'], {
  stdio: 'inherit',
  env: { ...env, VITE_APP_MODE: 'connected', VITE_APP_NATIVE: '1' },
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
