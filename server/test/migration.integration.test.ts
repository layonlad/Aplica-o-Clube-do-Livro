import { expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { testDatabase } from './database.js'
import { migrate } from '../src/migrations.js'
import { emptyWorkspace } from '../src/workspace-model.js'
it('interrompe e reverte as novas migrações se o fórum legado tiver autor sem vínculo válido', async () => {
  const db = await testDatabase(false)
  try {
    await db.pool.query(
      'CREATE TABLE schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
    )
    for (const name of ['001_identity_and_clubs.sql', '002_complete_workspace.sql']) {
      const sql = await readFile(new URL('../migrations/' + name, import.meta.url), 'utf8')
      await db.pool.query(sql)
      await db.pool.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [
        name,
        createHash('sha256').update(sql).digest('hex'),
      ])
    }
    const {
      rows: [user],
    } = await db.pool.query(
      "INSERT INTO users(firebase_uid,email,name) VALUES('migration-reconcile-owner','local@example.com','Proprietário de teste') RETURNING id",
    )
    const {
      rows: [club],
    } = await db.pool.query(
      "WITH c AS(INSERT INTO clubs(name,owner_user_id) VALUES('Clube com legado',$1) RETURNING id) INSERT INTO club_memberships(club_id,user_id,role) SELECT id,$1,'owner' FROM c RETURNING club_id",
      [user.id],
    )
    const state = emptyWorkspace()
    state.topics.push({
      id: randomUUID(),
      title: 'Registro que precisa de reconciliação',
      body: 'Este conteúdo deve ser preservado.',
      by: 'orphan-author',
      name: 'Autoria antiga',
      at: '2026-11-13T12:00:00.000Z',
      spoiler: false,
      likedBy: [],
      replies: [],
    })
    await db.pool.query('INSERT INTO club_workspaces(club_id,state) VALUES($1,$2)', [
      club.club_id,
      state,
    ])
    await expect(migrate(db.pool)).rejects.toThrow('requires author/member reconciliation')
    expect(
      (await db.pool.query('SELECT state FROM club_workspaces WHERE club_id=$1', [club.club_id]))
        .rows[0].state,
    ).toEqual(state)
    expect(
      (await db.pool.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count,
    ).toBe(2)
    expect(
      (
        await db.pool.query(
          "SELECT to_regclass('forum_topics') AS forum,to_regclass('private_book_files') AS files",
        )
      ).rows[0],
    ).toEqual({ forum: null, files: null })
  } finally {
    await db.close()
  }
})
it('migra encontros anteriores com RSVP e fotos, mantendo o JSON de origem e a chave do álbum', async () => {
  const db = await testDatabase(false)
  try {
    await db.pool.query(
      'CREATE TABLE schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
    )
    for (const name of ['001_identity_and_clubs.sql', '002_complete_workspace.sql']) {
      const sql = await readFile(new URL('../migrations/' + name, import.meta.url), 'utf8')
      await db.pool.query(sql)
      await db.pool.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [
        name,
        createHash('sha256').update(sql).digest('hex'),
      ])
    }
    const owner = (
      await db.pool.query(
        "INSERT INTO users(firebase_uid,email,name) VALUES('legacy-event-owner','legacy-event@example.com','Dono') RETURNING id",
      )
    ).rows[0].id
    const club = (
      await db.pool.query(
        "WITH c AS(INSERT INTO clubs(name,owner_user_id) VALUES('Encontros anteriores',$1) RETURNING id) INSERT INTO club_memberships(club_id,user_id,role) SELECT id,$1,'owner' FROM c RETURNING club_id",
        [owner],
      )
    ).rows[0].club_id
    const state = emptyWorkspace(),
      id = randomUUID(),
      photoId = randomUUID()
    state.events.push({
      id,
      title: 'Encontro preservado',
      date: '2026-11-01T18:30:00Z',
      createdBy: owner,
      location: 'Sala',
      description: 'Memória do calendário',
      rsvps: { [owner]: 'yes' },
      photos: [{ id: photoId, src: 'data:image/jpeg;base64,AAAA', by: owner }],
    })
    await db.pool.query('INSERT INTO club_workspaces(club_id,state) VALUES($1,$2)', [club, state])
    await migrate(db.pool)
    await migrate(db.pool)
    const event = (
      await db.pool.query('SELECT title,legacy_photos FROM club_events WHERE id=$1', [id])
    ).rows[0]
    expect(event.title).toBe('Encontro preservado')
    expect(event.legacy_photos).toEqual(state.events[0].photos)
    expect(
      (
        await db.pool.query('SELECT rsvp FROM event_attendees WHERE event_id=$1 AND user_id=$2', [
          id,
          owner,
        ])
      ).rows[0].rsvp,
    ).toBe('yes')
    expect(
      (await db.pool.query('SELECT state FROM club_workspaces WHERE club_id=$1', [club])).rows[0]
        .state,
    ).toEqual(state)
  } finally {
    await db.close()
  }
})
