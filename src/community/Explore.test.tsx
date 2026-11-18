import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Explore } from './Explore'
import { publicRequest } from '../auth/api'

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('../workspace/WorkspaceProvider', () => ({
  useWorkspace: () => ({ addToPersonal: vi.fn(), busy: false }),
}))
vi.mock('../clubs/DiscoverClubs', () => ({ DiscoverClubs: () => null }))
vi.mock('../auth/api', async (original) => ({
  ...(await original<typeof import('../auth/api')>()),
  publicRequest: vi.fn(),
}))
vi.mock('./social-api', () => ({
  socialRead: vi.fn(async (_user, path: string) =>
    path === '/public/discover' ? { books: [], sections: {} } : { items: [], nextCursor: null },
  ),
}))
const book = (title: string) => ({
  key: '/works/OL1W',
  title,
  author: 'Autora',
  category: '',
  metadata: { source: 'https://openlibrary.org/works/OL1W', license: 'Referência bibliográfica' },
})
const field = () =>
  screen.getByRole('searchbox', { name: 'Pesquisar pessoas, publicações e livros' })
async function open() {
  render(
    <MemoryRouter>
      <Explore />
    </MemoryRouter>,
  )
  await act(async () => {})
}
async function type(value: string) {
  fireEvent.change(field(), { target: { value } })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1300)
  })
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(publicRequest).mockReset()
  vi.mocked(publicRequest).mockResolvedValue({ items: [book('Livro encontrado')] })
})
afterEach(() => vi.useRealTimers())
it('pesquisa livros em Tudo após parar de digitar e ignora termos de uma letra', async () => {
  await open()
  await type('M')
  expect(publicRequest).not.toHaveBeenCalled()
  fireEvent.change(field(), { target: { value: 'Machado' } })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200)
  })
  expect(publicRequest).not.toHaveBeenCalled()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1100)
  })
  expect(publicRequest).toHaveBeenCalledWith('/catalog?q=Machado')
  expect(screen.getByRole('heading', { name: 'Livro encontrado' })).toBeInTheDocument()
})
it('pesquisa na aba Livros sem precisar enviar o formulário', async () => {
  await open()
  fireEvent.click(screen.getByRole('button', { name: 'Livros' }))
  await type('Dom Casmurro')
  expect(publicRequest).toHaveBeenCalledWith('/catalog?q=Dom+Casmurro')
  expect(screen.getByRole('heading', { name: 'Livro encontrado' })).toBeInTheDocument()
})
it('descarta resposta antiga que chega depois da pesquisa mais recente', async () => {
  const resolvers: ((value: unknown) => void)[] = []
  vi.mocked(publicRequest).mockImplementation(
    () => new Promise((resolve) => resolvers.push(resolve)),
  )
  await open()
  await type('Primeiro')
  await type('Segundo')
  expect(resolvers).toHaveLength(2)
  await act(async () => resolvers[1]({ items: [book('Resultado atual')] }))
  await act(async () => resolvers[0]({ items: [book('Resultado antigo')] }))
  expect(screen.getByRole('heading', { name: 'Resultado atual' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Resultado antigo' })).not.toBeInTheDocument()
})
it('limpar a pesquisa cancela resultados pendentes e não mostra livros na aba Pessoas', async () => {
  let resolveRequest!: (value: unknown) => void
  vi.mocked(publicRequest).mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveRequest = resolve
      }),
  )
  await open()
  await type('Livro')
  fireEvent.click(screen.getByRole('button', { name: 'Limpar pesquisa' }))
  await act(async () => resolveRequest({ items: [book('Resposta descartada')] }))
  expect(screen.queryByRole('heading', { name: 'Resposta descartada' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Pessoas' }))
  await type('Leitora')
  expect(publicRequest).toHaveBeenCalledTimes(1)
})
