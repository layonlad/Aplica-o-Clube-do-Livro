import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
const { request, setScope } = vi.hoisted(() => ({ request: vi.fn(), setScope: vi.fn() }))
const verifiedUser = { uid: 'leitora', emailVerified: true }
vi.mock('../auth/api', async (original) => ({ ...(await original<typeof import('../auth/api')>()), apiRequest: request }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: verifiedUser }) }))
vi.mock('../workspace/WorkspaceProvider', () => ({ useWorkspace: () => ({ scope: 'personal', setScope, refresh: vi.fn() }) }))
vi.mock('../coral/data', () => ({ useMyClubs: () => ({ items: [{ id: '00000000-0000-4000-8000-000000000900', name: 'Clube de Romance' }] }) }))
import { ApiError } from '../auth/api'
import { NotificationBanner } from './NotificationBanner'
import { NotificationCenter } from './NotificationCenter'
import { NotificationPreferences } from './NotificationPreferences'
import { notifications } from './store'
import type { Notification } from './types'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const club = id(900)
const today = new Date(), yesterday = new Date(Date.now() - 86400000), old = new Date(Date.now() - 6 * 86400000)
const items: Notification[] = [
  { id: id(1), kind: 'chat', targetType: 'chat', targetId: id(101), clubId: club, clubName: 'Clube de Romance', actorName: 'Ana', createdAt: today.toISOString(), readAt: null },
  { id: id(2), kind: 'post', targetType: 'post', targetId: id(102), clubId: club, clubName: 'Clube de Romance', actorName: 'Rafael', createdAt: yesterday.toISOString(), readAt: null },
  { id: id(3), kind: 'mention', targetType: 'post', targetId: id(103), clubId: null, clubName: null, actorName: 'Mariana', createdAt: old.toISOString(), readAt: new Date().toISOString() },
]
function Where() { const location = useLocation(); return <output data-testid="where">{location.pathname + location.search}</output> }
const center = (path = '/app/notifications') =>
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path="*" element={<><NotificationCenter /><NotificationBanner /><Where /></>} /></Routes></MemoryRouter>)

beforeEach(() => {
  request.mockReset()
  setScope.mockReset()
  notifications.setUser(null)
  notifications.setUser(verifiedUser as never)
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  vi.stubGlobal('Notification', { permission: 'denied', requestPermission: vi.fn() })
})

function api(extra: (path: string, method?: string, body?: unknown) => unknown = () => undefined) {
  request.mockImplementation(async (_user, path: string, method?: string, body?: unknown) => {
    const custom = extra(path, method, body)
    if (custom !== undefined) return custom
    if (path === '/me/notifications/unread') return { count: 2 }
    if (path.startsWith('/me/notifications?')) return { items, nextCursor: null }
    if (/^\/me\/notifications\/[0-9a-f-]{36}$/.test(path)) return items.find((item) => path.endsWith(item.id))
    if (path === '/me/push/config') return { enabled: true, publicKey: 'B' + 'A'.repeat(86) }
    return { updated: true }
  })
}

it('mostra as notificações por período e abre a mensagem do chat no clube certo', async () => {
  api()
  center()
  expect(await screen.findByRole('heading', { name: 'Hoje' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Ontem' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Anteriores' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /Ana enviou uma mensagem, Clube de Romance/ }))
  await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`/app/chat?message=${id(101)}`))
  expect(setScope).toHaveBeenCalledWith(club)
  expect(request).toHaveBeenCalledWith(expect.anything(), '/me/notifications/read', 'POST', { id: id(1) })
})

it('avisa quando o conteúdo foi removido e tira o item da lista', async () => {
  api((path) => (path === `/me/notifications/${id(2)}` ? Promise.reject(new ApiError(404, 'NOTICE_NOT_FOUND', 'x')) : undefined))
  center()
  await userEvent.click(await screen.findByRole('button', { name: /Rafael publicou no mural/ }))
  expect(await screen.findByText(/não está mais disponível/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Rafael/ })).not.toBeInTheDocument()
  expect(screen.getByTestId('where')).toHaveTextContent('/app/notifications')
})

it('marca todas como lidas e mostra que a pessoa está em dia', async () => {
  api()
  center()
  await screen.findByRole('heading', { name: 'Hoje' })
  await userEvent.click(screen.getByRole('button', { name: /^Não lidas/ }))
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  const [headerAction, toolbarAction] = screen.getAllByRole('button', { name: 'Marcar todas como lidas' })
  expect(headerAction).toBeEnabled()
  await userEvent.click(toolbarAction)
  expect(await screen.findByRole('heading', { name: 'Você está em dia' })).toBeInTheDocument()
  expect(request).toHaveBeenCalledWith(expect.anything(), '/me/notifications/read', 'POST', {})
})

it('falha de conexão mostra Tentar novamente', async () => {
  api((path) => (path.startsWith('/me/notifications?') ? Promise.reject(new ApiError(503, 'API_ERROR', 'Sem conexão com o serviço.')) : undefined))
  center()
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Sem conexão com o serviço.')
  api()
  await userEvent.click(within(alert).getByRole('button', { name: 'Tentar novamente' }))
  expect(await screen.findByRole('heading', { name: 'Hoje' })).toBeInTheDocument()
})

it('push do sistema abre a notificação certa pelo endereço ?open=', async () => {
  api()
  center(`/app/notifications?open=${id(2)}`)
  await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`/app/wall?post=${id(102)}`))
})

it('banner aparece para atividade nova e agrupa chegadas seguidas', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    let unread = 1, page = [items[1]]
    api((path) => (path === '/me/notifications/unread' ? { count: unread } : path.startsWith('/me/notifications?') ? { items: page, nextCursor: null } : undefined))
    render(<MemoryRouter initialEntries={['/app/library']}><NotificationBanner /><Where /></MemoryRouter>)
    const release = notifications.retain()
    await act(() => vi.advanceTimersByTimeAsync(50))
    expect(screen.queryByText(/novidades|publicou/)).not.toBeInTheDocument()
    unread = 3
    page = [{ ...items[0], id: id(7) }, { ...items[0], id: id(8), actorName: 'Bia' }, items[1]]
    await act(() => vi.advanceTimersByTimeAsync(30000))
    expect(await screen.findByText('2 novidades')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Dispensar aviso' }))
    await waitFor(() => expect(screen.queryByText('2 novidades')).not.toBeInTheDocument())
    release()
  } finally {
    vi.useRealTimers()
  }
})

it('preferências carregam da conta, salvam ao tocar e desfazem se falhar', async () => {
  let fail = false
  api((path, method) => {
    if (path === '/me/notification-preferences' && method === 'POST') return fail ? Promise.reject(new ApiError(503, 'API_ERROR', 'Serviço fora do ar.')) : { updated: true }
    if (path === '/me/notification-preferences') return { interactions: true, mentions: true, clubs: true, events: true, readings: true, reminderMinutes: 1440 }
    if (path.endsWith('/chat/settings')) return method === 'POST' ? undefined : { preference: 'mentions' }
    return undefined
  })
  vi.stubGlobal('PushManager', class {})
  vi.stubGlobal('isSecureContext', true)
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: async () => undefined, addEventListener() {}, removeEventListener() {} } })
  render(<MemoryRouter><NotificationPreferences /></MemoryRouter>)
  const mentions = await screen.findByRole('checkbox', { name: /Menções/ })
  await userEvent.click(mentions)
  await waitFor(() => expect(request).toHaveBeenCalledWith(expect.anything(), '/me/notification-preferences', 'POST', expect.objectContaining({ mentions: false })))
  expect(await screen.findByText('Preferências salvas na sua conta.')).toBeInTheDocument()
  fail = true
  await userEvent.click(screen.getByRole('checkbox', { name: /Atividade dos clubes/ }))
  expect(await screen.findByText(/Não foi possível salvar/)).toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: /Atividade dos clubes/ })).toBeChecked()
  // Push bloqueado no navegador: orienta sem pedir de novo.
  expect(await screen.findByText(/bloqueadas para este site/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Ativar notificações' })).not.toBeInTheDocument()
  delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker
  vi.unstubAllGlobals()
})

it('não interrompe o leitor EPUB nem repete o chat que já está aberto', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    let unread = 0, page: Notification[] = []
    api((path) => (path === '/me/notifications/unread' ? { count: unread } : path.startsWith('/me/notifications?') ? { items: page, nextCursor: null } : undefined))
    const { unmount } = render(<MemoryRouter initialEntries={['/app/reader/livro']}><NotificationBanner /></MemoryRouter>)
    const release = notifications.retain()
    await act(() => vi.advanceTimersByTimeAsync(50))
    unread = 1
    page = [{ ...items[1], id: id(20) }]
    await act(() => vi.advanceTimersByTimeAsync(30000))
    expect(screen.queryByText(/publicou no mural/)).not.toBeInTheDocument()
    expect(notifications.state.unread).toBe(1) // o sino continua contando
    unmount()
    release()
  } finally {
    vi.useRealTimers()
  }
})
