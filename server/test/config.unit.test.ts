import { describe, expect, it } from 'vitest'
import { readConfig } from '../src/config.js'

const base = { DATABASE_URL: 'postgresql://local/db', FIREBASE_PROJECT_ID: 'clube-exclusivo', FRONTEND_ORIGIN: 'https://clube.example' }
describe('configuração segura', () => {
  it('recusa emulador em produção e projetos de demonstração sem emulador', () => {
    expect(() => readConfig({ ...base, NODE_ENV: 'production', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' })).toThrow()
    expect(() => readConfig({ ...base, FIREBASE_PROJECT_ID: 'demo-clube' })).toThrow()
  })
  it('exige projeto demo e host local para tokens do emulador', () => {
    expect(() => readConfig({ ...base, FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' })).toThrow()
    expect(() => readConfig({ ...base, FIREBASE_PROJECT_ID: 'demo-clube', FIREBASE_AUTH_EMULATOR_HOST: 'external.example:9099' })).toThrow()
    expect(readConfig({ ...base, FIREBASE_PROJECT_ID: 'demo-clube', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }).PORT).toBe(3001)
  })
  it('exige HTTPS em produção e uma origem exata', () => {
    expect(() => readConfig({ ...base, NODE_ENV: 'production', FRONTEND_ORIGIN: 'http://clube.example' })).toThrow()
    expect(() => readConfig({ ...base, FRONTEND_ORIGIN: 'https://clube.example/path' })).toThrow()
  })
})
it('restringe conexões e origens adicionais da migração', () => {
  expect(readConfig({ ...base, DB_POOL_MAX: '5', FRONTEND_EXTRA_ORIGINS: 'https://legacy.web.app' }).DB_POOL_MAX).toBe(5)
  for (const DB_POOL_MAX of ['0', '11', 'NaN']) expect(() => readConfig({ ...base, DB_POOL_MAX })).toThrow()
  for (const FRONTEND_EXTRA_ORIGINS of ['http://legacy.web.app', 'https://user:pass@legacy.web.app', 'https://legacy.web.app/path', '*', 'https://a.test,https://b.test,https://c.test,https://d.test']) expect(() => readConfig({ ...base, FRONTEND_EXTRA_ORIGINS })).toThrow()
})

it('permite somente as duas origens nativas na API de staging quando habilitadas', () => {
  const staging = { ...base, ALLOW_NATIVE_STAGING_ORIGINS: 'true' }
  expect(readConfig(staging).FRONTEND_EXTRA_ORIGINS).toEqual(['capacitor://localhost', 'https://localhost'])
  expect(readConfig(base).FRONTEND_EXTRA_ORIGINS).toEqual([])
  expect(() => readConfig({ ...staging, NODE_ENV: 'production' })).toThrow()
  expect(() => readConfig({ ...staging, FIREBASE_PROJECT_ID: 'gen-lang-client-0194308411' })).toThrow()
})
