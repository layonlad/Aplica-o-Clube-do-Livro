import { beforeEach, expect, it, vi } from 'vitest'
const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../auth/api', async (original) => ({ ...(await original<typeof import('../auth/api')>()), publicRequest: request }))
import { ApiError } from '../auth/api'
import { fetchFreeBookHome, fetchNews, parseFreeBook, parseNewsItem, searchFreeBooks, ServiceNotReady } from './api'

const book = {
  id: 'gutenberg:55752',
  title: 'Dom Casmurro',
  authors: ['Machado de Assis'],
  language: 'pt',
  year: 1899,
  subjects: ['Ficção brasileira'],
  description: null,
  cover: 'https://example.org/capa.jpg',
  pages: 256,
  source: { id: 'gutenberg', name: 'Project Gutenberg', url: 'https://www.gutenberg.org/ebooks/55752' },
  license: { kind: 'public-domain', label: 'Domínio público', url: null, verifiedAt: '2026-11-18T12:00:00.000Z' },
  epub: true,
}
beforeEach(() => request.mockReset())

it('aceita um livro com licença verificada e descarta capa sem https', () => {
  expect(parseFreeBook(book)?.title).toBe('Dom Casmurro')
  expect(parseFreeBook({ ...book, cover: 'http://example.org/capa.jpg' })?.cover).toBeNull()
})

it('não mostra livro sem verificação de licença ou de fonte desconhecida', () => {
  expect(parseFreeBook({ ...book, license: { ...book.license, verifiedAt: '' } })).toBeNull()
  expect(parseFreeBook({ ...book, license: { ...book.license, kind: 'copyrighted' } })).toBeNull()
  expect(parseFreeBook({ ...book, source: { ...book.source, id: 'outra' } })).toBeNull()
})

it('descarta notícia sem link https ou sem data válida', () => {
  const news = { id: 'n1', title: 'Prêmio', summary: '', url: 'https://example.org/a', source: { name: 'Jornal', url: 'https://example.org' }, image: null, publishedAt: '2026-11-18T10:00:00Z', category: 'premios' }
  expect(parseNewsItem(news)?.source.name).toBe('Jornal')
  expect(parseNewsItem({ ...news, url: 'javascript:alert(1)' })).toBeNull()
  expect(parseNewsItem({ ...news, publishedAt: 'ontem' })).toBeNull()
})

it('rota ainda inexistente vira "sendo conectado", sem inventar dados', async () => {
  request.mockRejectedValueOnce(new ApiError(404, 'API_ERROR', 'Não foi possível consultar o serviço.'))
  await expect(fetchFreeBookHome()).rejects.toBeInstanceOf(ServiceNotReady)
  request.mockRejectedValueOnce(new ApiError(501, 'NOT_IMPLEMENTED', '…'))
  await expect(fetchNews({})).rejects.toBeInstanceOf(ServiceNotReady)
})

it('erro real do serviço segue para a tela', async () => {
  request.mockRejectedValueOnce(new ApiError(404, 'FREE_BOOK_NOT_FOUND', 'Livro não encontrado.'))
  await expect(searchFreeBooks({ q: 'casmurro' })).rejects.toThrow('Livro não encontrado.')
})

it('monta a busca com filtros e remove seções vazias ou inválidas', async () => {
  request.mockResolvedValueOnce({ items: [book, { id: 'x' }], nextCursor: 'c2' })
  const page = await searchFreeBooks({ q: ' casmurro ', category: 'classicos', language: 'pt', cursor: 'c1' })
  expect(request).toHaveBeenLastCalledWith('/free-books?q=casmurro&category=classicos&language=pt&cursor=c1&limit=24')
  expect(page).toMatchObject({ items: [{ id: 'gutenberg:55752' }], nextCursor: 'c2' })
  request.mockResolvedValueOnce({ sections: [{ id: 'a', title: 'Clássicos', items: [book] }, { id: 'b', title: 'Vazia', items: [{ id: 'x' }] }], categories: [{ id: 'classicos', label: 'Clássicos' }, { id: '' }] })
  const home = await fetchFreeBookHome()
  expect(home.sections.map((section) => section.id)).toEqual(['a'])
  expect(home.categories).toEqual([{ id: 'classicos', label: 'Clássicos' }])
})
