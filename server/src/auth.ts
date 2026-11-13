import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { HttpError } from './errors.js'

export interface Identity { uid: string; email: string; emailVerified: boolean; name?: string }
export type VerifyToken = (token: string) => Promise<Identity>

export function createFirebaseVerifier(projectId: string): VerifyToken {
  const app = initializeApp({ projectId, ...(process.env.FIREBASE_AUTH_EMULATOR_HOST ? {} : { credential: applicationDefault() }) })
  const auth = getAuth(app)
  return async (token) => {
    try {
      // checkRevoked also rejects disabled Firebase accounts.
      const claims = await auth.verifyIdToken(token, true)
      return { uid: claims.uid, email: claims.email ?? '', emailVerified: claims.email_verified === true, name: typeof claims.name === 'string' ? claims.name : undefined }
    } catch (error) {
      const code = (error as { code?: string }).code ?? ''
      if (['auth/id-token-expired', 'auth/id-token-revoked', 'auth/invalid-id-token', 'auth/argument-error', 'auth/user-disabled', 'auth/user-not-found', 'auth/invalid-argument'].includes(code)) {
        throw new HttpError(401, 'INVALID_SESSION', 'Sua sessão expirou ou foi revogada. Entre novamente.')
      }
      throw new HttpError(503, 'AUTH_UNAVAILABLE', 'Não foi possível verificar sua sessão. Tente novamente.')
    }
  }
}
