import { z } from 'zod'
import { emptyWorkspace, preferencesSchema,readingSchema, workspaceSchema, type WorkspaceSnapshot } from '../../server/src/workspace-model'

export const backupSchema = z.object({ format: z.literal('clube-livro-v1'), state: workspaceSchema, reading: readingSchema,preferences:preferencesSchema.optional() })
const key = 'clube-livro-personal-v1'
async function database() {
  return new Promise<IDBDatabase>((resolve,reject) => {
    const request=indexedDB.open('clube-livro',1)
    request.onupgradeneeded=()=>request.result.createObjectStore('personal')
    request.onsuccess=()=>resolve(request.result)
    request.onerror=()=>reject(request.error)
  })
}
async function storedValue() {
  if (!('indexedDB' in globalThis)) return localStorage.getItem(key)
  const db=await database()
  try { return await new Promise<string|undefined>((resolve,reject)=>{ const tx=db.transaction('personal'); const request=tx.objectStore('personal').get(key); request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error) }) }
  finally { db.close() }
}
export async function loadPersonal(): Promise<WorkspaceSnapshot> {
  const stored=await storedValue()
  const parsed=stored?backupSchema.parse(JSON.parse(stored)):null
  return { state:parsed?.state??emptyWorkspace(),reading:parsed?.reading??{},preferences:preferencesSchema.parse(parsed?.preferences),version:0,role:'owner',actorId:'visitor' }
}
export async function savePersonal(snapshot: WorkspaceSnapshot) {
  const value=JSON.stringify({format:'clube-livro-v1',state:snapshot.state,reading:snapshot.reading,preferences:snapshot.preferences})
  if (!('indexedDB' in globalThis)) { localStorage.setItem(key,value); return }
  const db=await database()
  try { await new Promise<void>((resolve,reject)=>{const tx=db.transaction('personal','readwrite');tx.objectStore('personal').put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)}) }
  finally { db.close() }
}
export function secureIndex(length:number) {
  const values=new Uint32Array(1)
  const ceiling=Math.floor(4294967296/length)*length
  do { crypto.getRandomValues(values) } while(values[0]>=ceiling)
  return values[0]%length
}
