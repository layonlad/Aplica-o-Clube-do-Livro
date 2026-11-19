import { randomBytes, randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { buildApp } from '../src/app.js'
import { openEpubPackage } from '../src/epub-package.js'
import { testDatabase } from './database.js'

const actor = 'literary-test-reader'
const base = '/v1/me/literary'
const cartomante = 'a-cartomante-1896-pt'
const example = (seed: string, day: number) => `<item><title>Feira do livro: ${seed}</title><link>https://agenciabrasil.ebc.com.br/cultura/noticia/feira-${seed}</link><pubDate>${new Date(Date.now() - day * 86400_000).toUTCString()}</pubDate></item>`

it('preserva a licença e a edição na biblioteca, reusa o arquivo e salva progresso pessoal', async () => {
  const db = await testDatabase()
  const app = await buildApp({ pool: db.pool, origin: 'https://app.example',
    verifyToken: async uid => ({ uid, email: uid + '@example.invalid', name: uid, emailVerified: true }),
  })
  try {
    const headers = { authorization: 'Bearer ' + actor }
    const path = base + '/books/' + cartomante
    expect((await app.inject(path + '/epub')).statusCode).toBe(401)
    const [one, two] = await Promise.all([1,2].map(() => app.inject({ url: path, headers, method: 'POST' })))
    expect([one.statusCode, two.statusCode].sort()).toEqual([200, 201])
    expect(one.json().bookId).toBe(two.json().bookId)
    const cover = await app.inject(`/v1/literary/free/${cartomante}/cover`)
    expect(cover.statusCode).toBe(200)
    expect(cover.headers['content-type']).toContain('image/jpeg')
    expect(cover.headers['cross-origin-resource-policy']).toBe('cross-origin')
    const epub = await app.inject({ url: path + '/epub', headers })
    expect(epub.headers['content-type']).toContain('application/epub+zip')
    expect(epub.headers['cache-control']).toContain('no-store')
    expect(openEpubPackage(epub.rawPayload).files.has('OPS/story.xhtml')).toBe(true)
    expect((await app.inject({ url: base + '/books/gutenberg-55752/epub', headers })).statusCode).toBe(404)
    const snapshot = (await app.inject({ url:'/v1/me/workspace', headers })).json()
    expect(snapshot.state.books).toHaveLength(1)
    expect(snapshot.state.books[0].metadata).toMatchObject({ literaryEditionId: cartomante, literaryWorkId: 'machado-a-cartomante' })
    const id = one.json().bookId
    const exportPath = '/v1/me/reading-integrations/kindle/books/' + id
    const original = await app.inject({ url: exportPath + '/exports', headers })
    expect(original.json().file).toMatchObject({ id, editionId: cartomante, permission: 'public_domain' })
    const transfer = await app.inject({ url: exportPath + '/exports', method:'POST', headers, payload:{fileId:id} })
    expect(transfer.statusCode).toBe(200)
    expect(transfer.rawPayload.equals(epub.rawPayload)).toBe(true)
    expect((await app.inject({ url: exportPath + '/permission', method:'POST', headers, payload:{fileId:id,permission:'personal'} })).statusCode).toBe(404)
    expect((await app.inject({ url: exportPath + '/exports', headers:{authorization:'Bearer other-reader'} })).statusCode).toBe(404)
    const external = await app.inject({ url: base + '/books/gutenberg-55752', headers, method:'POST' })
    const externalId = external.json().bookId
    const externalTransfer = await app.inject({ url:'/v1/me/reading-integrations/kindle/books/'+externalId+'/exports',
      method:'POST',headers,payload:{fileId:externalId} })
    expect(externalTransfer.statusCode).toBe(404)
    const nextSnapshot = (await app.inject({ url:'/v1/me/workspace', headers })).json()
    const saved = await app.inject({ url:'/v1/me/workspace', headers, method:'POST', payload:{
      version: nextSnapshot.version, action: { type:'reading.update', id, percent: 47, favorite: true, status: 'reading' },
    } })
    expect(saved.json().reading[id]).toMatchObject({ percent:47, favorite:true })
    expect((await app.inject({ url:'/v1/me/book-files/' + id, headers })).json().items).toEqual([])
    const other = await app.inject({ url:'/v1/me/workspace', headers:{ authorization:'Bearer other-reader' } })
    expect(other.json().state.books).toEqual([])
  } finally { await app.close(); await db.close() }
})

it('deduplica feeds, pagina e integra notícias com curtida, comentário, salvo, debate e permissão de clube', async () => {
  const db = await testDatabase(), headers = { authorization: 'Bearer ' + actor }
  const maintenanceToken = randomBytes(32).toString('base64url')
  const app = await buildApp({ pool: db.pool, origin: 'https://app.example',
    verifyToken: async uid => ({ uid, email: uid + '@example.invalid', name: uid, emailVerified: true }),
    storage: { put: async () => {}, get: async () => Buffer.alloc(0), remove: async () => {} },
    photoCleanupToken: maintenanceToken,
    literaryNewsSync: true,
  })
  const request = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    if (String(url).includes('/radioagencia')) return new Response('interrompido', {status:503})
    return new Response(`<rss><channel><title>Teste</title>${example('a',0)}${example('a',0)}${example('b',1)}</channel></rss>`)
  })
  try {
    const maintenance = { method: 'POST', url: '/internal/photo-cleanup' } as const
    expect((await app.inject(maintenance)).statusCode).toBe(401)
    expect(request).not.toHaveBeenCalled()
    const run = () => app.inject({ ...maintenance, headers: { authorization: 'Bearer ' + maintenanceToken } })
    const collected = await run()
    expect(collected.statusCode).toBe(200)
    expect(collected.json().literaryNews).toEqual({ inserted:2, failedSources:1, skipped:false })
    expect((await run()).json().literaryNews.skipped).toBe(true)
    expect(request).toHaveBeenCalledTimes(2)
    const list = (await app.inject('/v1/literary/news?limit=1')).json()
    expect(list.items).toHaveLength(1)
    expect(list.nextCursor).toBeTruthy()
    const item = list.items[0]
    const next = (await app.inject('/v1/literary/news?limit=1&cursor=' + encodeURIComponent(list.nextCursor))).json()
    expect(next.items[0].id).not.toBe(item.id)
    expect(next.items[0].imageUrl).toBeNull()
    const source = '/v1/public/posts/' + item.postId
    const details = (await app.inject(source)).json()
    expect(details.body).toBe(item.title)
    expect((await app.inject('/v1/public/posts')).json().items).toEqual([])
    const current = (await app.inject({url:'/v1/me/profile', headers})).json()
    const { id: _, suspended: _s, ...profile } = current
    expect((await app.inject({ url:'/v1/me/profile', headers, method:'POST', payload:{...profile, isPublic:true} })).statusCode).toBe(200)
    for (const action of ['like', 'save']) {
      expect((await app.inject({ url:source + '/' + action, headers, method:'POST', payload:{value:true} })).statusCode).toBe(200)
    }
    const reaction = (await app.inject({ url:source, headers })).json()
    expect(reaction).toMatchObject({ liked:true, saved:true })
    expect((await app.inject({ url:'/v1/public/posts?saved=1', headers })).json().items[0].id).toBe(item.postId)
    const comment = await app.inject({url:source+'/comments', headers, method:'POST', payload:{body:'Discussão de teste'} })
    expect(comment.statusCode).toBe(201)
    expect((await app.inject({url:source+'/comments',headers})).json().items).toHaveLength(1)
    const share = base+'/news/'+item.id+'/share'
    const club = (await app.inject({url:'/v1/clubs', headers, method:'POST', payload:{name:'Grupo de ensaio'} })).json()
    const outside = await app.inject({url:share, headers:{authorization:'Bearer outsider'}, method:'POST', payload:{clubId:club.id}})
    expect(outside.statusCode).toBe(404)
    const requestId = randomUUID()
    const result = await app.inject({url:share, headers, method:'POST', payload:{clubId:club.id,clientRequestId:requestId}})
    expect(result.statusCode).toBe(201)
    const again = await app.inject({url:share, headers, method:'POST', payload:{clubId:club.id,clientRequestId:requestId}})
    expect(again.json().id).toBe(result.json().id)
    const createdDebate = await app.inject({url:share, headers, method:'POST', payload:{debate:true}})
    expect(createdDebate.statusCode, createdDebate.body).toBe(201)
    const debate = (await app.inject({url:'/v1/public/posts/' + createdDebate.json().id, headers})).json()
    expect(debate.kind).toBe('question')
    for (const input of [{kind:'topic',key:'feiras'}, {kind:'debate',key:debate.id}]) {
      const response = await app.inject({url:base+'/follows',headers,method:'POST',payload:{...input,value:true}})
      expect(response.statusCode,response.body).toBe(200)
    }
    expect((await app.inject({url:base+'/follows',headers})).json()).toEqual({ topics:['feiras'], debates:[debate.id] })
    const watching = await app.inject({ url:'/v1/public/posts?kind=question&watching=1', headers })
    expect(watching.json().items.map((value: {id:string}) => value.id)).toEqual([debate.id])
    const rec = await app.inject({ url:base+'/recommendations', headers })
    expect(rec.statusCode,rec.body).toBe(200)
    expect(rec.json().news).toHaveLength(2)
  } finally {
    request.mockRestore()
    await app.close()
    await db.close()
  }
})
