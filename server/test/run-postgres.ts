import EmbeddedPostgres from 'embedded-postgres'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'

const suite = process.argv[2]
if (!['integration', 'auth'].includes(suite)) throw new Error('Escolha integration ou auth.')
async function run(url: string) {
  const child = spawn(process.execPath, ['../node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts'], {
    stdio: 'inherit', env: { ...process.env, TEST_DATABASE_URL: url, TEST_SUITE: suite },
  })
  process.exitCode = await new Promise<number>((resolve, reject) => { child.on('error', reject); child.on('exit', (code) => resolve(code ?? 1)) })
}
if (process.env.TEST_DATABASE_URL) {
  await run(process.env.TEST_DATABASE_URL)
} else {
  const port = await new Promise<number>((resolve) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => { const { port } = server.address() as { port: number }; server.close(() => resolve(port)) })
  })
  const directory = await mkdtemp(join(tmpdir(), 'clube-pg-test-'))
  const password = randomBytes(24).toString('hex')
  const postgres = new EmbeddedPostgres({
    databaseDir: join(directory, 'data'), user: 'clube_test', password, port,
    authMethod: 'scram-sha-256', persistent: false, createPostgresUser: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    postgresFlags: ['-h', '127.0.0.1', '-k', directory],
    onLog: () => {}, onError: () => {},
  })
  try {
    await postgres.initialise(); await postgres.start(); await postgres.createDatabase('clube_test')
    await run(`postgresql://clube_test:${password}@127.0.0.1:${port}/clube_test`)
  } finally { await postgres.stop() }
}
