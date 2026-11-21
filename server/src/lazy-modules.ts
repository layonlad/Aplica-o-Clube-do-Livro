/**
 * Bibliotecas pesadas carregadas só quando uma rota precisa delas.
 * O Firestore (chat) e o sharp (fotos e capas) somavam mais da metade do tempo de carga da API,
 * e o Cloud Run com mínimo zero paga esse tempo a cada vez que a API acorda.
 */
import type sharpModule from 'sharp'

type Sharp = typeof sharpModule
type FirestoreModule = typeof import('firebase-admin/firestore')

let sharpPromise: Promise<Sharp> | undefined
let firestorePromise: Promise<FirestoreModule> | undefined

export function loadSharp(): Promise<Sharp> {
  sharpPromise ??= import('sharp').then(
    ({ default: sharp }) => {
      sharp.concurrency(1)
      sharp.cache({ memory: 16, files: 0, items: 16 })
      return sharp
    },
    (error: unknown) => {
      sharpPromise = undefined
      throw error
    },
  )
  return sharpPromise
}

export function loadFirestore(): Promise<FirestoreModule> {
  firestorePromise ??= import('firebase-admin/firestore').catch((error: unknown) => {
    firestorePromise = undefined
    throw error
  })
  return firestorePromise
}

/** Carrega as duas em segundo plano depois que a API já responde, fora do caminho do primeiro pedido. */
export function warmLazyModules(delayMs = 3000) {
  setTimeout(() => {
    loadFirestore().catch(() => {})
    loadSharp().catch(() => {})
  }, delayMs).unref()
}
