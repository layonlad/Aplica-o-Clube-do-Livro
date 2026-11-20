import { expect, it, vi } from 'vitest'
import type { User } from 'firebase/auth'
import { createReadCache } from './read-cache'
import { endSession } from './session-events'

it('deduplica leituras em andamento e separa contas e visitantes', async () => {
  const cache = createReadCache<string>({ freshMs: 1000, maxEntries: 4 })
  const load = vi.fn(async () => 'leitura de A')
  const first = cache.read('A', '/feed', load)
  expect(cache.read('A', '/feed', load)).toBe(first)
  await expect(first).resolves.toBe('leitura de A')
  expect(cache.peek('A', '/feed')).toBe('leitura de A')
  expect(cache.peek('B', '/feed')).toBeUndefined()
  expect(cache.peek(null, '/feed')).toBeUndefined()
  expect(load).toHaveBeenCalledOnce()
})

it('cancela requisições no logout e descarta resultados entregues depois', async () => {
  const cache = createReadCache<string>({ freshMs: 1000, maxEntries: 4 })
  let finish!: (value: string) => void
  let signal!: AbortSignal
  const pending = cache.read('A', '/media', (nextSignal) => {
    signal = nextSignal
    return new Promise<string>((resolve) => { finish = resolve })
  })
  await Promise.resolve()
  const refused = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  endSession({ uid: 'A' } as User)
  expect(signal.aborted).toBe(true)
  finish('foto privada')
  await refused
  expect(cache.peek('A', '/media')).toBeUndefined()
})

it('remove entradas antigas para respeitar a cota de memória', async () => {
  const cache = createReadCache<string>({
    freshMs: 1000, maxEntries: 4, maxWeight: 6, sizeOf: (value) => value.length,
  })
  for (const key of ['1', '2', '3']) await cache.read('A', key, async () => 'abc')
  expect(cache.peek('A', '1')).toBeUndefined()
  expect(cache.peek('A', '3')).toBe('abc')
})
