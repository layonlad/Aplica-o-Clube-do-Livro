import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
const { home, search, news, setScope } = vi.hoisted(() => ({ home: vi.fn(), search: vi.fn(), news: vi.fn(), setScope: vi.fn() }))
vi.mock('../literary/api', async (original) => ({ ...(await original<typeof import('../literary/api')>()), fetchFreeBookHome: home, searchFreeBooks: search, fetchNews: news }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { uid: 'u1', emailVerified: true } }) }))
vi.mock('../workspace/WorkspaceProvider', () => ({ useWorkspace: () => ({ setScope }) }))
vi.mock('../community/NotificationBell', () => ({ useUnreadCount: () => 0 }))
import { ServiceNotReady } from '../literary/api'
import { FreeBooksScreen } from './FreeBooksScreen'
import { NewsFeed } from './NewsFeed'

const book = {
  id: 'gutenberg:55752', title: 'Dom Casmurro', authors: ['Machado de Assis'], language: 'pt', year: 1899, subjects: [], description: null, cover: null, pages: null,
  source: { id: 'gutenberg' as const, name: 'Project Gutenberg', url: 'https://www.gutenberg.org/ebooks/55752' },
  license: { kind: 'public-domain' as const, label: 'Domínio público', url: null, verifiedAt: '2026-11-18T12:00:00.000Z' },
  epub: true,
}
function Where() { const location = useLocation(); return <output data-testid="where">{location.pathname + location.search}</output> }
const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="*" element={<><FreeBooksScreen /><Where /></>} /></Routes>
    </MemoryRouter>,
  )
beforeEach(() => { home.mockReset(); search.mockReset(); news.mockReset(); setScope.mockReset() })

it('mostra as seções do acervo e leva "Ler agora" à importação com o EPUB', async () => {
  home.mockResolvedValue({ sections: [{ id: 'br', title: 'Clássicos brasileiros', items: [book] }], categories: [] })
  renderAt('/app/explore/gratuitos')
  expect(await screen.findByRole('heading', { name: 'Clássicos brasileiros' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /Dom Casmurro, de Machado de Assis/ }))
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText('Domínio público')).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: /Ler agora/ }))
  expect(setScope).toHaveBeenCalledWith('personal')
  expect(screen.getByTestId('where')).toHaveTextContent('/app/library/gerenciar?gratuito=gutenberg%3A55752&ler=1')
})

it('sem o serviço publicado, avisa que está sendo conectado e não inventa livros', async () => {
  home.mockRejectedValue(new ServiceNotReady())
  renderAt('/app/explore/gratuitos')
  expect(await screen.findByRole('heading', { name: 'A Biblioteca Gratuita está sendo conectada' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Gratuito$/ })).not.toBeInTheDocument()
})

it('pesquisa pelo endereço e mostra os resultados em grade', async () => {
  home.mockResolvedValue({ sections: [], categories: [] })
  search.mockResolvedValue({ items: [book], nextCursor: null })
  renderAt('/app/explore/gratuitos?q=casmurro&idioma=pt')
  expect(await screen.findByRole('heading', { name: 'Resultados para “casmurro”' })).toBeInTheDocument()
  expect(search).toHaveBeenCalledWith({ q: 'casmurro', category: '', language: 'pt' })
  expect(await screen.findByRole('button', { name: /Dom Casmurro/ })).toBeInTheDocument()
})

it('notícias mostram a fonte e abrem a matéria original', async () => {
  news.mockResolvedValue({
    items: [{ id: 'n1', title: 'Prêmio anuncia finalistas', summary: 'Resumo', url: 'https://example.org/n1', source: { name: 'Jornal', url: 'https://example.org' }, image: null, publishedAt: new Date().toISOString(), category: 'premios' }],
    nextCursor: null,
    categories: [{ id: 'premios', label: 'Prêmios' }],
  })
  render(<NewsFeed />)
  const link = await screen.findByRole('link', { name: /Prêmio anuncia finalistas/ })
  expect(link).toHaveAttribute('href', 'https://example.org/n1')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  expect(link).toHaveTextContent('Jornal')
  await userEvent.click(screen.getByRole('button', { name: 'Prêmios' }))
  expect(news).toHaveBeenLastCalledWith({ category: 'premios' })
})
