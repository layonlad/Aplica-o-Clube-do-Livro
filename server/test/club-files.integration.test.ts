import { beforeAll, afterAll, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { testDatabase } from './database.js'
import { buildApp } from '../src/app.js'
let db: Awaited<ReturnType<typeof testDatabase>>,
  app: Awaited<ReturnType<typeof buildApp>>,
  club: string,
  other: string,
  bookId: string,
  member: string
const objects = new Map<string, Buffer>(),
  call = (path: string, uid = 'file-owner', method = 'GET', payload?: Record<string, unknown>) =>
    app.inject({
      url: '/v1' + path,
      headers: { authorization: 'Bearer ' + uid },
      method: method as 'GET' | 'POST' | 'DELETE',
      payload,
    })
beforeAll(async () => {
  db = await testDatabase()
  app = await buildApp({
    pool: db.pool,
    origin: 'https://club.example',
    rateMax: 2000,
    storage: {
      put: async (key, bytes) => {
        objects.set(key, bytes)
      },
      get: async (key) => objects.get(key)!,
      remove: async (key) => {
        objects.delete(key)
      },
    },
    verifyToken: async (uid) => ({
      uid,
      email: uid + '@example.com',
      name: uid,
      emailVerified: true,
    }),
  })
  member = (await call('/me', 'file-member')).json().user.id
  club = (await call('/clubs', undefined, 'POST', { name: 'Acervo autorizado' })).json().id
  other = (await call('/clubs', undefined, 'POST', { name: 'Outro acervo' })).json().id
  await db.pool.query("INSERT INTO club_memberships(club_id,user_id,role) VALUES($1,$2,'member')", [
    club,
    member,
  ])
  const workspace = (await call(`/clubs/${club}/workspace`)).json()
  bookId = (
    await call(`/clubs/${club}/workspace`, undefined, 'POST', {
      version: workspace.version,
      action: {
        type: 'book.add',
        title: 'Obra de teste',
        author: 'Autora',
        category: '',
        content: '',
      },
    })
  ).json().state.books[0].id
})
afterAll(async () => {
  await app?.close()
  await db?.close()
})
it('exige licença e papel administrativo, protege o EPUB por membership e revoga ao remover o livro', async () => {
  const bytes = await readFile(
      new URL('../../public/books/a-cadeira-perto-da-janela.epub', import.meta.url),
    ),
    path = `/clubs/${club}/book-files/${bookId}`,
    input = {
      filename: 'demonstracao.epub',
      source: 'Texto original de demonstração do aplicativo',
      license: 'Leitura e distribuição autorizadas com o aplicativo',
      authorized: true,
      data: bytes.toString('base64'),
    }
  expect((await call(path, 'file-member', 'POST', input)).statusCode).toBe(403)
  expect((await call(path, undefined, 'POST', { ...input, authorized: false })).statusCode).toBe(
    400,
  )
  const upload = await call(path, undefined, 'POST', input)
  expect(upload.statusCode, upload.body).toBe(201)
  const id = upload.json().id
  const list = await call(path, 'file-member')
  expect(list.statusCode).toBe(200)
  expect(list.body).not.toMatch(/object_key|club-epub/)
  expect(list.json().items[0].license).toBe(input.license)
  const download = await call(`/club-files/${id}/content`, 'file-member')
  expect(download.statusCode, download.body).toBe(200)
  expect(download.rawPayload.equals(bytes)).toBe(true)
  expect((await call(`/me/files/${id}/content`, 'file-member')).statusCode).toBe(404)
  expect((await call(`/clubs/${other}/book-files/${bookId}`)).statusCode).toBe(404)
  await call(`/clubs/${club}/members/${member}`, undefined, 'DELETE')
  expect((await call(`/club-files/${id}/content`, 'file-member')).statusCode).toBe(403)
  const workspace = (await call(`/clubs/${club}/workspace`)).json()
  expect(
    (
      await call(`/clubs/${club}/workspace`, undefined, 'POST', {
        version: workspace.version,
        action: { type: 'book.remove', id: bookId },
      })
    ).statusCode,
  ).toBe(200)
  expect((await call(`/club-files/${id}/content`)).statusCode).toBe(404)
  expect(
    (await db.pool.query('SELECT state FROM club_book_files WHERE id=$1', [id])).rows[0].state,
  ).toBe('deleted')
})
