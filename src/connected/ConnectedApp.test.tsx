import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectedApp } from './ConnectedApp'
import { apiRequest, ApiError } from '../auth/api'

const { state } = vi.hoisted(() => ({ state: { user: { uid: 'user', email: 'member@example.com', emailVerified: true }, loading: false, signOut: vi.fn() } }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => state, AuthProvider: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('../auth/api', async (original) => ({ ...await original<typeof import('../auth/api')>(), apiRequest: vi.fn() }))
function open(path: string) { return render(<MemoryRouter initialEntries={[path]}><ConnectedApp /></MemoryRouter>) }

beforeEach(() => { vi.mocked(apiRequest).mockReset(); state.user.emailVerified = true })
describe('acesso conectado', () => {
  it('exige confirmação do e-mail antes de solicitar dados privados', () => {
    state.user.emailVerified = false
    open('/clubs')
    expect(screen.getByRole('heading', { name: 'Confirme seu e-mail' })).toBeInTheDocument()
    expect(apiRequest).not.toHaveBeenCalled()
  })
  it('mostra estado vazio real sem dados do protótipo', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ user: { id: 'user', name: 'Membro', email: 'member@example.com' }, clubs: [] })
    open('/clubs')
    expect(await screen.findByText('Você ainda não participa de nenhum clube. Abra o link que recebeu ou crie o seu.')).toBeInTheDocument()
    expect(screen.queryByText('Torto Arado')).not.toBeInTheDocument()
  })
  it('membro não recebe controles de administração', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ club: { id: 'club', name: 'Clube real', role: 'member' }, members: [{ id: 'user', name: 'Membro', role: 'member', status: 'active' }] })
    open('/clubs/club')
    expect(await screen.findByRole('heading', { name: 'Clube real' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Criar convite' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remover' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Excluir clube' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sair deste clube' })).toBeInTheDocument()
    expect(apiRequest).toHaveBeenCalledTimes(1)
  })
  it('exige confirmação antes de excluir o clube e retorna à lista', async () => {
    const user = userEvent.setup()
    vi.mocked(apiRequest).mockImplementation(async (_user, path) => {
      if (path === '/clubs/club') return { club: { id: 'club', name: 'Clube real', role: 'admin' }, members: [] }
      if (path === '/clubs/club/invites') return []
      if (path === '/clubs/club/settings') return { name: 'Clube real', description: '', accent: '#6e477c', visibility: 'private', version: 0 }
      if (path === '/clubs/club/join-requests') return { items: [], nextCursor: null }
      return { clubs: [] }
    })
    open('/clubs/club')
    await user.click(await screen.findByRole('button', { name: 'Configurações e solicitações' }))
    await user.click(screen.getByRole('button', { name: 'Excluir clube' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(apiRequest).not.toHaveBeenCalledWith(state.user, '/clubs/club', 'DELETE')
    await user.click(screen.getByRole('button', { name: 'Excluir clube' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar exclusão do clube' }))
    expect(apiRequest).toHaveBeenCalledWith(state.user, '/clubs/club', 'DELETE')
    expect(await screen.findByRole('heading', { name: 'Seus clubes' })).toBeInTheDocument()
  })
  it('mantém o convite na tela e informa falha sem simular sucesso', async () => {
    const user = userEvent.setup()
    vi.mocked(apiRequest).mockRejectedValue(new ApiError(400, 'INVALID_INVITE', 'Convite expirado.'))
    open('/invite?token=abc')
    await user.click(screen.getByRole('button', { name: 'Aceitar convite' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Convite expirado.')
    expect(screen.getByRole('textbox', { name: 'Código do convite' })).toHaveValue('abc')
  })
})
