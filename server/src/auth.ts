import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { HttpError } from './errors.js'
import { verifyCurrentAccount } from './auth-account.js'

export interface Identity { uid: string; email: string; emailVerified: boolean; name?: string }
export type VerifyToken = (token: string) => Promise<Identity>

export function createFirebaseVerifier(projectId: string, webApiKey?: string): VerifyToken {
  const app = initializeApp({ projectId, ...(process.env.FIREBASE_AUTH_EMULATOR_HOST || webApiKey ? {} : { credential: applicationDefault() }) })
  const auth = getAuth(app)
  return async (token) => {
    try {
      // Keyless mode checks revocation/disabled state through the caller's account.
      // ADC mode delegates the same checks to Admin SDK.
      const claims = await auth.verifyIdToken(token, !webApiKey)
      const emailVerified = webApiKey ? await verifyCurrentAccount(token, claims, webApiKey) : claims.email_verified === true
      return { uid: claims.uid, email: claims.email ?? '', emailVerified, name: typeof claims.name === 'string' ? claims.name : undefined }
    } catch (error) {
      if (error instanceof HttpError) throw error
      const code = (error as { code?: string }).code ?? ''
      if (['auth/id-token-expired', 'auth/id-token-revoked', 'auth/invalid-id-token', 'auth/argument-error', 'auth/user-disabled', 'auth/user-not-found', 'auth/invalid-argument'].includes(code)) {
        throw new HttpError(401, 'INVALID_SESSION', 'Sua sessão expirou ou foi revogada. Entre novamente.')
      }
      throw new HttpError(503, 'AUTH_UNAVAILABLE', 'Não foi possível verificar sua sessão. Tente novamente.')
    }
  }
}
