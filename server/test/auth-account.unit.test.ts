import { afterEach, expect, it, vi } from 'vitest'
import { verifyCurrentAccount } from '../src/auth-account.js'

const claims = { uid: 'test-user', auth_time: 100, email: 'reader@example.com', email_verified: true }
const user = { localId: claims.uid, email: claims.email, emailVerified: true, validSince: '100' }
const response = (body: unknown, status = 200) => vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }))
afterEach(() => { vi.unstubAllEnvs() })

it('consulta apenas a conta do token e aceita o limite de revogação igual ao auth_time', async () => {
  vi.stubEnv('FIREBASE_AUTH_EMULATOR_HOST', '')
  const request = response({ users: [user] })
  expect(await verifyCurrentAccount('caller-token', claims, 'public-key', request)).toBe(true)
  expect(request.mock.calls[0][0]).toBe('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=public-key')
  expect(JSON.parse(request.mock.calls[0][1]!.body as string)).toEqual({ idToken: 'caller-token' })
})
it.each([
  { ...user, validSince: '101' },
  { ...user, disabled: true },
  { ...user, localId: 'different-user' },
  { ...user, email: 'changed@example.com' },
])('rejeita conta revogada, desativada ou diferente do token: %j', async (account) => {
  await expect(verifyCurrentAccount('token', claims, 'key', response({ users: [account] }))).rejects.toMatchObject({ statusCode: 401 })
})
it('exige verificação de e-mail tanto no token quanto no estado atual da conta', async () => {
  expect(await verifyCurrentAccount('token', claims, 'key', response({ users: [{ ...user, emailVerified: false }] }))).toBe(false)
  expect(await verifyCurrentAccount('token', { ...claims, email_verified: false }, 'key', response({ users: [user] }))).toBe(false)
})
it('falha fechado em respostas incompletas e falhas do provedor', async () => {
  for (const request of [response({ users: [{ ...user, validSince: undefined }] }), response({ users: [] }), response({ error: { message: 'API_KEY_INVALID' } }, 400), vi.fn<typeof fetch>().mockRejectedValue(new Error('network'))]) {
    await expect(verifyCurrentAccount('token', claims, 'key', request)).rejects.toMatchObject({ statusCode: 503 })
  }
})
it.each(['INVALID_ID_TOKEN', 'TOKEN_EXPIRED', 'USER_DISABLED', 'USER_NOT_FOUND'])('rejeita sessão recusada pelo Firebase: %s', async (message) => {
  await expect(verifyCurrentAccount('token', claims, 'key', response({ error: { message } }, 400))).rejects.toMatchObject({ statusCode: 401 })
})
