import { setTimeout as wait } from 'node:timers/promises'
import { HttpError } from '../errors.js'
import type { CatalogEntry } from '../catalog.js'
import { boundaryText, listOf, missingLiterary, readLimited, recordOf, referenceUrl, userAgent } from './sources.js'

const origin = 'https://openlibrary.org'
export const workPattern = /^OL\d{1,12}W$/
export const editionPattern = /^OL\d{1,12}M$/
export const authorPattern = /^OL\d{1,12}A$/
const requestBudgetMs = 5000
const unavailable = () => new HttpError(503, 'CATALOG_UNAVAILABLE', 'O catálogo externo está indisponível. Tente novamente mais tarde.')
const throttled = () => new HttpError(429, 'CATALOG_BUSY', 'Aguarde um instante antes de pesquisar novamente.')

export class OpenLibraryClient {
  private cache = new Map<string, { value: unknown; expires: number; staleUntil: number }>()
  private pending = new Map<string, Promise<unknown>>()
  private nextSlot = 0
  constructor(
    private request: typeof fetch = fetch,
    private delay: (ms: number) => Promise<unknown> = wait,
    private now: () => number = Date.now,
  ) {}

  async get(path: string, ttl = 300_000) {
    const existing = this.cache.get(path)
    if (existing && existing.expires > this.now()) return existing.value
    const pending = this.pending.get(path)
    if (pending) return pending
    if (this.pending.size >= 4) throw throttled()
    const task = this.fetchPath(path).then((value) => {
      this.cache.delete(path)
      const expires = this.now() + ttl
      this.cache.set(path, { value, expires, staleUntil: expires + (path.startsWith('/search.json?') ? 3_600_000 : 0) })
      if (this.cache.size > 192) this.cache.delete(this.cache.keys().next().value!)
      return value
    }).catch(error => {
      if (existing && existing.staleUntil > this.now() && error instanceof HttpError &&
          (error.statusCode === 429 || error.statusCode === 503)) {
        this.cache.set(path, { ...existing, expires: Math.min(this.now() + 30_000, existing.staleUntil) })
        return existing.value
      }
      throw error
    }).finally(() => this.pending.delete(path))
    this.pending.set(path, task)
    return task
  }

  private async fetchPath(path: string): Promise<unknown> {
    const deadline = this.now() + requestBudgetMs
    let rateLimited = false
    for (let attempt = 0; attempt < 2; attempt++) {
      const now = this.now()
      const slot = Math.max(now, this.nextSlot)
      if (slot >= deadline) throw attempt === 0 || rateLimited ? throttled() : unavailable()
      this.nextSlot = slot + 1100
      if (slot > now) await this.delay(slot - now)
      const remaining = deadline - this.now()
      if (remaining <= 0) break
      try {
        const response = await this.request(origin + path, {
          headers: { 'User-Agent': userAgent, Accept: 'application/json' },
          signal: AbortSignal.timeout(Math.min(4000, remaining)), redirect: 'error',
        })
        if (response.ok) return JSON.parse(await readLimited(response, 1_500_000))
        await response.body?.cancel()
        if (response.status === 404) throw missingLiterary()
        rateLimited = response.status === 429
        if (rateLimited || response.status === 503) {
          const header = response.headers.get('retry-after')
          const delay = header && /^\d+$/.test(header) ? Number(header) * 1000 :
            header ? Math.max(0, Date.parse(header) - this.now()) : 0
          this.nextSlot = Math.max(this.nextSlot, this.now() + (Number.isFinite(delay) ? delay : 0))
          if (attempt === 0) continue
        }
      } catch (error) {
        if (error instanceof HttpError) throw error
        if (attempt === 0) continue
      }
      break
    }
    throw rateLimited ? throttled() : unavailable()
  }
}

export type LiteraryPage = { page: number; limit: number }
export interface WorkSearch extends LiteraryPage {
  q?: string; title?: string; author?: string; isbn?: string; subject?: string; language?: string
  sort?: 'relevance' | 'new' | 'old' | 'popular'
}
export const openLibrary = new OpenLibraryClient()
const reference = 'Referência bibliográfica. Não inclui arquivo nem autorização para distribuir a obra.'
const texts = (value: unknown, limit = 8, width = 150) =>
  listOf(value).slice(0, limit).map(item => boundaryText(item, width)).filter(Boolean)
function idFrom(value: unknown, pattern: RegExp) {
  const id = boundaryText(value).split('/').at(-1) ?? ''
  return pattern.test(id) ? id : null
}
function description(value: unknown, limit = 3000) {
  return boundaryText(typeof value === 'string' ? value : recordOf(value).value, limit)
}
function cover(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? `https://covers.openlibrary.org/b/id/${value}-M.jpg` : undefined
}
function queryString(params: URLSearchParams, path: string) {
  params.sort()
  return path + '?' + params
}
function nextPage(data: Record<string, unknown>, page: LiteraryPage, found: number) {
  const count = data.numFound ?? data.num_found ?? data.size
  return page.page < 50 && (typeof count === 'number' ? count > page.page * page.limit : found >= page.limit)
    ? page.page + 1 : null
}
function workItem(value: unknown, legacy: boolean): CatalogEntry | null {
  const item = recordOf(value)
  const workId = idFrom(item.key, workPattern), title = boundaryText(item.title)
  if (!workId || !title) return null
  const key = '/works/' + workId
  const isbn = texts(item.isbn, 1, 32)[0]
  return {
    key, title, author: texts(item.author_name).join(', ').slice(0, 150) || 'Autoria não informada',
    category: texts(item.subject, 1, 80)[0] ?? '',
    metadata: {
      source: origin + key, license: reference, openLibraryWorkId: workId,
      year: typeof item.first_publish_year === 'number' ? String(item.first_publish_year) : '',
      ...(legacy ? { isbn, publisher: texts(item.publisher, 1)[0], language: texts(item.language, 1, 50)[0] } : {}),
      ...(Number.isSafeInteger(item.number_of_pages_median) && Number(item.number_of_pages_median) > 0 &&
        Number(item.number_of_pages_median) <= 100000 ? { pages: Number(item.number_of_pages_median) } : {}),
      ...(typeof item.ratings_average === 'number' && item.ratings_average >= 0 && item.ratings_average <= 5 &&
        Number.isInteger(item.ratings_count) && Number(item.ratings_count) > 0 &&
        Number(item.ratings_count) <= 100000000 ? { ratingAverage: item.ratings_average, ratingCount: Number(item.ratings_count) } : {}),
      cover: cover(item.cover_i),
    },
  }
}
const phrase = (value: string) => '"' + value.replace(/["\\]/g, ' ') + '"'

export async function searchWorks(input: WorkSearch, client = openLibrary, legacy = false) {
  const q = [
    input.q && (legacy ? input.q : phrase(input.q)),
    input.title && 'title:' + phrase(input.title), input.author && 'author:' + phrase(input.author),
    input.isbn && 'isbn:' + input.isbn, input.subject && 'subject:' + phrase(input.subject),
    input.language && 'language:' + input.language,
  ].filter(Boolean).join(' ')
  const params = new URLSearchParams({
    q, page: String(input.page), limit: String(input.limit), lang: 'pt',
    fields: 'key,title,author_name,first_publish_year,number_of_pages_median,subject,cover_i,ratings_average,ratings_count' +
      (legacy ? ',isbn,publisher,language' : ''),
  })
  if (input.sort && input.sort !== 'relevance')
    params.set('sort', input.sort === 'popular' ? 'readinglog' : input.sort)
  const data = recordOf(await client.get(queryString(params, '/search.json')))
  const docs = listOf(data.docs).slice(0, input.limit)
  return { items: docs.flatMap(value => workItem(value, legacy) ?? []), nextPage: nextPage(data, input, docs.length) }
}

export async function workDetails(id: string, client = openLibrary) {
  const item = recordOf(await client.get(`/works/${id}.json`, 1_800_000))
  const title = boundaryText(item.title)
  if (!title) throw missingLiterary()
  return {
    id, title, description: description(item.description), subjects: texts(item.subjects, 14, 80),
    authors: listOf(item.authors).slice(0, 12).flatMap(value => idFrom(recordOf(recordOf(value).author).key, authorPattern) ?? []),
    source: `${origin}/works/${id}`,
  }
}

function editionItem(value: unknown, parent: string | null = null) {
  const item = recordOf(value)
  const id = idFrom(item.key, editionPattern), title = boundaryText(item.title)
  if (!id || !title) return null
  const workId = parent ?? idFrom(recordOf(listOf(item.works)[0]).key, workPattern)
  return {
    id, workId, title, publishDate: boundaryText(item.publish_date, 80), publishers: texts(item.publishers),
    languages: listOf(item.languages).slice(0, 8).flatMap(lang => {
      const match = /^\/languages\/([a-z]{3})$/.exec(boundaryText(recordOf(lang).key))
      return match?.[1] ?? []
    }),
    isbn: [...texts(item.isbn_13, 4, 32), ...texts(item.isbn_10, 4, 32)],
    cover: cover(listOf(item.covers)[0]) ?? null, source: `${origin}/books/${id}`,
  }
}

export async function workEditions(id: string, page: LiteraryPage, client = openLibrary) {
  const params = new URLSearchParams({ offset: String((page.page - 1) * page.limit), limit: String(page.limit) })
  const data = recordOf(await client.get(queryString(params, `/works/${id}/editions.json`), 1_800_000))
  const entries = listOf(data.entries).slice(0, page.limit)
  return { items: entries.flatMap(value => editionItem(value, id) ?? []), nextPage: nextPage(data, page, entries.length) }
}

export async function openEdition(id: string, client = openLibrary) {
  const item = editionItem(await client.get(`/books/${id}.json`, 1_800_000))
  if (!item || item.id !== id) throw missingLiterary()
  const available = recordOf(await client.get(`/api/volumes/brief/olid/${id}.json`, 60_000).catch(() => null))
  for (const entry of listOf(available.items).slice(0, 15).map(recordOf)) {
    if (entry.match !== 'exact' || entry['ol-edition-id'] !== id) continue
    const url = referenceUrl(entry.itemURL, ['openlibrary.org', 'archive.org', 'www.archive.org'])
    if (!url || !/^\/(books|details|stream|borrow)\//.test(url.pathname)) continue
    if (entry.status === 'full access' || entry.status === 'lendable')
      return { ...item, external: { kind: entry.status === 'lendable' ? 'borrow' : 'read', url: url.href } }
  }
  return { ...item, external: { kind: 'catalog', url: item.source } }
}

export async function searchAuthors(q: string, page: LiteraryPage, client = openLibrary) {
  const params = new URLSearchParams({ q, page: String(page.page), limit: String(page.limit) })
  const data = recordOf(await client.get(queryString(params, '/search/authors.json')))
  const docs = listOf(data.docs).slice(0, page.limit)
  return { items: docs.flatMap(value => {
    const item = recordOf(value), id = idFrom(item.key, authorPattern), name = boundaryText(item.name)
    return id && name ? [{ id, name, topWork: boundaryText(item.top_work), source: `${origin}/authors/${id}` }] : []
  }), nextPage: nextPage(data, page, docs.length) }
}

export async function authorDetails(id: string, client = openLibrary) {
  const item = recordOf(await client.get(`/authors/${id}.json`, 1_800_000))
  const name = boundaryText(item.name)
  if (!name) throw missingLiterary()
  return { id, name, bio: description(item.bio), birthDate: boundaryText(item.birth_date, 80),
    deathDate: boundaryText(item.death_date, 80), source: `${origin}/authors/${id}` }
}
