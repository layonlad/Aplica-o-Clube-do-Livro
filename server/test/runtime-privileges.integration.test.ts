import { it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { testDatabase } from './database.js'
import { buildApp } from '../src/app.js'
it('executa os fluxos essenciais com o papel restrito, sem DDL, migrations ou alteração da auditoria', async () => {
  const db = await testDatabase(),
    role = 'clube_runtime_test_' + randomUUID().replaceAll('-', ''),
    schema = (await db.pool.query('SELECT current_schema() AS name')).rows[0].name
  let runtime: Pool | undefined, app: Awaited<ReturnType<typeof buildApp>> | undefined
  try {
    await db.pool.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`)
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
  } finally {
    await app?.close()
    await runtime?.end()
    await db.pool.query(`DROP OWNED BY ${role}`)
    await db.pool.query(`DROP ROLE ${role}`)
    await db.close()
  }
})
