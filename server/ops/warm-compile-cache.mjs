// Roda durante o build da imagem com NODE_COMPILE_CACHE definido.
// Carrega os módulos da API e do executor sem iniciar servidor nenhum, para o Node gravar o código
// já compilado. No Cloud Run, a API reaproveita esse cache e fica pronta mais rápido ao acordar.
import { flushCompileCache, getCompileCacheDir } from 'node:module'

const dist = new URL('../dist/', import.meta.url)
const modules = [
  'app.js',
  'auth.js',
  'config.js',
  'database.js',
  'maintenance.js',
  'private-storage.js',
  'push-dispatcher.js',
  'notification-http-app.js',
]
for (const name of modules) await import(new URL(name, dist).href)
const { loadFirestore, loadSharp } = await import(new URL('lazy-modules.js', dist).href)
await Promise.all([loadFirestore(), loadSharp()])

if (!getCompileCacheDir()) {
  console.error('NODE_COMPILE_CACHE não está ativo; o cache de compilação não foi gerado.')
  process.exit(1)
}
flushCompileCache()
console.log(`Cache de compilação gravado em ${getCompileCacheDir()}`)
