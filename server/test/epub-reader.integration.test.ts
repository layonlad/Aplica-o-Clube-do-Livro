import { beforeAll, afterAll, it, expect } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import sharp from 'sharp'
import { testDatabase } from './database.js'
import { buildApp } from '../src/app.js'
let db: Awaited<ReturnType<typeof testDatabase>>, app: Awaited<ReturnType<typeof buildApp>>
const objects = new Map<string, Buffer>()
const request = (
  url: string,
  uid = 'epub-owner',
  method = 'GET',
  payload?: Record<string, unknown>,
) =>
  app.inject({
    url: '/v1' + url,
    method: method as 'GET' | 'POST' | 'DELETE',
    headers: { authorization: 'Bearer ' + uid },
    payload,
  })
beforeAll(async () => {
  db = await testDatabase()
  app = await buildApp({
    pool: db.pool,
    origin: 'https://club.example',
    rateMax: 1000,
    verifyToken: async (uid) => ({
      uid,
      email: uid + '@example.com',
      emailVerified: true,
      name: uid,
    }),
    storage: {
      put: async (key, bytes) => {
        objects.set(key, bytes)
      },
      get: async (key) => objects.get(key)!,
      remove: async (key) => {
        objects.delete(key)
      },
    },
  })
})
afterAll(async () => {
  await app?.close()
  await db?.close()
})
it('guarda EPUB com fontes ofuscadas e capa, entrega a capa apenas ao titular e revoga o acesso após remover', async () => {
  const initial = (await request('/me/workspace')).json()
  const added = await request('/me/workspace', undefined, 'POST', {
    version: initial.version,
    action: {
      type: 'book.add',
      title: 'Livro privado sintético',
      author: 'Autora de teste',
      category: '',
      content: 'Texto privado.',
      metadata: { source: 'EPUB importado' },
    },
  })
  expect(added.statusCode, added.body).toBe(200)
  const book = added.json().state.books[0]
  const png = await sharp({
    create: { width: 90, height: 140, channels: 3, background: '#462b70' },
  })
    .png()
    .toBuffer()
  const data = Buffer.from(
    zipSync({
      mimetype: strToU8('application/epub+zip'),
      'META-INF/container.xml': strToU8(
        '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>',
      ),
      'OPS/book.opf': strToU8(
        '<package><metadata/><manifest><item id="body" href="body.xhtml" media-type="application/xhtml+xml"/><item id="font" href="font.otf" media-type="font/otf"/><item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/></manifest><spine><itemref idref="body"/></spine></package>',
      ),
      'META-INF/encryption.xml': strToU8(
        '<encryption><EncryptedData><EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/><CipherData><CipherReference URI="OPS/font.otf"/></CipherData></EncryptedData></encryption>',
      ),
      'OPS/font.otf': new Uint8Array([1, 2, 3]),
      'OPS/body.xhtml': strToU8('<html><body><p>Leitura reservada ao titular.</p></body></html>'),
      'OPS/cover.png': png,
    }),
  )
  const upload = await request(`/me/book-files/${book.id}`, undefined, 'POST', {
    filename: 'sintetico.epub',
    data: data.toString('base64'),
  })
  expect(upload.statusCode, upload.body).toBe(201)
  const path = `/me/book-files/${book.id}/cover`,
    cover = await request(path)
  expect(cover.statusCode, cover.body).toBe(200)
  expect(cover.headers['content-type']).toContain('image/jpeg')
  expect(cover.headers['cache-control']).toContain('no-store')
  expect((await sharp(cover.rawPayload).metadata()).width).toBe(90)
  expect((await app.inject({ url: '/v1' + path })).statusCode).toBe(401)
  expect((await request(path, 'epub-stranger')).statusCode).toBe(404)
  expect((await request('/me/files/' + upload.json().id, undefined, 'DELETE')).statusCode).toBe(200)
  expect((await request(path)).statusCode).toBe(404)
})
it('sincroniza os controles de leitura e preserva as escolhas antigas', async () => {
  const initial = (await request('/me/workspace')).json()
  const reader = {
    size: 24,
    font: 'merriweather',
    theme: 'sepia',
    margin: 'wide',
    lineHeight: 'relaxed',
    weight: 'bold',
    align: 'justify',
    flow: 'paged',
  }
  const saved = await request('/me/workspace', undefined, 'POST', {
    version: initial.version,
    action: { type: 'reader.preferences', reader },
  })
  expect(saved.statusCode, saved.body).toBe(200)
  expect((await request('/me/workspace')).json().preferences.reader).toEqual(reader)
  const current = saved.json()
  const legacy = {
    size: 20,
    font: 'serif',
    theme: 'light',
    margin: 'comfortable',
  }
  expect(
    (
      await request('/me/workspace', undefined, 'POST', {
        version: current.version,
        action: { type: 'reader.preferences', reader: legacy },
      })
    ).statusCode,
  ).toBe(200)
  expect((await request('/me/workspace')).json().preferences.reader).toMatchObject(legacy)
})
