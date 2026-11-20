import { describe, expect, it, vi } from 'vitest'
import { OpenLibraryClient, openEdition, searchAuthors, searchWorks, workEditions } from '../src/literary/open-library.js'
import { editionClubs, editionFile, editionMention, freeEdition, matchFreeEdition, searchFree } from '../src/literary/free-books.js'
import { parseNewsFeed, verifiedFeeds } from '../src/literary/news.js'
import { openEpubPackage } from '../src/epub-package.js'
import type { Pool } from 'pg'

function catalog(mock: (url: string) => Response) {
  let now = 10_000
  const request = vi.fn<typeof fetch>(async url => mock(String(url)))
  const delay = vi.fn(async (ms: number) => { now += ms })
  return { request, delay, client: new OpenLibraryClient(request, delay, () => now) }
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })

describe('catálogo literário', () => {
  it('deduplica pesquisa em andamento, combina ISBN e idioma e pagina pelo total da fonte', async () => {
    const { client, request } = catalog(() => json({ numFound: 34, docs: [
      { key: 'OL42W', title: 'Título original', author_name: ['Autora'], ISBN: ['9999'], has_fulltext: true },
    ] }))
    const opts = { page: 2, limit: 12, isbn: '9781234567890', language: 'por', subject: 'contos' }
    const results = await Promise.all([searchWorks(opts, client), searchWorks(opts, client)])
    expect(results[0]).toEqual(results[1])
    expect(request).toHaveBeenCalledTimes(1)
    const url = new URL(request.mock.calls[0][0] as string)
    expect(url.searchParams.get('q')).toBe('isbn:9781234567890 subject:"contos" language:por')
    expect(url.searchParams.get('page')).toBe('2')
    expect(results[0].nextPage).toBe(3)
    expect(results[0].items[0].metadata).toMatchObject({ openLibraryWorkId: 'OL42W' })
    expect(results[0].items[0].metadata).not.toHaveProperty('isbn')
    expect(results[0].items[0]).not.toHaveProperty('downloadUrl')
  })

  it('respeita Retry-After, limita tentativas e recupera a busca quando a fonte volta', async () => {
    let attempt = 0
    const { client, delay, request } = catalog(() => ++attempt === 1
      ? new Response('limite', { status: 429, headers: { 'Retry-After': '2' } })
      : json({ numFound: 0, docs: [] }))
    await expect(searchAuthors('Machado', { page: 1, limit: 12 }, client)).resolves.toEqual({ items: [], nextPage: null })
    expect(delay).toHaveBeenCalledWith(2000)
    expect(request).toHaveBeenCalledTimes(2)
    const service = catalog(() => json({}, 503))
    await expect(searchAuthors('Machado', { page: 1, limit: 12 }, service.client)).rejects.toMatchObject({ statusCode: 503 })
    expect(service.request).toHaveBeenCalledTimes(2)
  })

  it('limita o tempo da consulta e reaproveita metadados conhecidos quando a fonte falha', async () => {
    let now = 10_000
    let online = true
    const request = vi.fn<typeof fetch>(async () => {
      if (online) return json({ numFound: 1, docs: [{ key: 'OL42W', title: 'Livro' }] })
      now += 5_001
      return json({}, 503)
    })
    const client = new OpenLibraryClient(request, async delay => { now += delay }, () => now)
    const input = { title: 'Livro', page: 1, limit: 10 }

    const first = await searchWorks(input, client)
    online = false
    now += 301_000
    await expect(searchWorks(input, client)).resolves.toEqual(first)
    expect(request).toHaveBeenCalledTimes(2)
    await expect(searchWorks(input, client)).resolves.toEqual(first)
    expect(request).toHaveBeenCalledTimes(2)

    now += 3_601_000
    await expect(searchWorks(input, client)).rejects.toMatchObject({ code: 'CATALOG_UNAVAILABLE' })
    expect(request).toHaveBeenCalledTimes(3)
  })

  it('mantém traduções e edições separadas e só oferece empréstimo externo da edição exata', async () => {
    const { client } = catalog(url => {
      if (url.includes('/editions.json')) return json({ size: 2, entries: [
        { key: '/books/OL16M', title: 'O primeiro', languages: [{key:'/languages/por'}], isbn_13: ['9781000000001'] },
        { key: '/books/OL17M', title: 'The first', languages: [{key:'/languages/eng'}], isbn_13: ['9781000000002'] },
      ] })
      if (url.includes('/brief/')) return json({ items: [
        { match: 'similar', status: 'full access', 'ol-edition-id': 'OL17M', itemURL: 'https://archive.org/details/similar' },
        { match: 'exact', status: 'full access', 'ol-edition-id': 'OL16M', itemURL: 'https://fake.example/details/invalid' },
        { match: 'exact', status: 'lendable', 'ol-edition-id': 'OL16M', itemURL: 'http://archive.org/details/exact' },
      ] })
      return json({ key: '/books/OL16M', title: 'O primeiro', works: [{ key: '/works/OL42W' }] })
    })
    const list = await workEditions('OL42W', { page: 1, limit: 2 }, client)
    expect(list.items.map(item => item.languages)).toEqual([['por'], ['eng']])
    expect(list.items.map(item => item.workId)).toEqual(['OL42W', 'OL42W'])
    expect((await openEdition('OL16M', client)).external).toEqual({ kind: 'borrow', url: 'https://archive.org/details/exact' })
  })
})

describe('edições gratuitas e RSS', () => {
  it('combina filtros e preserva vínculo inequívoco entre obra e idioma', () => {
    const { items } = searchFree({ page: 1, limit: 2, q: 'Cartomante', language: 'por', genre: 'contos', availability: 'internal' })
    expect(items.map(item => item.id)).toEqual(['a-cartomante-1896-pt'])
    expect(matchFreeEdition('A CARTOMANTE', 'Machado de Assis')?.workId).toBe('machado-a-cartomante')
    expect(matchFreeEdition('A Cartomante', 'Outra pessoa')).toBeNull()
    expect(editionMention('O conto A Cartomante foi publicado em 1884')).toBeNull()
    expect(editionMention('A Cartomante e Dom Casmurro, de Machado de Assis')).toBeNull()
  })

  it('serve somente a versão verificada e conserva EPUB e capa válidos', async () => {
    const actual = await editionFile('a-cartomante-1896-pt','read')
    expect(openEpubPackage(actual.bytes).files.has('OPS/cover.jpg')).toBe(true)
    await expect(editionFile('gutenberg-55752','read')).rejects.toMatchObject({ statusCode: 404 })
    await expect(editionFile('../../ambiente','download')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('normaliza referências do RSS, rejeita fonte trocada e deixa campos sem licença vazios', () => {
    const feed = verifiedFeeds[0]
    const xml = `<rss version="2.0"><channel><title>Canal de teste</title>
      <item><title>Feira do livro exibe A Cartomante, de Machado de Assis</title><link>https://agenciabrasil.ebc.com.br/cultura/noticia/2026-11/feira?utm=teste</link><pubDate>Wed, 18 Nov 2026 12:00:00 GMT</pubDate><description>Texto a descartar.</description></item>
      <item><title>Feira do livro</title><link>https://example.invalid/noticia/feira</link><pubDate>Wed, 18 Nov 2026 12:00:00 GMT</pubDate></item>
      </channel></rss>`
    const items = parseNewsFeed(xml, feed, Date.parse('2026-11-18T17:00:00Z'))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ summary: null, category: 'feiras', bookId: 'a-cartomante-1896-pt',
      url: 'https://agenciabrasil.ebc.com.br/cultura/noticia/2026-11/feira', publishedAt: '2026-11-18T12:00:00.000Z' })
    expect(() => parseNewsFeed('<!DOCTYPE rss><rss/>', feed)).toThrow()
    expect(() => parseNewsFeed('<rss>', feed)).toThrow()
  })

  it('nunca retorna clubes sem correspondência de obra', async () => {
    const pool = { query: vi.fn(async () => ({ rows: [
      { id: 'a', name: 'Um clube', title: 'A Cartomante', author: 'Machado de Assis' },
      { id: 'b', name: 'Outro clube', title: 'A Cartomante', author: 'Outra pessoa' },
    ] })) } as unknown as Pool
    const result = await editionClubs(pool, { id: 'pessoa', email:'teste@example.invalid', name:'Teste' }, freeEdition('a-cartomante-1896-pt'))
    expect(result.items).toEqual([{ id: 'a', name: 'Um clube' }])
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("m.status='active'"), ['pessoa'])
  })
})
