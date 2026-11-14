import { it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { testDatabase } from './database.js'
import { buildApp } from '../src/app.js'
import sharp from 'sharp'
it('executa os fluxos essenciais com o papel restrito, sem DDL, migrations ou alteração da auditoria', async () => {
  const db = await testDatabase(),
    role = 'clube_runtime_test_' + randomUUID().replaceAll('-', ''),
    schema = (await db.pool.query('SELECT current_schema() AS name')).rows[0].name
  let runtime: Pool | undefined, app: Awaited<ReturnType<typeof buildApp>> | undefined
  try {
    await db.pool.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`)
    // Reproduz os grants CRUD herdados da primeira publicação, antes da matriz restrita.
    await db.pool.query(
      `GRANT SELECT,INSERT,UPDATE,DELETE ON users,clubs,club_memberships,invites,invite_acceptances,personal_workspaces,club_workspaces,club_reading_states TO ${role}`,
    )
    const grants = (
      await readFile(new URL('../ops/runtime-grants.sql', import.meta.url), 'utf8')
    ).replaceAll('clube_runtime', role)
    await db.pool.query(grants)
    runtime = new Pool({
      connectionString: db.pool.options.connectionString,
      options: `-c search_path=${schema} -c role=${role}`,
    })
    app = await buildApp({
      pool: runtime,
      storage: {
        put: async () => {},
        get: async () => Buffer.from('synthetic'),
        remove: async () => {},
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
      await sharp({ create: { width: 8, height: 8, channels: 3, background: '#462b70' } })
        .png()
        .toBuffer()
    ).toString('base64')
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
    expect((await call('/me/avatar', 'DELETE')).json()).toEqual({ avatarId: null })
    expect((await call(`/people/${session.json().user.id}`)).json().avatarId).toBeNull()
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
    await expect(runtime.query('TRUNCATE users')).rejects.toThrow('permission denied')
  } finally {
    await app?.close()
    await runtime?.end()
    await db.pool.query(`DROP OWNED BY ${role}`)
    await db.pool.query(`DROP ROLE ${role}`)
    await db.close()
  }
})
