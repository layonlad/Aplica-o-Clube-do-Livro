import { expect, it, vi } from 'vitest'
import { buildNotificationApp } from '../src/notification-http-app.js'
it('recusa token ausente, identidade errada, não verificada ou audiência inválida antes de acessar a fila', async () => {
  const caller = 'clube-scheduler@project-test.iam.gserviceaccount.com',
    verify = vi.fn(),
    run = vi.fn(async () => ({ worker: 'notifications' as const, skipped: true as const })),
    app = await buildNotificationApp({ audience: 'https://worker.example', caller, verify, run })
  try {
    expect((await app.inject({ method: 'POST', url: '/run' })).statusCode).toBe(401)
    verify.mockRejectedValueOnce(Error('invalid audience'))
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/run',
          headers: { authorization: 'Bearer invalid' },
        })
      ).statusCode,
    ).toBe(401)
    for (const claims of [
      { email: 'other@project-test.iam.gserviceaccount.com', email_verified: true },
      { email: caller, email_verified: false },
    ]) {
      verify.mockResolvedValueOnce(claims)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/run',
            headers: { authorization: 'Bearer wrong' },
          })
        ).statusCode,
      ).toBe(403)
    }
    expect(run).not.toHaveBeenCalled()
    verify.mockResolvedValueOnce({ email: caller, email_verified: true })
    const response = await app.inject({
      method: 'POST',
      url: '/run',
      headers: { authorization: 'Bearer valid' },
    })
    expect(response.statusCode).toBe(200)
    expect(run).toHaveBeenCalledTimes(1)
  } finally {
    await app.close()
  }
})
