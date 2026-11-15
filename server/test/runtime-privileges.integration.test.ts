import { it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { testDatabase } from './database.js'
import { buildApp } from '../src/app.js'
import sharp from 'sharp'
import { zipSync, strToU8 } from 'fflate'
it('executa os fluxos essenciais com o papel restrito, sem DDL, migrations ou alteração da auditoria', async () => {
  const db = await testDatabase(),
    role = 'clube_runtime_test_' + randomUUID().replaceAll('-', ''),
    schema = (await db.pool.query('SELECT current_schema() AS name')).rows[0].name
  let runtime: Pool | undefined, app: Awaited<ReturnType<typeof buildApp>> | undefined
  const objects = new Map<string, Buffer>()
  try {
    await db.pool.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`)
    // Reproduz a regra herdada que concedia CRUD a todas as tabelas, inclusive futuras.
    await db.pool.query(
      `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${role}`,
    )
    await db.pool.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO ${role}`,
    )
    await db.pool.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT SELECT,USAGE ON SEQUENCES TO ${role}`,
    )
    const grants = (
      await readFile(new URL('../ops/runtime-grants.sql', import.meta.url), 'utf8')
    ).replaceAll('clube_runtime', role)
    await db.pool.query(grants)
    await db.pool.query('CREATE TABLE future_grant_probe(id int)')
    expect(
      (
        await db.pool.query(
          "SELECT has_table_privilege($1,'future_grant_probe','SELECT') AS allowed",
          [role],
        )
      ).rows[0].allowed,
    ).toBe(false)
    await db.pool.query('DROP TABLE future_grant_probe')
    runtime = new Pool({
      connectionString: db.pool.options.connectionString,
      options: `-c search_path=${schema} -c role=${role}`,
    })
    app = await buildApp({
      pool: runtime,
      storage: {
        put: async (key, bytes) => {
          objects.set(key, bytes)
        },
        get: async (key) => {
          if (!objects.has(key)) throw Error('missing')
          return objects.get(key)!
        },
        remove: async (key) => {
          objects.delete(key)
        },
      },
      origin: 'https://club.example',
      verifyToken: async (uid) => ({
        uid,
        email: uid + '@example.com',
        name: uid,
        emailVerified: true,
      }),
    })
    const headers = { authorization: 'Bearer restricted-user' }
    const call = (path: string, method = 'GET', payload?: Record<string, unknown>) =>
      app!.inject({
        url: '/v1' + path,
        headers,
        method: method as 'GET' | 'POST' | 'DELETE',
        payload,
      })
    const session = await call('/me')
    expect(session.statusCode, session.body).toBe(200)
    const club = await call('/clubs', 'POST', { name: 'Papel restrito' })
    expect(club.statusCode, club.body).toBe(201)
    const post = await call(`/clubs/${club.json().id}/posts`, 'POST', {
      kind: 'reflection',
      body: 'Persistência com papel restrito',
    })
    expect(post.statusCode, post.body).toBe(201)
    expect(
      (await call(`/clubs/${club.json().id}/posts/${post.json().id}/like`, 'POST', { value: true }))
        .statusCode,
    ).toBe(200)
    expect(
      (
        await call(`/clubs/${club.json().id}/posts/${post.json().id}/like`, 'POST', {
          value: false,
        })
      ).statusCode,
    ).toBe(200)
    const profile = await call('/me/profile')
    expect(profile.statusCode, profile.body).toBe(200)
    expect((await call('/me/notifications')).statusCode).toBe(200)
    const appearance = {
      preset: 'azul',
      mode: 'dark',
      accent: null,
      headingFont: 'lora',
      bodyFont: 'inter',
      radius: 'soft',
    }
    const saved = await call('/me/appearance', 'POST', { appearance })
    expect(saved.statusCode, saved.body).toBe(200)
    expect((await call('/me/appearance')).json()).toEqual({ appearance })
    const image = (
      await sharp({
        create: { width: 8, height: 8, channels: 3, background: '#462b70' },
      })
        .png()
        .toBuffer()
    ).toString('base64')
    const workspace = (await call('/me/workspace')).json()
    const bookAdded = await call('/me/workspace', 'POST', {
      version: workspace.version,
      action: {
        type: 'book.add',
        title: 'EPUB restrito',
        author: 'Teste',
        category: '',
        content: 'Leitura privada',
      },
    })
    expect(bookAdded.statusCode, bookAdded.body).toBe(200)
    const bookId = bookAdded.json().state.books[0].id
    const epub = zipSync({
      mimetype: strToU8('application/epub+zip'),
      'META-INF/container.xml': strToU8(
        '<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>',
      ),
      'book.opf': strToU8(
        '<package><metadata/><manifest><item id="text" href="text.xhtml" media-type="application/xhtml+xml"/><item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/></manifest><spine><itemref idref="text"/></spine></package>',
      ),
      'text.xhtml': strToU8('<html><body><p>Leitura privada</p></body></html>'),
      'cover.png': Buffer.from(image, 'base64'),
    })
    const epubUpload = await call(`/me/book-files/${bookId}`, 'POST', {
      filename: 'restrito.epub',
      data: Buffer.from(epub).toString('base64'),
    })
    expect(epubUpload.statusCode, epubUpload.body).toBe(201)
    const epubCover = await call(`/me/book-files/${bookId}/cover`)
    expect(epubCover.statusCode, epubCover.body).toBe(200)
    expect(epubCover.headers['content-type']).toContain('image/jpeg')
    const reader = {
      size: 24,
      font: 'lora',
      theme: 'sepia',
      margin: 'wide',
      lineHeight: 'relaxed',
      weight: 'bold',
      align: 'justify',
      flow: 'paged',
    }
    const readerSaved = await call('/me/workspace', 'POST', {
      version: bookAdded.json().version,
      action: { type: 'reader.preferences', reader },
    })
    expect(readerSaved.statusCode, readerSaved.body).toBe(200)
    expect((await call('/me/workspace')).json().preferences.reader).toEqual(reader)
    const first = await call('/me/avatar', 'POST', { data: image })
    expect(first.statusCode, first.body).toBe(201)
    const second = await call('/me/avatar', 'POST', { data: image })
    expect(second.statusCode, second.body).toBe(201)
    expect((await call(`/public/media/${second.json().avatarId}/content`)).statusCode).toBe(200)
    expect((await call(`/public/media/${first.json().avatarId}/content`)).statusCode).toBe(404)
    expect(
      (await runtime.query('SELECT state FROM media_objects WHERE id=$1', [first.json().avatarId]))
        .rows[0].state,
    ).toBe('purged')
    const person = await call(`/people/${session.json().user.id}`)
    expect(person.statusCode, person.body).toBe(200)
    expect(person.json().avatarId).toBe(second.json().avatarId)
    const shared = await call(`/people/${session.json().user.id}/club-posts`)
    expect(shared.statusCode, shared.body).toBe(200)
    expect(shared.json().items.map((item: { id: string }) => item.id)).toContain(post.json().id)
    expect((await call('/me/avatar', 'DELETE')).json()).toEqual({
      avatarId: null,
    })
    expect((await call(`/people/${session.json().user.id}`)).json().avatarId).toBeNull()
    const album = await call(`/clubs/${club.json().id}/albums`, 'POST', {
      title: 'Capa restrita',
      eventDate: '2026-11-14',
      allowPublicShare: true,
    })
    expect(album.statusCode, album.body).toBe(201)
    const media = await call(`/clubs/${club.json().id}/media`, 'POST', {
      kind: 'image',
      data: image,
    })
    expect(media.statusCode, media.body).toBe(201)
    const added = await call(`/clubs/${club.json().id}/albums/${album.json().id}/photos`, 'POST', {
      mediaIds: [media.json().id],
      caption: 'Capa local',
    })
    expect(added.statusCode, added.body).toBe(201)
    const cover = await call(`/clubs/${club.json().id}/albums/${album.json().id}/cover`, 'POST', {
      mediaId: media.json().id,
      version: 0,
    })
    expect(cover.statusCode, cover.body).toBe(200)
    const albumRead = await call(`/clubs/${club.json().id}/albums/${album.json().id}`)
    expect(albumRead.json().coverMediaId).toBe(media.json().id)
    expect(albumRead.json().covers[0].id).toBe(media.json().id)
    const { id: profileId, suspended, ...publicSettings } = (await call('/me/profile')).json()
    const madePublic = await call('/me/profile', 'POST', {
      ...publicSettings,
      isPublic: true,
    })
    expect(madePublic.statusCode, madePublic.body).toBe(200)
    const sharedCopy = await call(
      `/clubs/${club.json().id}/albums/${album.json().id}/photos/${media.json().id}/publish-public`,
      'POST',
      { body: 'Cópia sintética autorizada', authorized: true },
    )
    expect(sharedCopy.statusCode, sharedCopy.body).toBe(201)
    expect((await call(`/public/posts/${sharedCopy.json().id}`)).json().media[0].id).not.toBe(
      media.json().id,
    )
    await expect(runtime.query('SELECT * FROM schema_migrations')).rejects.toThrow(
      'permission denied',
    )
    await expect(runtime.query('CREATE TABLE forbidden(id int)')).rejects.toThrow(
      'permission denied',
    )
    await expect(runtime.query("UPDATE audit_logs SET action='tampered'")).rejects.toThrow(
      'permission denied',
    )
    await expect(runtime.query('DELETE FROM users')).rejects.toThrow('permission denied')
    for (const table of [
      'clubs',
      'club_memberships',
      'invites',
      'invite_acceptances',
      'personal_workspaces',
      'club_workspaces',
      'club_reading_states',
    ])
      await expect(runtime.query(`DELETE FROM ${table} WHERE false`)).rejects.toThrow(
        'permission denied',
      )
    await expect(
      runtime.query('UPDATE invite_acceptances SET accepted_at=now() WHERE false'),
    ).rejects.toThrow('permission denied')
    for (const table of ['album_media', 'post_media', 'post_likes', 'follows'])
      expect(
        (
          await db.pool.query("SELECT has_table_privilege($1,$2,'UPDATE') AS allowed", [
            role,
            table,
          ])
        ).rows[0].allowed,
      ).toBe(false)
    for (const table of ['club_albums', 'social_posts', 'profiles', 'media_objects', 'club_events'])
      await expect(runtime.query(`DELETE FROM ${table} WHERE false`)).rejects.toThrow(
        'permission denied',
      )
    await expect(runtime.query('TRUNCATE users')).rejects.toThrow('permission denied')
  } finally {
    await app?.close()
    await runtime?.end()
    await db.pool.query(`DROP OWNED BY ${role}`)
    await db.pool.query(`DROP ROLE ${role}`)
    await db.close()
  }
})
