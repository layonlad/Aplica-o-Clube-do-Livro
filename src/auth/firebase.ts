import { initializeApp } from 'firebase/app'
import { browserSessionPersistence, connectAuthEmulator, initializeAuth, browserPopupRedirectResolver } from 'firebase/auth'

export function createClientAuth() {
  const env = import.meta.env
  if (!env.VITE_FIREBASE_API_KEY || !env.VITE_FIREBASE_PROJECT_ID || !env.VITE_FIREBASE_AUTH_DOMAIN || !env.VITE_API_URL) {
    throw new Error('O acesso ao clube ainda não foi configurado. Entre em contato com o responsável.')
  }
  const api = new URL(env.VITE_API_URL)
  if (import.meta.env.PROD && api.protocol !== 'https:') throw new Error('O acesso ao clube exige uma conexão segura.')
  const emulator = env.VITE_FIREBASE_AUTH_EMULATOR_URL
  if (emulator && (!import.meta.env.DEV || !env.VITE_FIREBASE_PROJECT_ID.startsWith('demo-') || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(emulator))) {
    throw new Error('Configuração de autenticação local inválida.')
  }
  if (env.VITE_FIREBASE_PROJECT_ID.startsWith('demo-') && !emulator) throw new Error('Inicie e configure o emulador local de autenticação.')
  const app = initializeApp({ apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID })
  const auth = initializeAuth(app, { persistence: browserSessionPersistence, popupRedirectResolver: browserPopupRedirectResolver })
  if (emulator) connectAuthEmulator(auth, emulator)
  return auth
}
