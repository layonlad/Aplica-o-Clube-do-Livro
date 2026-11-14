import { expect, it, vi } from 'vitest'
import { buildApp } from '../src/app.js'
import { searchCatalog } from '../src/catalog.js'
import type { Pool } from 'pg'
it('permite consulta bibliográfica anônima sem consultar identidade ou dados privados', async () => {
  const verify = vi.fn()
  const search = vi.fn().mockResolvedValue([
    {
      key: '/works/OL1W',
      title: 'Um livro',
      author: 'Uma autora',
      category: '',
      metadata: { source: 'https://openlibrary.org/works/OL1W', license: 'Metadados' },
    },
  ])
  const app = await buildApp({
    pool: {} as Pool,
    verifyToken: verify,
    origin: 'https://app.example',
    catalogSearch: search,
  })
  try {
    const response = await app.inject({ url: '/v1/catalog?q=uma%20busca' })
    expect(response.statusCode).toBe(200)
    expect(search).toHaveBeenCalledWith('uma busca')
    expect(verify).not.toHaveBeenCalled()
    expect(response.body).not.toContain('email')
    expect((await app.inject({ url: '/v1/catalog?q=x' })).statusCode).toBe(400)
  } finally {
    await app.close()
  }
})
it('normaliza apenas os campos bibliográficos e não transforma disponibilidade em licença de download', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        docs: [
          {
            key: '/works/OL22W',
            title: 'Título',
            author_name: ['Autora'],
            cover_i: 42,
            ratings_average: 4.25,
            ratings_count: 10,
            has_fulltext: true,
            isbn: ['123'],
            first_publish_year: 2001,
            extra: 'não retornar',
          },
          { key: 'javascript:alert(1)', title: 'Inválido' },
        ],
      }),
    ),
  )
  const items = await searchCatalog('busca de teste normalizada', request)
  expect(items).toHaveLength(1)
  expect(items[0].metadata.cover).toBe('https://covers.openlibrary.org/b/id/42-M.jpg')
  expect(items[0].metadata.ratingAverage).toBe(4.25)
  expect(items[0].metadata.ratingCount).toBe(10)
  expect(items[0].metadata.license).toContain('Não inclui arquivo')
  expect(items[0]).not.toHaveProperty('extra')
  expect(items[0]).not.toHaveProperty('downloadUrl')
  const again = await searchCatalog('busca de teste normalizada', request)
  expect(again).toEqual(items)
  expect(request).toHaveBeenCalledTimes(1)
})
