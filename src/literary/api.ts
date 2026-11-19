import type { User } from 'firebase/auth'
import { ApiError, apiRequest, authenticatedResponse, publicRequest } from '../auth/api'
import type { FreeBook, FreeBookHome, FreeBookPage, NewsItem, NewsPage } from './contracts'

export class ServiceNotReady extends Error {
  constructor() { super('Este recurso ainda está sendo conectado ao servidor.') }
}

const text = (value: unknown, max = 500) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
const https = (value: unknown) => {
  const url = text(value, 2000)
  try { return url && new URL(url).protocol === 'https:' ? url : null } catch { return null }
}
const strings = (value: unknown) => Array.isArray(value) ? value.map(item => text(item, 120)).filter(Boolean) : []
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {}
const cursor = (value: unknown) => typeof value === 'string' && value ? value : null
const idPattern = /^[a-z0-9-]{1,100}$/
const categories = (value: unknown) =>
  (Array.isArray(value) ? value : []).flatMap((entry: unknown) => {
    const item = record(entry), id = text(item.id, 60), label = text(item.label, 60)
    return id && label ? [{ id, label }] : []
  })
const providers = { Curadoria: 'curation', 'Project Gutenberg': 'gutenberg', 'Standard Ebooks': 'standard-ebooks' } as const
const languages: Record<string, string> = { por: 'pt', eng: 'en', spa: 'es', fra: 'fr', deu: 'de', ita: 'it' }
const searchLanguages = Object.fromEntries(Object.entries(languages).map(([iso, label]) => [label, iso]))

export function literaryCoverUrl(id?: string) {
  const base = import.meta.env.VITE_API_URL
  return base && id && idPattern.test(id)
    ? `${base.replace(/\/$/, '')}/v1/literary/free/${id}/cover` : undefined
}

export function parseFreeBook(value: unknown, genres: Record<string, string> = {}): FreeBook | null {
  const item = record(value), rights = record(item.rights)
  const id = text(item.id, 100), title = text(item.title, 300)
  const url = https(item.source), provider = text(item.provider, 80), language = text(item.language, 12)
  const authorized = item.availability === 'internal' && rights.read === true &&
    rights.store === true && strings(rights.jurisdictions).includes('BR') &&
    !!text(rights.verifiedOn, 40) && strings(rights.evidence).length > 0 && !!text(rights.license)
  if (!idPattern.test(id) || !title || !url || !Object.hasOwn(providers, provider)) return null
  if (!authorized && item.availability !== 'external' && item.availability !== 'catalog') return null
  return {
    id, title, authors: strings([item.author]), language: languages[language] ?? (language || 'und'),
    year: typeof item.year === 'number' && Number.isInteger(item.year) ? item.year : null,
    subjects: strings(item.genres).map(genre => genres[genre] ?? genre),
    description: text(item.description, 4000) || null,
    cover: item.coverPath === `/v1/literary/free/${id}/cover` && authorized ? literaryCoverUrl(id) ?? null : null,
    pages: null,
    source: { id: providers[provider as keyof typeof providers], name: provider, url },
    license: authorized ? { label: text(rights.license), url: https(strings(rights.evidence)[0]), verifiedAt: text(rights.verifiedOn, 40) } : null,
    epub: authorized,
  }
}

export function parseNewsItem(value: unknown): NewsItem | null {
  const item = record(value)
  const id = text(item.id, 200), title = text(item.title, 300), url = https(item.url), publishedAt = text(item.publishedAt, 40)
  if (!id || !title || !url || !publishedAt || Number.isNaN(Date.parse(publishedAt))) return null
  return {
    id, title, postId: text(item.postId, 36) || null, summary: text(item.summary, 600), url, publishedAt,
    source: { name: text(item.source, 80) || new URL(url).hostname, url: new URL(url).origin },
    image: https(item.imageUrl), category: text(item.category, 60),
  }
}

async function ready<T>(request: Promise<T>) {
  try {
    return await request
  } catch (error) {
    if (error instanceof ApiError && ((error.status === 404 && error.code === 'API_ERROR') || error.status === 501))
      throw new ServiceNotReady()
    throw error
  }
}

async function freePage(query: URLSearchParams) {
  const data = await ready(publicRequest<Record<string, unknown>>(`/literary/free?${query}`))
  const labels = categories(data.genres)
  const genres = Object.fromEntries(labels.map(({ id, label }) => [id, label]))
  const items = (Array.isArray(data.items) ? data.items : []).map(item => parseFreeBook(item, genres))
    .filter((item): item is FreeBook => !!item)
  const nextCursor = typeof data.nextPage === 'number' ? String(data.nextPage) : null
  return { items, nextCursor, categories: labels }
}

export async function fetchFreeBookHome(): Promise<FreeBookHome> {
  const { items, categories } = await freePage(new URLSearchParams({ limit: '20' }))
  return {
    sections: [
      { id: 'reader', title: 'Leia no aplicativo', items: items.filter(item => item.epub) },
      { id: 'external', title: 'Leitura nas fontes oficiais', items: items.filter(item => !item.epub) },
    ].filter(section => section.items.length > 0),
    categories,
  }
}

export async function searchFreeBooks(filters: { q?: string; category?: string; language?: string; cursor?: string | null }): Promise<FreeBookPage> {
  const query = new URLSearchParams()
  if (filters.q && filters.q.trim().length >= 2) query.set('q', filters.q.trim())
  if (filters.category) query.set('genre', filters.category)
  if (filters.language && searchLanguages[filters.language]) query.set('language', searchLanguages[filters.language])
  if (filters.cursor) query.set('page', filters.cursor)
  query.set('limit', '20')
  const { items, nextCursor } = await freePage(query)
  return { items, nextCursor }
}

export function addFreeBook(user: User, id: string) {
  return ready(apiRequest<{ bookId: string; created: boolean }>(user, `/me/literary/books/${encodeURIComponent(id)}`, 'POST'))
}

export async function readFreeBookEpub(user: User, id: string, signal?: AbortSignal) {
  const response = await ready(authenticatedResponse(user, `/me/literary/books/${encodeURIComponent(id)}/epub`, 'GET', undefined, signal))
  return response.blob()
}

export async function fetchNews(filters: { category?: string; cursor?: string | null }): Promise<NewsPage> {
  const query = new URLSearchParams()
  if (filters.category) query.set('category', filters.category)
  if (filters.cursor) query.set('cursor', filters.cursor)
  query.set('limit', '20')
  const data = await ready(publicRequest<Record<string, unknown>>(`/literary/news?${query}`))
  return {
    items: (Array.isArray(data.items) ? data.items : []).map(parseNewsItem).filter((item): item is NewsItem => !!item),
    nextCursor: cursor(data.nextCursor),
    categories: categories(data.categories),
  }
}

export const languageNames: Record<string, string> = { pt: 'Português', en: 'Inglês', es: 'Espanhol', fr: 'Francês', de: 'Alemão', it: 'Italiano' }
