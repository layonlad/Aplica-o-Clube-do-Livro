import { ApiError, publicRequest } from '../auth/api'
import type { FreeBook, FreeBookHome, FreeBookPage, NewsItem, NewsPage } from './contracts'

/**
 * Adaptador do contrato v1 (src/literary/contracts.ts). É o único lugar do site que conhece as rotas
 * da Biblioteca Gratuita e das Notícias: confere o formato de cada resposta e descarta itens inválidos,
 * para que uma mudança no servidor nunca mostre dados quebrados na tela.
 */

/** A rota ainda não existe no servidor publicado (o serviço está sendo conectado). */
export class ServiceNotReady extends Error {
  constructor() { super('Este recurso ainda está sendo conectado ao servidor.') }
}

const text = (value: unknown, max = 500) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
const https = (value: unknown) => {
  const url = text(value, 2000)
  try { return url && new URL(url).protocol === 'https:' ? url : null } catch { return null }
}
const strings = (value: unknown, max = 12) => (Array.isArray(value) ? value.map((item) => text(item, 120)).filter(Boolean).slice(0, max) : [])
const count = (value: unknown) => (Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : null)
const categories = (value: unknown) =>
  (Array.isArray(value) ? value : []).flatMap((item) => {
    const id = text(item?.id, 60), label = text(item?.label, 60)
    return id && label ? [{ id, label }] : []
  })

export function parseFreeBook(value: unknown): FreeBook | null {
  const item = value as Record<string, any> | null
  if (!item || typeof item !== 'object') return null
  const id = text(item.id, 200), title = text(item.title, 300)
  const sourceUrl = https(item.source?.url)
  const verifiedAt = text(item.license?.verifiedAt, 40)
  const kinds = ['public-domain', 'cc0', 'cc-by', 'cc-by-sa', 'other-open']
  const sources = ['gutenberg', 'standard-ebooks', 'open-library']
  // Sem licença verificada o livro não aparece: a biblioteca só mostra obras com uso autorizado.
  if (!id || !title || !sourceUrl || !verifiedAt || !kinds.includes(item.license?.kind) || !sources.includes(item.source?.id)) return null
  return {
    id,
    title,
    authors: strings(item.authors, 6),
    language: text(item.language, 12) || 'und',
    year: Number.isInteger(item.year) ? item.year : null,
    subjects: strings(item.subjects),
    description: text(item.description, 4000) || null,
    cover: https(item.cover),
    pages: count(item.pages),
    source: { id: item.source.id, name: text(item.source.name, 80) || sourceUrl, url: sourceUrl },
    license: { kind: item.license.kind, label: text(item.license.label, 120) || 'Uso livre', url: https(item.license.url), verifiedAt },
    epub: item.epub === true,
  }
}

export function parseNewsItem(value: unknown): NewsItem | null {
  const item = value as Record<string, any> | null
  if (!item || typeof item !== 'object') return null
  const id = text(item.id, 200), title = text(item.title, 300), url = https(item.url), publishedAt = text(item.publishedAt, 40)
  if (!id || !title || !url || !publishedAt || Number.isNaN(Date.parse(publishedAt))) return null
  return {
    id,
    title,
    summary: text(item.summary, 600),
    url,
    source: { name: text(item.source?.name, 80) || new URL(url).hostname, url: https(item.source?.url) ?? new URL(url).origin },
    image: https(item.image),
    publishedAt,
    category: text(item.category, 60),
  }
}

async function read<T>(path: string): Promise<T> {
  try {
    return await publicRequest<T>(path)
  } catch (error) {
    // Rota inexistente: o Fastify responde 404 sem código próprio (vira API_ERROR). Um 404 com código do
    // serviço (ex.: livro removido) é erro de verdade e segue para a tela.
    if (error instanceof ApiError && ((error.status === 404 && error.code === 'API_ERROR') || error.status === 501)) throw new ServiceNotReady()
    throw error
  }
}
const books = (value: unknown) => (Array.isArray(value) ? value : []).map(parseFreeBook).filter((item): item is FreeBook => !!item)
const cursor = (value: unknown) => (typeof value === 'string' && value ? value : null)

export async function fetchFreeBookHome(): Promise<FreeBookHome> {
  const data = await read<Record<string, unknown>>('/free-books/home')
  return {
    sections: (Array.isArray(data.sections) ? data.sections : []).flatMap((section: any) => {
      const id = text(section?.id, 60), title = text(section?.title, 80), items = books(section?.items)
      return id && title && items.length ? [{ id, title, items }] : []
    }),
    categories: categories(data.categories),
  }
}

export async function searchFreeBooks(filters: { q?: string; category?: string; language?: string; cursor?: string | null }): Promise<FreeBookPage> {
  const query = new URLSearchParams()
  if (filters.q && filters.q.trim().length >= 2) query.set('q', filters.q.trim())
  if (filters.category) query.set('category', filters.category)
  if (filters.language) query.set('language', filters.language)
  if (filters.cursor) query.set('cursor', filters.cursor)
  query.set('limit', '24')
  const data = await read<Record<string, unknown>>(`/free-books?${query}`)
  return { items: books(data.items), nextCursor: cursor(data.nextCursor) }
}

export async function fetchFreeBook(id: string): Promise<FreeBook> {
  const book = parseFreeBook(await read<unknown>(`/free-books/${encodeURIComponent(id)}`))
  if (!book) throw new ApiError(502, 'INVALID_RESPONSE', 'As informações deste livro chegaram incompletas. Tente novamente.')
  return book
}

/** Baixa o EPUB autorizado pela API (que já verificou a licença) para entrar na biblioteca pessoal. */
export async function downloadFreeBookEpub(book: FreeBook): Promise<File> {
  const base = import.meta.env.VITE_API_URL
  if (!base) throw new ApiError(503, 'API_UNAVAILABLE', 'É preciso conexão com o serviço para baixar o livro.')
  const response = await fetch(`${base.replace(/\/$/, '')}/v1/free-books/${encodeURIComponent(book.id)}/epub`, {
    cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(90000),
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
    if ((response.status === 404 && !payload?.error?.code) || response.status === 501) throw new ServiceNotReady()
    throw new ApiError(response.status, payload?.error?.code ?? 'API_ERROR', payload?.error?.message ?? 'Não foi possível baixar o livro agora.')
  }
  const blob = await response.blob()
  if (blob.size > 10000000) throw new ApiError(413, 'TOO_LARGE', 'Este EPUB passa de 10 MB, o limite da biblioteca pessoal.')
  const name = book.title.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 80) || 'livro'
  return new File([blob], `${name}.epub`, { type: 'application/epub+zip' })
}

export async function fetchNews(filters: { category?: string; cursor?: string | null }): Promise<NewsPage> {
  const query = new URLSearchParams()
  if (filters.category) query.set('category', filters.category)
  if (filters.cursor) query.set('cursor', filters.cursor)
  query.set('limit', '20')
  const data = await read<Record<string, unknown>>(`/news?${query}`)
  return {
    items: (Array.isArray(data.items) ? data.items : []).map(parseNewsItem).filter((item): item is NewsItem => !!item),
    nextCursor: cursor(data.nextCursor),
    categories: categories(data.categories),
  }
}

export const languageNames: Record<string, string> = { pt: 'Português', en: 'Inglês', es: 'Espanhol', fr: 'Francês', de: 'Alemão', it: 'Italiano' }
export const sourceNotes: Record<string, string> = {
  gutenberg: 'Project Gutenberg',
  'standard-ebooks': 'Standard Ebooks',
  'open-library': 'Open Library',
}
