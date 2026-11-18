import type { User } from 'firebase/auth'
import { onSessionEnd, sessionEnded } from '../auth/session-events'

const database = 'clube-livro-epub-private-v1'
interface FileRecord {
  key: string
  namespace: string
  bookId: string
  file: Blob
  filename: string
  cover?: Blob
  downloadCache?: boolean
}
interface StoredRecord extends Omit<FileRecord, 'file' | 'cover'> {
  file?: Blob
  cover?: Blob
  bytes?: ArrayBuffer
  mime?: string
  coverBytes?: ArrayBuffer
  coverMime?: string
  byteSize?: number
}
const recordSize = (item: StoredRecord) =>
  item.byteSize ??
  (item.file?.size ?? item.bytes?.byteLength ?? 0) +
    (item.cover?.size ?? item.coverBytes?.byteLength ?? 0)
async function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(database, 1)
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('files', {
        keyPath: 'key',
      })
      store.createIndex('namespace', 'namespace')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
const key = (namespace: string, id: string) => namespace + ':' + id
export async function localEpub(namespace: string, id: string) {
  const db = await open()
  try {
    return await new Promise<FileRecord | undefined>((resolve, reject) => {
      const request = db.transaction('files').objectStore('files').get(key(namespace, id))
      request.onsuccess = () => {
        const raw = request.result as StoredRecord | undefined
        if (!raw) {
          resolve(undefined)
          return
        }
        const file = raw.bytes
          ? new Blob([raw.bytes], { type: raw.mime ?? 'application/epub+zip' })
          : raw.file
        const cover = raw.coverBytes
          ? new Blob([raw.coverBytes], { type: raw.coverMime ?? 'image/jpeg' })
          : raw.cover
        resolve(
          file
            ? {
                key: raw.key,
                namespace: raw.namespace,
                bookId: raw.bookId,
                file,
                filename: raw.filename,
                cover,
                downloadCache: raw.downloadCache,
              }
            : undefined,
        )
      }
      request.onerror = () =>
        reject(request.error ?? Error('Não foi possível recuperar o EPUB neste navegador.'))
    })
  } finally {
    db.close()
  }
}
export async function saveEpub(
  namespace: string,
  id: string,
  file: Blob,
  filename: string,
  cover?: Blob,
  downloadOwner?: User,
) {
  if (file.size > 10000000) throw Error('EPUB excede 10 MB.')
  if (cover && cover.size > 5000000) throw Error('A capa do EPUB excede o limite.')
  // Safari may fail to clone a File/Blob backed by a file-picker handle.
  // Buffers are portable; keep reading legacy Blob records without rewriting them.
  const bytes = await file.arrayBuffer(),
    coverBytes = await cover?.arrayBuffer()
  // User imports are durable. Only known copies of a server original are disposable.
  if (downloadOwner && (downloadOwner.uid !== namespace || sessionEnded(downloadOwner))) return
  const stored: StoredRecord = {
    key: key(namespace, id),
    namespace,
    bookId: id,
    filename,
    bytes,
    mime: file.type,
    coverBytes,
    coverMime: cover?.type,
    downloadCache: !!downloadOwner,
    byteSize: bytes.byteLength + (coverBytes?.byteLength ?? 0),
  }
  const db = await open()
  try {
    if (downloadOwner && sessionEnded(downloadOwner)) return
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite'),
        store = tx.objectStore('files'),
        request = store.index('namespace').openCursor(namespace)
      let size = 0
      let durableOriginal = false
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          const item = cursor.value as StoredRecord
          if (item.bookId !== id) size += recordSize(item)
          else if (!item.downloadCache) durableOriginal = true
          cursor.continue()
          return
        }
        if (downloadOwner && durableOriginal) return
        if (size + file.size + (cover?.size ?? 0) > 50000000) {
          tx.abort()
          return
        }
        store.put(stored)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = (event) =>
        reject(
          (event.target as IDBRequest)?.error ??
            tx.error ??
            Error('Não foi possível guardar o EPUB neste navegador.'),
        )
      tx.onabort = () =>
        reject(
          Error(
            'A cota de EPUBs neste navegador é de 50 MB. Remova um arquivo para guardar outro.',
          ),
        )
    })
  } finally {
    db.close()
  }
  window.dispatchEvent(new CustomEvent('clube-epub-saved', { detail: { namespace, bookId: id } }))
}
export async function removeEpub(namespace: string, id: string) {
  const db = await open()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite')
      tx.objectStore('files').delete(key(namespace, id))
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}


async function clearDownloadedCopies(uid: string) {
  if (!('indexedDB' in globalThis)) return
  const db = await open()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite')
      const request = tx.objectStore('files').index('namespace').openCursor(uid)
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return
        if ((cursor.value as StoredRecord).downloadCache) cursor.delete()
        cursor.continue()
      }
      tx.oncomplete = () => resolve()
      tx.onabort = tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

onSessionEnd((uid) => { void clearDownloadedCopies(uid).catch(() => {}) })
