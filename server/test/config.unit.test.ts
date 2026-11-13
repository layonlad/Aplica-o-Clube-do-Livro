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
