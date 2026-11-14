import { it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { testDatabase } from './database.js'
import { buildApp } from '../src/app.js'
import { PrivateFiles } from '../src/private-files.js'
import { maintain } from '../src/maintenance.js'
it('retém tombstone após PUT com falha, limpa escrita tardia e repete a limpeza sem reabrir acesso', async () => {
  const db = await testDatabase(),
    objects = new Map<string, Uint8Array>()
  const storage = {
    put: async () => {
      throw Error('provider timeout')
    },
    get: async (key: string) => objects.get(key)!,
    remove: async (key: string) => {
      objects.delete(key)
    },
  }
  const app = await buildApp({
    pool: db.pool,
    origin: 'https://club.example',
    verifyToken: async (uid) => ({
      uid,
      email: 'test@example.com',
      name: 'Teste',
      emailVerified: true,
    }),
    storage,
  })
  try {
    const headers = { authorization: 'Bearer maintenance-owner' },
      user = (await app.inject({ url: '/v1/me', headers })).json().user,
      workspace = (await app.inject({ url: '/v1/me/workspace', headers })).json()
    const added = await app.inject({
      url: '/v1/me/workspace',
      method: 'POST',
      headers,
      payload: {
        version: workspace.version,
        action: {
          type: 'book.add',
          title: 'Livro particular',
          author: 'Autora',
          category: '',
          content: '',
        },
      },
    })
    expect(added.statusCode).toBe(200)
    const bookId = added.json().state.books[0].id
    const files = new PrivateFiles(db.pool, storage),
      bytes = await readFile(
        new URL('../../public/books/a-cadeira-perto-da-janela.epub', import.meta.url),
      )
    await expect(files.upload(user.id, bookId, 'local.epub', bytes)).rejects.toThrow(
      'envio não foi concluído',
    )
    const row = (
      await db.pool.query(
        'SELECT id,object_key,state,purge_after>now() AS delayed FROM private_book_files WHERE book_id=$1',
        [bookId],
      )
    ).rows[0]
    expect(row).toMatchObject({ state: 'deleted', delayed: true })
    objects.set(row.object_key, bytes) // The provider completes a timed-out request later.
    expect(await files.cleanup()).toEqual({ purged: 0, failed: 0 })
    await expect(files.download(user.id, row.id)).rejects.toThrow('não encontrado')
    await db.pool.query(
      "UPDATE private_book_files SET purge_after=now()-interval '1 second' WHERE id=$1",
      [row.id],
    )
    expect(await files.cleanup()).toEqual({ purged: 1, failed: 0 })
    expect(objects.size).toBe(0)
    objects.set(row.object_key, bytes)
    await db.pool.query(
      "UPDATE private_book_files SET last_purge_at=now()-interval '2 days' WHERE id=$1",
      [row.id],
    )
    expect(await files.cleanup()).toEqual({ purged: 1, failed: 0 })
    expect(objects.size).toBe(0)
  } finally {
    await app.close()
    await db.close()
  }
})
it('remove avisos vencidos em lote sem alterar a auditoria administrativa', async () => {
  const db = await testDatabase(),
    app = await buildApp({
      pool: db.pool,
      origin: 'https://club.example',
      verifyToken: async (uid) => ({
        uid,
        email: uid + '@example.com',
        name: uid,
        emailVerified: true,
      }),
    })
  try {
    const headers = { authorization: 'Bearer retention-owner' },
      user = (await app.inject({ url: '/v1/me', headers })).json().user,
      club = (
        await app.inject({
          url: '/v1/clubs',
          method: 'POST',
          headers,
          payload: { name: 'Retenção local' },
        })
      ).json()
    await db.pool.query(
      "INSERT INTO notifications(recipient_id,actor_id,club_id,kind,target_type,target_id,category,dedupe_key,created_at) VALUES($1,$1,$2,'event_reminder','event',gen_random_uuid(),'events','expired',now()-interval '91 days')",
      [user.id, club.id],
    )
    const count = (await db.pool.query('SELECT count(*)::int AS count FROM audit_logs')).rows[0]
      .count
    expect(await maintain(db.pool)).toMatchObject({ notifications: 1 })
    expect(
      (await db.pool.query('SELECT count(*)::int AS count FROM audit_logs')).rows[0].count,
    ).toBe(count)
    await expect(db.pool.query("UPDATE audit_logs SET action='tampered'")).rejects.toThrow(
      'append-only',
    )
  } finally {
    await app.close()
    await db.close()
  }
})
