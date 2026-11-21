import { afterEach, expect, it, vi } from 'vitest'
import type { User } from 'firebase/auth'
import { apiRequest, authenticatedResponse } from '../auth/api'
import { notificationClient, unlinkPushOnLogout } from './client'

vi.mock('../auth/api', async (load) => ({
  ...(await load<typeof import('../auth/api')>()),
  apiRequest: vi.fn(),
  authenticatedResponse: vi.fn(),
}))
const user = { uid: 'teste-local' } as User
afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  localStorage.clear()
})
it('compartilha a conexão da lista e do contador e encerra ao sair o último observador', async () => {
  const snapshot = {
    revision: 'v1',
    page: { items: [], nextCursor: null },
    unread: { count: 2 },
  }
  vi.mocked(authenticatedResponse).mockResolvedValue(
    new Response(JSON.stringify(snapshot)),
  )
  const client = notificationClient(user),
    inbox = vi.fn(),
    counter = vi.fn()
  const stopList = client.subscribeToNotifications(inbox),
    stopCount = client.subscribeToUnreadCount(counter)
  await vi.waitFor(() => expect(counter).toHaveBeenCalledWith({ count: 2 }))
  expect(inbox).toHaveBeenCalledWith(snapshot.page)
  expect(authenticatedResponse).toHaveBeenCalledTimes(1)
  const signal = vi.mocked(authenticatedResponse).mock.calls[0][4]
  stopList()
  expect(signal?.aborted).toBe(false)
  stopCount()
  expect(signal?.aborted).toBe(true)
})
it('guarda só o identificador opaco e desassocia o próprio aparelho antes do logout', async () => {
  const id = crypto.randomUUID(),
    token = 'simulado-para-ensaio-local'
  vi.mocked(apiRequest).mockResolvedValue({
    id,
    provider: 'fcm',
    platform: 'web',
  })
  vi.mocked(authenticatedResponse).mockResolvedValue(new Response('{}'))
  await notificationClient(user).registerPushToken(
    token,
    'web',
    crypto.randomUUID(),
  )
  expect(Object.values(localStorage)).not.toContain(token)
  expect(localStorage.getItem('notification-device:' + user.uid)).toBe(id)
  await unlinkPushOnLogout(user)
  expect(authenticatedResponse).toHaveBeenCalledWith(
    user,
    '/me/push/devices/' + id,
    'DELETE',
    undefined,
    expect.anything(),
  )
  expect(localStorage.getItem('notification-device:' + user.uid)).toBeNull()
})
