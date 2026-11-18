import { initializeApp } from 'firebase/app'
import { browserLocalPersistence, connectAuthEmulator, indexedDBLocalPersistence, initializeAuth, browserPopupRedirectResolver, type Auth } from 'firebase/auth'

export function firebaseAuthDomain(projectId: string, configuredDomain: string, host: string) {
  // Firebase Hosting serves the sign-in helper on this project's own domains.
  if (host === `${projectId}.web.app` || host === `${projectId}.firebaseapp.com`) return host
  return configuredDomain
}

export function canRedirectGoogle(auth: Auth, location: Pick<Location, 'protocol' | 'host'>) {
  return !auth?.emulatorConfig && location.protocol === 'https:' && auth?.config?.authDomain === location.host
}

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
  const projectId = env.VITE_FIREBASE_PROJECT_ID
  const authDomain = firebaseAuthDomain(projectId, env.VITE_FIREBASE_AUTH_DOMAIN, window.location.host)
  const app = initializeApp({ apiKey: env.VITE_FIREBASE_API_KEY, authDomain, projectId })
  // Login permanente, como em apps de celular: a conta continua entrando depois de fechar e abrir o app.
  // As duas opções persistem após fechar o navegador quando o armazenamento do site está disponível.
  // Sair da conta continua disponível no Perfil.
  const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence], popupRedirectResolver: browserPopupRedirectResolver })
  if (emulator) connectAuthEmulator(auth, emulator)
  return auth
}
