import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { User } from 'firebase/auth'
import { AuthProvider, useAuth } from './AuthProvider'
import { ApiError, apiRequest } from './api'
import { reportRejectedSession } from './session-events'

const firebase = vi.hoisted(() => ({
  auth: { currentUser: null as User | null },
  observe: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('./firebase', () => ({ createClientAuth: () => firebase.auth }))
vi.mock('firebase/auth', () => ({ onIdTokenChanged: firebase.observe, signOut: firebase.signOut }))
vi.mock('./api', async (original) => ({ ...(await original<typeof import('./api')>()), apiRequest: vi.fn() }))

const account = (uid: string) => ({ uid, emailVerified: true, email: uid + '@example.invalid' }) as User
let observer: (user: User | null) => void
function notify(user: User | null) {
  firebase.auth.currentUser = user
  observer(user)
}
function Probe() {
  const { status, user, retry, signOut } = useAuth()
  return <><p role="status">{status}</p>{user && <p>{user.email}</p>}
    <button onClick={retry}>Revalidar</button>
    <button onClick={() => void signOut()}>Sair</button></>
}
function open() { return render(<AuthProvider><Probe /></AuthProvider>) }
beforeEach(() => {
  firebase.auth.currentUser = null
  firebase.observe.mockImplementation((_auth, listener) => { observer = listener; return () => {} })
  firebase.signOut.mockReset().mockImplementation(async () => notify(null))
  vi.mocked(apiRequest).mockReset().mockResolvedValue({})
})
afterEach(() => vi.clearAllMocks())

it('espera a identidade e a API antes de expor a conta e ignora a validação atrasada da outra conta', async () => {
  const a = account('a'), b = account('b')
  let done!: () => void
  vi.mocked(apiRequest).mockImplementationOnce(() => new Promise<void>((resolve) => { done = resolve }))
  open()
  expect(screen.getByRole('status')).toHaveTextContent('initializing')
  act(() => notify(a))
  expect(screen.queryByText(a.email!)).toBeNull()
  await act(async () => notify(b))
  expect(screen.getByText(b.email!)).toBeInTheDocument()
  await act(async () => done())
  expect(screen.queryByText(a.email!)).toBeNull()
  expect(screen.getByText(b.email!)).toBeInTheDocument()
})

it('preserva a sessão Firebase durante falha temporária e restaura a conta com retry', async () => {
  const user = account('offline')
  vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError(503, 'AUTH_UNAVAILABLE', 'Falha temporária'))
  open()
  await act(async () => notify(user))
  expect(screen.getByRole('status')).toHaveTextContent('error')
  expect(screen.queryByText(user.email!)).toBeNull()
  expect(firebase.signOut).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('Revalidar'))
  expect(await screen.findByText(user.email!)).toBeInTheDocument()
})

it('ignora resposta antiga de conta anterior e encerra a sessão atual revogada', async () => {
  const user = account('revoked'), previous = account('previous')
  open()
  await act(async () => notify(user))
  act(() => reportRejectedSession(previous))
  expect(firebase.signOut).not.toHaveBeenCalled()
  await act(async () => reportRejectedSession(user))
  expect(screen.getByRole('status')).toHaveTextContent('signed-out')
  expect(screen.queryByText(user.email!)).toBeNull()
})

it('bloqueia a interface durante logout e ignora validações pendentes', async () => {
  let finish!: () => void
  firebase.signOut.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
  const user = account('signed-out')
  open()
  await act(async () => notify(user))
  fireEvent.click(screen.getByText('Sair'))
  expect(screen.queryByText(user.email!)).toBeNull()
  await act(async () => { notify(null); finish() })
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('signed-out'))
})
