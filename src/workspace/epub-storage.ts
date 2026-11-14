const database = 'clube-livro-epub-private-v1'
interface FileRecord {
  key: string
  namespace: string
  bookId: string
  file: Blob
  filename: string
  cover?: Blob
}
async function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(database, 1)
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('files', { keyPath: 'key' })
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
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
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
) {
  if (file.size > 10000000) throw Error('EPUB excede 10 MB.')
  const db = await open()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite'),
        store = tx.objectStore('files'),
        request = store.index('namespace').getAll(namespace)
      request.onsuccess = () => {
        const size = (request.result as FileRecord[])
          .filter((item) => item.bookId !== id)
          .reduce((sum, item) => sum + item.file.size + (item.cover?.size ?? 0), 0)
        if (size + file.size + (cover?.size ?? 0) > 50000000) {
          tx.abort()
          return
        }
        store.put({
          key: key(namespace, id),
          namespace,
          bookId: id,
          file,
          filename,
          cover,
        } satisfies FileRecord)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
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
