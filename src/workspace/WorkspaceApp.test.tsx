import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../app/ThemeProvider'
import { WorkspaceApp } from './WorkspaceApp'
import { apiRequest } from '../auth/api'

const { session, authCalls } = vi.hoisted(() => ({
  session: { user: null, loading: false, status: 'signed-out' },
  authCalls: { createUserWithEmailAndPassword: vi.fn(), sendPasswordResetEmail: vi.fn() },
}))
vi.mock('../auth/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => session,
}))
vi.mock('firebase/auth', async (original) => ({
  ...(await original<typeof import('firebase/auth')>()),
  ...authCalls,
}))
vi.mock('../auth/api', async (original) => ({
  ...(await original<typeof import('../auth/api')>()), apiRequest: vi.fn(),
}))

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="Rota atual">{location.pathname} {location.state?.from}</output>
}
function open(path: string) {
  return render(<MemoryRouter initialEntries={[path]}>
    <ThemeProvider><WorkspaceApp /></ThemeProvider><LocationProbe />
  </MemoryRouter>)
}

beforeEach(() => {
  vi.mocked(apiRequest).mockReset()
  localStorage.setItem('clube-livro-name', 'Nome de uma sessão anterior')
})

it.each(['/', '/app', '/app/library', '/app/profile', '/app/reader/book', '/app/community', '/app/explore', '/app/clubs', '/app/notifications', '/app/settings', '/app/wall'])(
  'só apresenta autenticação ao abrir %s sem sessão', async (path) => {
    open(path)
    expect(await screen.findByRole('heading', { name: 'Bom ter você aqui' })).toBeInTheDocument()
    expect(screen.getByLabelText('Rota atual')).toHaveTextContent('/account')
    expect(screen.queryByRole('navigation', { name: 'Navegação principal' })).not.toBeInTheDocument()
    expect(screen.queryByText('Nome de uma sessão anterior')).not.toBeInTheDocument()
    expect(apiRequest).not.toHaveBeenCalled()
  },
)

it('preserva o destino do convite e oferece recuperação e cadastro', async () => {
  const user = userEvent.setup()
  open('/invite?token=synthetic')
  expect(screen.getByLabelText('Rota atual')).toHaveTextContent('/account /invite?token=synthetic')
  await user.click(screen.getByRole('button', { name: 'Esqueci minha senha' }))
  expect(await screen.findByRole('heading', { name: 'Recuperar senha' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Criar uma conta' }))
  expect(await screen.findByRole('heading', { name: 'Comece sua história' })).toBeInTheDocument()
  expect(apiRequest).not.toHaveBeenCalled()
})
