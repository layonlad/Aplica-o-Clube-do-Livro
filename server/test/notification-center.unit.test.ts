import { it, expect } from 'vitest'
import {
  centerSettings,
  settingsPatch,
  deviceInput,
} from '../src/notification-center.js'
import { fcmErrorStatus } from '../src/fcm-delivery.js'
it('valida somente as escolhas do titular e conserva patches parciais', () => {
  expect(settingsPatch.parse({ pushEnabled: false })).toEqual({
    pushEnabled: false,
  })
  expect(settingsPatch.safeParse({ userId: 'outro' }).success).toBe(false)
  expect(settingsPatch.safeParse({ mutedClubIds: ['inválido'] }).success).toBe(
    false,
  )
  expect(centerSettings.parse({}).chatDeliveryMode).toBe('mentions')
  expect(
    deviceInput.safeParse({
      token: 'https://example.com/unsafe',
      platform: 'web',
      installationId: crypto.randomUUID(),
    }).success,
  ).toBe(false)
})
it('distingue token vencido, limitação, erro de configuração e falha temporária', () => {
  expect(
    fcmErrorStatus({ code: 'messaging/registration-token-not-registered' }),
  ).toBe(410)
  expect(fcmErrorStatus({ code: 'messaging/quota-exceeded' })).toBe(429)
  expect(fcmErrorStatus({ code: 'messaging/mismatched-credential' })).toBe(400)
  expect(fcmErrorStatus({ code: 'messaging/internal-error' })).toBe(503)
})
