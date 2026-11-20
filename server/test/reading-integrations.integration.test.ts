import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { buildApp } from '../src/app.js'
import { testDatabase } from './database.js'

const base = '/me/reading-integrations'
const fixture = {
  mimetype: strToU8('application/epub+zip'),
  'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>'),
  'book.opf': strToU8('<package><metadata/><manifest><item id="text" href="text.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="text"/></spine></package>'),
  'text.xhtml': strToU8('<html><body><p>Texto original de teste.</p></body></html>'),
}
const epub = Buffer.from(zipSync(fixture))
const clipping = 'Livro sintético (Ana Silva)\n- Your Highlight at location 21-22 | Added on November 18, 2026\n\nTrecho original privado.\n==========\n'

it('protege exportação, progresso e anotações, preserva posição e exige associação para publicar no clube', async () => {
  const db = await testDatabase()
  const objects = new Map<string, Buffer>()
  const app = await buildApp({
    pool: db.pool, origin: 'https://club.example', rateMax: 500,
    verifyToken: async (uid) => ({ uid, name: uid, email: uid + '@example.invalid', emailVerified: uid !== 'unverified' }),
    storage: {
      put: async (key, bytes) => { objects.set(key, bytes) },
      get: async (key) => { if (!objects.has(key)) throw Error('Objeto ausente'); return objects.get(key)! },
      remove: async (key) => { objects.delete(key) },
    },
  })
  const call = (path: string, method: 'GET' | 'POST' | 'DELETE' = 'GET', payload?: object, user: string | null = 'owner') =>
    app.inject({ url: '/v1' + path, method, payload, headers: user ? { authorization: 'Bearer ' + user, origin: 'https://club.example' } : {} })
  const check = async (result: ReturnType<typeof call>, status: number) => {
    const value = await result
    expect(value.statusCode, value.statusCode >= 400 ? value.body : undefined).toBe(status)
    return value
  }
  try {
    const initial = (await check(call('/me/workspace'), 200)).json()
    const added = (await check(call('/me/workspace', 'POST', {
      version: initial.version, action: { type: 'book.add', title: 'Livro sintético', author: 'Ana Silva', category: '', content: 'Texto original de teste.' },
    }), 200)).json()
    const id = added.state.books[0].id
    const path = base + '/kindle/books/' + id
    const internal = (await check(call('/me/workspace', 'POST', {
      version: added.version, action: { type: 'reading.update', id, percent: 42, page: 3, locator: 12, epubLocator: { hash: 'a'.repeat(64), chapter: 4, offset: 516 } },
    }), 200)).json().reading[id]

    const upload = (await check(call('/me/book-files/' + id, 'POST', { filename: 'original.epub', data: epub.toString('base64') }), 201)).json()
    const file = { fileId: upload.id }
    await check(call(path + '/exports', 'POST', file, null), 401)
    await check(call(path + '/exports', 'POST', file, 'unverified'), 403)
    await check(call(path + '/exports', 'POST', file, 'visitor'), 404)
    await check(call(path + '/exports', 'POST', file), 403)
    await check(call(path + '/permission', 'POST', { ...file, permission: 'personal' }, 'visitor'), 404)
    await check(call(path + '/permission', 'POST', { ...file, permission: 'personal' }), 204)
    const prepared = await check(call(path + '/exports', 'POST', file), 200)
    expect(prepared.rawPayload.equals(epub)).toBe(true)
    expect(prepared.headers['cache-control']).toBe('no-store')
    expect(prepared.headers['access-control-expose-headers']).toContain('X-Reading-Export-Id')
    const receipt = '/exports/' + prepared.headers['x-reading-export-id']
    await check(call(path + receipt, 'POST', { status: 'delivered' }), 400)
    await check(call(path + receipt, 'POST', { status: 'share_requested' }, 'visitor'), 404)
    await check(call(path + receipt, 'POST', { status: 'download_started' }), 204)
    const key = [...objects.keys()][0]
    objects.delete(key)
    await check(call(path + '/exports', 'POST', file), 503)
    const padded = Buffer.alloc(epub.length, 1)
    objects.set(key, padded)
    await check(call(path + '/exports', 'POST', file), 400)
    objects.set(key, epub)
    const history = (await check(call(path + '/exports'), 200)).json().history
    expect(history.map((item: { status: string }) => item.status)).toEqual(['preparation_failed', 'preparation_failed', 'download_started'])
    await check(call(path + '/permission', 'POST', { ...file, permission: 'blocked' }), 204)
    await check(call(path + '/exports', 'POST', file), 403)
    const otherBook = randomUUID()
    await check(call(base + '/kindle/books/' + otherBook + '/exports', 'POST', file), 404)

    const progress = { percentage: 65, chapter: 'Capítulo 8', observation: 'Observação sigilosa', readingDate: '2026-11-18', includeInSummary: true, revision: 0 }
    await check(call(path + '/progress', 'POST', { ...progress, percentage: 101 }), 400)
    await check(call(path + '/progress', 'POST', progress, 'visitor'), 404)
    expect((await check(call(path + '/progress', 'POST', progress), 200)).json()).toMatchObject({ percentage: 65, revision: 1, source: 'manual' })
    const concurrent = await Promise.all([71, 73].map((percentage) => call(path + '/progress', 'POST', { ...progress, percentage, revision: 1 })))
    expect(concurrent.map((response) => response.statusCode).sort()).toEqual([200, 409])
    expect((await check(call(base), 200)).json()).toMatchObject([{ revision: 2 }])
    expect((await check(call(base, 'GET', undefined, 'visitor'), 200)).json()).toEqual([])
    expect((await check(call('/me/workspace'), 200)).json().reading[id]).toEqual(internal)

    const txt = { filename: 'My Clippings.txt', mime: 'text/plain', data: Buffer.from(clipping + clipping).toString('base64') }
    const preview = base + '/kindle/annotations/preview'
    await check(call(preview, 'POST', txt, null), 401)
    await check(call(preview, 'POST', { ...txt, filename: 'notas.html' }), 400)
    await check(call(preview, 'POST', { ...txt, mime: 'text/html' }), 400)
    await check(call(preview, 'POST', { ...txt, data: Buffer.alloc(300_000, 32).toString('base64') }), 413)
    expect((await check(call(preview, 'POST', txt), 200)).json()).toMatchObject({ groups: [{ suggestedBookId: id }] })
    expect((await check(call(preview, 'POST', txt, 'visitor'), 200)).json()).toMatchObject({ groups: [{ suggestedBookId: null }] })
    const payload = { ...txt, sourceBook: 'Livro sintético (Ana Silva)', selected: [0, 1] }
    await check(call(path + '/annotations', 'POST', payload, 'visitor'), 404)
    await check(call(path + '/annotations', 'POST', { ...payload, selected: [9] }), 400)
    expect((await check(call(path + '/annotations', 'POST', payload), 200)).json()).toMatchObject({ imported: 1, duplicates: 1 })
    expect((await check(call(path + '/annotations', 'POST', payload), 200)).json()).toMatchObject({ imported: 0, duplicates: 2 })
    const notes = (await check(call(path + '/annotations'), 200)).json()
    const note = path + '/annotations/' + notes[0].id
    await check(call(note, 'POST', { note: 'Observação editável' }), 204)
    await check(call(note, 'DELETE', undefined, 'visitor'), 404)
    await check(call(path + '/annotations', 'GET', undefined, 'visitor'), 404)

    const club = (await check(call('/clubs', 'POST', { name: 'Clube privado de teste' }), 201)).json().id
    const reflection = { kind: 'reflection', bookTitle: 'Livro sintético', bookAuthor: 'Ana Silva', body: 'Reflexão escrita pelo leitor' }
    expect([403, 404]).toContain((await call('/clubs/' + club + '/posts', 'POST', reflection, 'visitor')).statusCode)
    const published = (await check(call('/clubs/' + club + '/posts', 'POST', reflection), 201)).json()
    const post = (await check(call('/clubs/' + club + '/posts/' + published.id), 200)).json()
    expect(post.body).toBe(reflection.body)
    expect(JSON.stringify(post)).not.toContain('Trecho original privado')
    expect(JSON.stringify(post)).not.toContain('Observação sigilosa')
    await check(call(note, 'DELETE'), 204)
    await check(call(path + '/progress?revision=2', 'DELETE'), 204)
    await check(call(path + '/annotations', 'POST', payload), 200)
    await check(call(path + '/progress', 'POST', progress), 200)
    const current = (await check(call('/me/workspace'), 200)).json()
    await check(call('/me/workspace', 'POST', { version: current.version, action: { type: 'book.remove', id } }), 200)
    for (const table of ['external_reading_progress', 'reading_export_attempts', 'imported_reading_annotations']) {
      expect((await db.pool.query(`SELECT 1 FROM ${table} WHERE book_id=$1`, [id])).rowCount).toBe(0)
    }
  } finally {
    await app.close()
    await db.close()
  }
})
