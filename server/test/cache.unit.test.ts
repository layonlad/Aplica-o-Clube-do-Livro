import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

function worker() {
  const handlers: Record<string, (event: unknown) => void> = {}
  const fetch = vi.fn().mockResolvedValue(new Response('public asset'))
  runInNewContext(readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8'), {
    self: { registration: { scope: 'https://club.example/app/' }, addEventListener: (name: string, handler: (event: unknown) => void) => { handlers[name] = handler } },
    URL, Response, fetch, caches: { open: vi.fn().mockResolvedValue({ put: vi.fn() }) },
  })
  return { handlers, fetch }
}
describe('cache público isolado', () => {
  it('não intercepta API, autenticação, outro site ou requisições com bearer', () => {
    const { handlers, fetch } = worker()
    for (const [url, token] of [
      ['https://club.example/app/v1/me', false],
      ['https://club.example/v1/me', false],
      ['https://firebase.example/auth', false],
      ['https://club.example/app/assets/index.js', true],
      ['https://club.example/app/assets/index.js?token=secret', false],
    ] as const) {
      const respondWith = vi.fn()
      handlers.fetch({ request: { url, method: 'GET', headers: new Headers(token ? { Authorization: 'Bearer private' } : {}), mode: 'cors' }, respondWith })
      expect(respondWith).not.toHaveBeenCalled()
    }
    expect(fetch).not.toHaveBeenCalled()
  })
})
