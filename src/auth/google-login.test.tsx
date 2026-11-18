import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { AuthScreen } from './AuthScreen'
import { canRedirectGoogle, firebaseAuthDomain } from './firebase'
import { consumeAccountRedirect } from './return-path'
import type { Auth } from 'firebase/auth'

const mocks = vi.hoisted(() => ({
  popup: vi.fn(),
  redirect: vi.fn(),
  result: vi.fn(),
}))
vi.mock('./AuthProvider', () => ({ useAuth: () => ({ auth: {} }) }))
vi.mock('./firebase', async (original) => ({
  ...(await original<typeof import('./firebase')>()),
  canRedirectGoogle: vi.fn(),
}))
vi.mock('firebase/auth', async (original) => ({
  ...(await original<typeof import('firebase/auth')>()),
  signInWithPopup: mocks.popup,
  signInWithRedirect: mocks.redirect,
  getRedirectResult: mocks.result,
}))

beforeEach(() => {
  sessionStorage.clear()
  vi.clearAllMocks()
  mocks.result.mockResolvedValue(null)
})

function openLogin(sameOrigin: boolean) {
  vi.mocked(canRedirectGoogle).mockReturnValue(sameOrigin)
  render(<MemoryRouter initialEntries={[{ pathname: '/account', state: { from: '/app/library' } }]}>
    <AuthScreen />
  </MemoryRouter>)
}

it('usa somente os domínios do projeto de autenticação como auxiliares locais', async () => {
  const { canRedirectGoogle: canRedirect } = await vi.importActual<typeof import('./firebase')>('./firebase')
  const configured = 'producao.firebaseapp.com'
  expect(firebaseAuthDomain('producao', configured, 'producao.web.app')).toBe('producao.web.app')
  expect(firebaseAuthDomain('producao', configured, 'producao.firebaseapp.com')).toBe(configured)
  expect(firebaseAuthDomain('producao', configured, 'compatibilidade.web.app')).toBe(configured)

  const auth = { config: { authDomain: 'producao.web.app' }, emulatorConfig: null } as Auth
  expect(canRedirect(auth, { protocol: 'https:', host: 'producao.web.app' })).toBe(true)
  expect(canRedirect(auth, { protocol: 'https:', host: 'compatibilidade.web.app' })).toBe(false)
  expect(canRedirect(auth, { protocol: 'http:', host: 'producao.web.app' })).toBe(false)
})

it('entra na mesma aba e guarda uma vez o destino interno para o retorno OAuth', () => {
  mocks.redirect.mockReturnValue(new Promise(() => {}))
  openLogin(true)
  fireEvent.click(screen.getByRole('button', { name: 'Continuar com Google' }))
  expect(mocks.redirect).toHaveBeenCalledOnce()
  expect(mocks.popup).not.toHaveBeenCalled()
  expect(consumeAccountRedirect()).toBe('/app/library')
  expect(consumeAccountRedirect()).toBeNull()
})

it('mantém a janela do Firebase na origem de compatibilidade e explica o bloqueio', async () => {
  mocks.popup.mockRejectedValue({ code: 'auth/popup-blocked' })
  openLogin(false)
  fireEvent.click(screen.getByRole('button', { name: 'Continuar com Google' }))
  expect(mocks.popup).toHaveBeenCalledOnce()
  expect(mocks.redirect).not.toHaveBeenCalled()
  expect(mocks.result).not.toHaveBeenCalled()
  expect(await screen.findByRole('alert')).toHaveTextContent('Safari ou Chrome')
})

it('mostra o erro do retorno dentro da tela de login e permite entrar com e-mail', async () => {
  mocks.result.mockRejectedValue({ code: 'auth/web-storage-unsupported' })
  openLogin(true)
  expect(await screen.findByRole('alert')).toHaveTextContent('ou entre com e-mail')
  expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled()
})
