import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { PushSettings } from './PushSettings'
import { apiRequest } from '../auth/api'
vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { uid: 'reader', emailVerified: true } }),
}))
vi.mock('../auth/api', async (original) => ({
  ...(await original<typeof import('../auth/api')>()),
  apiRequest: vi.fn(),
}))
const requestPermission = vi.fn(),
  subscribe = vi.fn(),
  unsubscribe = vi.fn(),
  register = vi.fn()
let current: unknown = null
class Notices {
  static permission: NotificationPermission = 'default'
  static requestPermission = requestPermission
}
const device = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic',
  toJSON: () => ({
    endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic',
    expirationTime: null,
    keys: { p256dh: 'synthetic', auth: 'synthetic' },
  }),
  unsubscribe,
}
const registration = {
  active: {},
  pushManager: { getSubscription: async () => current, subscribe },
}
beforeEach(() => {
  current = null
  Notices.permission = 'default'
  vi.mocked(apiRequest).mockReset()
  requestPermission.mockReset()
  subscribe.mockReset()
  register.mockReset()
  unsubscribe.mockReset()
  vi.stubGlobal('Notification', Notices)
  vi.stubGlobal('PushManager', class {})
  vi.stubGlobal('isSecureContext', true)
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: async () => (register.mock.calls.length ? registration : undefined),
      register,
      ready: Promise.resolve(registration),
    },
  })
  register.mockResolvedValue(registration)
  subscribe.mockImplementation(async () => {
    current = device
    return device
  })
  unsubscribe.mockImplementation(async () => {
    current = null
    return true
  })
  requestPermission.mockImplementation(async () => {
    Notices.permission = 'granted'
    return 'granted'
  })
  vi.mocked(apiRequest).mockImplementation((_u, path) =>
    Promise.resolve(
      path === '/me/push/config'
        ? { enabled: true, publicKey: 'B' + 'A'.repeat(86) }
        : { enabled: false },
    ),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker
})
it('só solicita permissão após escolha explícita e permite desativar o aparelho', async () => {
  const keyboard = userEvent.setup()
  render(
    <MemoryRouter>
      <PushSettings />
    </MemoryRouter>,
  )
  const toggle = await screen.findByLabelText('Receber notificações neste aparelho')
  await waitFor(() => expect(toggle).toBeEnabled())
  expect(requestPermission).not.toHaveBeenCalled()
  expect(register).not.toHaveBeenCalled()
  await keyboard.click(toggle)
  await waitFor(() => expect(toggle).toBeChecked())
  expect(requestPermission).toHaveBeenCalledTimes(1)
  expect(apiRequest).toHaveBeenCalledWith(
    expect.anything(),
    '/me/push/subscriptions',
    'POST',
    expect.objectContaining({ expirationTime: null }),
  )
  await keyboard.click(toggle)
  await waitFor(() => expect(toggle).not.toBeChecked())
  expect(unsubscribe).toHaveBeenCalled()
  expect(apiRequest).toHaveBeenCalledWith(expect.anything(), '/me/push/subscriptions', 'DELETE', {
    endpoint: device.endpoint,
  })
})
it('mantém avisos internos quando o navegador bloqueia push e não repete o pedido', async () => {
  Notices.permission = 'denied'
  render(
    <MemoryRouter>
      <PushSettings />
    </MemoryRouter>,
  )
  expect(await screen.findByRole('status')).toHaveTextContent('Bloqueado')
  expect(screen.getByLabelText('Receber notificações neste aparelho')).toBeDisabled()
  expect(screen.getByRole('link', { name: /Central e preferências/ })).toBeInTheDocument()
  expect(requestPermission).not.toHaveBeenCalled()
})
