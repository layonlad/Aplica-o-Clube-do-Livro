import { beforeEach, expect, it, vi } from 'vitest'
const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../auth/api', async (original) => ({ ...(await original<typeof import('../auth/api')>()), publicRequest: request }))
import { ApiError } from '../auth/api'
import { fetchFreeBookHome, fetchNews, parseFreeBook, parseNewsItem, searchFreeBooks, ServiceNotReady } from './api'

const book = {
  id: 'a-cartomante-1896-pt',
  title: 'A Cartomante',
  author: 'Machado de Assis',
  language: 'por',
  year: 1896,
  genres: ['classicos'],
  provider: 'Curadoria',
  source: 'https://example.org/edicao',
  coverPath: '/v1/literary/free/a-cartomante-1896-pt/cover',
  availability: 'internal',
  rights: { read: true, store: true, jurisdictions: ['BR'], license: 'Domínio público', evidence: ['https://example.org/evidencia'], verifiedOn: '2026-11-18' },
}
beforeEach(() => request.mockReset())

it('aceita a edição interna com evidência e usa somente a rota de capa da API', () => {
  vi.stubEnv('VITE_API_URL', 'http://localhost:3001')
  try {
    expect(parseFreeBook(book)).toMatchObject({title:'A Cartomante', language:'pt', epub:true, cover:'http://localhost:3001/v1/literary/free/a-cartomante-1896-pt/cover'})
    expect(parseFreeBook({ ...book, coverPath: 'https://example.org/capa.jpg' })?.cover).toBeNull()
  } finally {
    vi.unstubAllEnvs()
  }
})

it('rejeita acesso interno sem direito e exibe a edição externa com apenas o link oficial', () => {
  expect(parseFreeBook({ ...book, rights: null })).toBeNull()
  expect(parseFreeBook({ ...book, rights: { ...book.rights, jurisdictions: ['US'] } })).toBeNull()
  expect(parseFreeBook({ ...book, provider: 'Outra' })).toBeNull()
  expect(parseFreeBook({ ...book, availability: 'external', rights: null })).toMatchObject({license:null, epub:false})
})

it('descarta notícia sem link https ou sem data válida', () => {
  const news = { id: 'n1', title: 'Prêmio', summary: '', url: 'https://example.org/a', source: 'Jornal', imageUrl: null, publishedAt: '2026-11-18T10:00:00Z', category: 'premios' }
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
  request.mockResolvedValueOnce({ items: [book, { id: 'x' }], nextPage: 2 })
  const page = await searchFreeBooks({ q: ' casmurro ', category: 'classicos', language: 'pt', cursor: '1' })
  expect(request).toHaveBeenLastCalledWith('/literary/free?q=casmurro&genre=classicos&language=por&page=1&limit=20')
  expect(page).toMatchObject({ items: [{ id: 'a-cartomante-1896-pt' }], nextCursor: '2' })
  request.mockResolvedValueOnce({ items: [book, { id: 'x' }], genres: [{ id: 'classicos', label: 'Clássicos' }, { id: '' }] })
  const home = await fetchFreeBookHome()
  expect(home.sections.map((section) => section.id)).toEqual(['reader'])
  expect(home.categories).toEqual([{ id: 'classicos', label: 'Clássicos' }])
})
