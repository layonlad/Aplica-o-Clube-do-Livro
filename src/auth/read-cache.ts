import { onSessionEnd } from './session-events'

interface Entry<T> {
  value?: T
  storedAt: number
  weight: number
  pending?: Promise<T>
  controller?: AbortController
}

/** In-memory, bounded, account-scoped reads. An ended session cannot refill the cache. */
export function createReadCache<T>({
  freshMs,
  staleMs = freshMs,
  maxEntries,
  maxWeight = Infinity,
  sizeOf = () => 1,
}: {
  freshMs: number
  staleMs?: number
  maxEntries: number
  maxWeight?: number
  sizeOf?: (value: T) => number
}) {
  const entries = new Map<string, Entry<T>>()
  const keyFor = (owner: string | null, resource: string) => JSON.stringify([owner, resource])
  function forget(owner: string | null, prefix = '', abort = false) {
    for (const [key, entry] of entries) {
      const [account, resource] = JSON.parse(key) as [string | null, string]
      if (account !== owner || !resource.startsWith(prefix)) continue
      if (abort) entry.controller?.abort()
      entries.delete(key)
    }
  }
  onSessionEnd((uid) => forget(uid, '', true))

  function trim() {
    let weight = 0, count = 0
    for (const entry of entries.values()) {
      if (entry.value === undefined) continue
      weight += entry.weight
      count++
    }
    for (const [key, entry] of entries) {
      if (count <= maxEntries && weight <= maxWeight) break
      if (entry.value === undefined) continue
      if (entry.pending) { entry.value = undefined; entry.storedAt = 0 }
      else entries.delete(key)
      count--
      weight -= entry.weight
      entry.weight = 0
    }
  }

  return {
    peek(owner: string | null, resource: string) {
      const entry = entries.get(keyFor(owner, resource))
      return entry && Date.now() - entry.storedAt < staleMs ? entry.value : undefined
    },
    read(owner: string | null, resource: string, load: (signal: AbortSignal) => Promise<T>, refresh = false): Promise<T> {
      const key = keyFor(owner, resource)
      const entry = entries.get(key) ?? { storedAt: 0, weight: 0 }
      entries.delete(key)
      entries.set(key, entry)
      if (entry.pending) return entry.pending
      if (!refresh && entry.value !== undefined && Date.now() - entry.storedAt < freshMs)
        return Promise.resolve(entry.value)
      const controller = new AbortController()
      entry.controller = controller
      entry.pending = Promise.resolve().then(() => load(controller.signal)).then((value) => {
        controller.signal.throwIfAborted()
        if (entries.get(key) === entry) {
          entry.value = value
          entry.weight = sizeOf(value)
          entry.storedAt = Date.now()
        }
        return value
      }, (error: unknown) => {
        if (entries.get(key) === entry) entries.delete(key)
        throw error
      }).finally(() => {
        entry.pending = undefined
        entry.controller = undefined
        trim()
      })
      return entry.pending
    },
    update(owner: string | null, resource: string, change: (value: T) => T) {
      const entry = entries.get(keyFor(owner, resource))
      if (!entry || entry.pending || entry.value === undefined) return
      entry.value = change(entry.value)
      entry.weight = sizeOf(entry.value)
      trim()
    },
    forget,
  }
}
