import type { User } from 'firebase/auth'

/**
 * Sinal de tempo real das notificações (ver docs/notificacoes/TEMPO_REAL.md).
 *
 * O servidor grava em `notificationSignals/{uid}` só um número de versão, que muda quando chega, é lida ou some
 * uma notificação. O app escuta esse documento e, quando o número muda, consulta a API como sempre. Nenhum texto,
 * nome ou alvo passa pelo Firestore; as regras deixam cada pessoa ler apenas o próprio sinal.
 */
export type SignalWatcher = (user: User, onVersion: (version: number) => void, onError: () => void) => Promise<() => void>

let emulatorReady = false

const watchFirestore: SignalWatcher = async (user, onVersion, onError) => {
  // Carregado só quando o recurso está ligado e depois que a tela abriu (cerca de 170 KB), para não pesar a
  // abertura do app no celular. Enquanto isso, a consulta normal já trouxe o contador.
  await new Promise<void>((done) => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(() => done(), { timeout: 3000 })
    else setTimeout(done, 1500)
  })
  const [{ getApp }, store] = await Promise.all([import('firebase/app'), import('firebase/firestore')])
  const db = store.getFirestore(getApp(), 'clube-chat')
  const emulator = import.meta.env.VITE_FIRESTORE_EMULATOR_HOST
  if (emulator && !emulatorReady && import.meta.env.DEV && import.meta.env.VITE_FIREBASE_PROJECT_ID?.startsWith('demo-')) {
    const [host, port] = emulator.split(':')
    store.connectFirestoreEmulator(db, host, Number(port))
    emulatorReady = true
  }
  return store.onSnapshot(
    store.doc(db, 'notificationSignals', user.uid),
    (snapshot) => {
      const version = snapshot.get('v')
      onVersion(typeof version === 'number' && Number.isSafeInteger(version) ? version : 0)
    },
    () => onError(),
  )
}

/** Ligado por build (`VITE_NOTIFICATION_SIGNALS=true`) junto com `NOTIFICATION_SIGNALS_ENABLED` na API. */
export function defaultSignalWatcher(): SignalWatcher | null {
  return import.meta.env.VITE_NOTIFICATION_SIGNALS === 'true' ? watchFirestore : null
}
