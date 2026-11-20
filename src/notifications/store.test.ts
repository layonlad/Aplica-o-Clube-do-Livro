import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../auth/api', async (original) => ({ ...(await original<typeof import('../auth/api')>()), apiRequest: request }))
import { ApiError } from '../auth/api'
import { describe as describeNotice, destinationFor, periodOf } from './destination'
import { NotificationStore } from './store'
import type { Notification } from './types'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const club = id(900)
const notice = (n: number, patch: Partial<Notification> = {}): Notification => ({
  id: id(n), kind: 'post', targetType: 'post', targetId: id(100 + n), clubId: club, clubName: 'Clube de Romance',
  actorName: 'Ana', createdAt: new Date(Date.now() - n * 1000).toISOString(), readAt: null, ...patch,
})
const user = (uid = 'leitora') => ({ uid, emailVerified: true }) as never

beforeEach(() => {
  request.mockReset()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})
afterEach(() => vi.useRealTimers())

it('leva cada tipo ao conteúdo certo e nunca monta destino com id inválido', () => {
  expect(destinationFor(notice(1, { targetType: 'chat', kind: 'chat' }))).toEqual({ scope: club, path: `/app/chat?message=${id(101)}` })
  expect(destinationFor(notice(1))).toEqual({ scope: club, path: `/app/wall?post=${id(101)}` })
  expect(destinationFor(notice(1, { clubId: null }))).toEqual({ scope: null, path: `/app/community?post=${id(101)}` })
  expect(destinationFor(notice(1, { targetType: 'topic', kind: 'topic' }))?.path).toBe(`/app/forum?topic=${id(101)}`)
  expect(destinationFor(notice(1, { targetType: 'profile', kind: 'follow', clubId: null }))?.path).toBe(`/app/people/${id(101)}`)
  expect(destinationFor(notice(1, { targetType: 'invite', kind: 'invitation' }))?.path).toBe('/app/clubs?convites=1')
  expect(destinationFor(notice(1, { targetId: 'https://evil.example/x' }))).toBeNull()
  expect(destinationFor(notice(1, { targetType: 'chat', clubId: '../../x' }))).toBeNull()
  expect(describeNotice(notice(1, { targetType: 'chat', kind: 'chat' })).text).toBe('enviou uma mensagem')
})

it('agrupa por Hoje, Ontem e Anteriores', () => {
  const now = new Date(2026, 10, 20, 15, 0)
  expect(periodOf(new Date(2026, 10, 20, 0, 5).toISOString(), now)).toBe('today')
  expect(periodOf(new Date(2026, 10, 19, 23, 50).toISOString(), now)).toBe('yesterday')
  expect(periodOf(new Date(2026, 10, 17, 9).toISOString(), now)).toBe('earlier')
})

it('atualiza o contador e anuncia só as notificações que chegaram depois', async () => {
  vi.useFakeTimers()
  const store = new NotificationStore()
  const arrived = vi.fn()
  store.onArrival(arrived)
  let unread = 1
  let page = [notice(1)]
  request.mockImplementation(async (_user, path: string) => (path === '/me/notifications/unread' ? { count: unread } : { items: page, nextCursor: null }))
  store.setUser(user())
  const release = store.retain()
  await vi.advanceTimersByTimeAsync(10)
  expect(store.state.unread).toBe(1)
  expect(arrived).not.toHaveBeenCalled() // a primeira leitura é a base, não um aviso
  unread = 2
  page = [notice(0), notice(1)]
  await vi.advanceTimersByTimeAsync(30000)
  expect(store.state.unread).toBe(2)
  expect(arrived).toHaveBeenCalledWith([expect.objectContaining({ id: id(0) })])
  release()
  const calls = request.mock.calls.length
  await vi.advanceTimersByTimeAsync(120000)
  expect(request.mock.calls.length).toBe(calls) // sem telas usando, para de consultar
})

it('marca como lida na hora e desfaz se o servidor recusar', async () => {
  const store = new NotificationStore()
  store.setUser(user())
  request.mockResolvedValueOnce({ items: [notice(1), notice(2)], nextCursor: null }).mockResolvedValueOnce({ count: 2 })
  await store.load()
  request.mockRejectedValueOnce(new ApiError(503, 'API_ERROR', 'Fora do ar'))
  const pending = store.markRead(id(1))
  expect(store.state.unread).toBe(1)
  await expect(pending).rejects.toThrow('Fora do ar')
  expect(store.state.unread).toBe(2)
  expect(store.state.items?.[0].readAt).toBeNull()
  request.mockResolvedValueOnce({ updated: true })
  await store.markAllRead()
  expect(request).toHaveBeenLastCalledWith(expect.anything(), '/me/notifications/read', 'POST', {})
  expect(store.state.unread).toBe(0)
  expect(store.state.items?.every((item) => item.readAt)).toBe(true)
})

it('pagina sem repetir, tira conteúdo removido e zera tudo na troca de conta', async () => {
  const store = new NotificationStore()
  store.setUser(user())
  request.mockResolvedValueOnce({ items: [notice(1), notice(2)], nextCursor: 'c2' }).mockResolvedValueOnce({ count: 2 })
  await store.load()
  request.mockResolvedValueOnce({ items: [notice(2), notice(3, { readAt: new Date().toISOString() })], nextCursor: null })
  await store.loadMore()
  expect(request).toHaveBeenLastCalledWith(expect.anything(), '/me/notifications?limit=20&cursor=c2')
  expect(store.state.items?.map((item) => item.id)).toEqual([id(1), id(2), id(3)])
  request.mockRejectedValueOnce(new ApiError(404, 'NOTICE_NOT_FOUND', 'Esta notificação não está mais disponível.'))
  expect(await store.verify(id(1))).toBeNull()
  expect(store.state.items?.map((item) => item.id)).toEqual([id(2), id(3)])
  expect(store.state.unread).toBe(1)
  store.setUser(user('outra-conta'))
  expect(store.state).toMatchObject({ uid: 'outra-conta', items: null, unread: 0 })
  store.setUser(null)
  expect(store.state.uid).toBeNull()
})

it('retoma o sino da conta nova quando há consulta da conta anterior em andamento', async () => {
  vi.useFakeTimers()
  const store = new NotificationStore()
  let finish!: (data:{count:number})=>void
  request.mockImplementationOnce(()=>new Promise(done=>{finish=done})).mockResolvedValue({count:2})
  store.setUser(user('primeira'))
  const release=store.retain()
  try {
    await vi.advanceTimersByTimeAsync(5)
    store.setUser(user('segunda'))
    await vi.advanceTimersByTimeAsync(5)
    finish({count:99})
    await vi.advanceTimersByTimeAsync(25)
    expect(store.state.uid).toBe('segunda')
    expect(store.state.unread).toBe(2)
  } finally {release()}
})
