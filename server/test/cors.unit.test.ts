import { expect, it, vi } from 'vitest'
import type { Pool } from 'pg'
import { buildApp } from '../src/app.js'
it('permite somente origens exatas da migração e continua exigindo autenticação', async () => {
  const verifyToken = vi.fn(),
    app = await buildApp({
      pool: {} as Pool,
      verifyToken,
      origin: 'https://new.web.app',
      additionalOrigins: ['https://legacy.web.app'],
    })
  try {
    for (const origin of [
      'https://new.web.app',
      'https://legacy.web.app',
      'https://evil.example',
      'https://new.web.app.evil.example',
    ]) {
      const r = await app.inject({
        method: 'OPTIONS',
        url: '/v1/me/appearance',
        headers: {
          origin,
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'authorization',
        },
      })
      expect(r.headers['access-control-allow-origin']).toBe(
        ['https://new.web.app', 'https://legacy.web.app'].includes(origin) ? origin : undefined,
      )
    }
    expect(
      (
        await app.inject({
          url: '/v1/me/appearance',
          headers: { origin: 'https://legacy.web.app' },
        })
      ).statusCode,
    ).toBe(401)
    expect(verifyToken).not.toHaveBeenCalled()
  } finally {
    await app.close()
  }
})
