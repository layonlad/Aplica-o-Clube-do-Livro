import { initializeApp } from 'firebase/app'
import { browserLocalPersistence, connectAuthEmulator, indexedDBLocalPersistence, initializeAuth, browserPopupRedirectResolver } from 'firebase/auth'

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
  // Login permanente, como em apps de celular: a conta continua entrando depois de fechar e abrir o app.
  // As duas opções persistem após fechar o navegador quando o armazenamento do site está disponível.
  // Sair da conta continua disponível no Perfil.
  const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence], popupRedirectResolver: browserPopupRedirectResolver })
  // Staging already identifies the environment. Firebase's fixed footer covers the mobile nav.
  if (emulator) connectAuthEmulator(auth, emulator, { disableWarnings: env.VITE_APP_ENVIRONMENT === 'staging' })
  return auth
}
