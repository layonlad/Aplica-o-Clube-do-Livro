import type { DecodedIdToken } from 'firebase-admin/auth'
import { z } from 'zod'
import { HttpError } from './errors.js'

const accountSchema = z.object({
  users: z.array(z.object({
    localId: z.string().min(1),
    email: z.string().optional(),
    emailVerified: z.boolean().optional(),
    disabled: z.boolean().optional(),
    validSince: z.string().regex(/^\d+$/).transform(Number).refine(Number.isSafeInteger),
  })).length(1),
})
const invalidSession = () => new HttpError(401, 'INVALID_SESSION', 'Sua sessão expirou ou foi revogada. Entre novamente.')

// Public API key + the caller's own ID token: no service-account private key.
// Signature, audience, issuer and expiry must already have been checked by Admin SDK.
export async function verifyCurrentAccount(token: string, claims: Pick<DecodedIdToken, 'uid' | 'auth_time' | 'email' | 'email_verified'>, apiKey: string, request: typeof fetch = fetch) {
  const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST
  const base = emulator ? `http://${emulator}/identitytoolkit.googleapis.com` : 'https://identitytoolkit.googleapis.com'
  try {
    const response = await request(`${base}/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }), signal: AbortSignal.timeout(8000),
    })
    const data = await response.json()
    if (!response.ok) {
      const code = (data as { error?: { message?: string } }).error?.message?.split(' : ')[0]
      if (['INVALID_ID_TOKEN', 'TOKEN_EXPIRED', 'USER_DISABLED', 'USER_NOT_FOUND'].includes(code ?? '')) throw invalidSession()
      throw new Error('Firebase account lookup unavailable')
    }
    const account = accountSchema.parse(data).users[0]
    if (account.localId !== claims.uid || account.disabled || account.validSince > claims.auth_time || account.email !== claims.email) throw invalidSession()
    return account.emailVerified === true && claims.email_verified === true
  } catch (error) {
    if (error instanceof HttpError) throw error
    // Never expose or log the response, ID token, account record or request URL.
    throw new HttpError(503, 'AUTH_UNAVAILABLE', 'Não foi possível verificar sua sessão. Tente novamente.')
  }
}
