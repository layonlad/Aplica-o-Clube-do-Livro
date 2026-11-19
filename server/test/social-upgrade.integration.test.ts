import { it, expect } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { testDatabase } from './database.js'
import { migrate } from '../src/migrations.js'
import { PostService } from '../src/post-service.js'
it('aplica a evolução sobre a base 016 duas vezes e preserva publicação, vídeo, comentário e preferências antigos', async () => {
  const db = await testDatabase(false)
  try {
    await db.pool.query(
      'CREATE TABLE schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
    )
    for (const name of (await readdir(new URL('../migrations/', import.meta.url)))
      .filter((name) => /^\d+.*\.sql$/.test(name) && Number(name.slice(0, 3)) <= 16)
      .sort()) {
      const sql = await readFile(new URL('../migrations/' + name, import.meta.url), 'utf8')
      await db.pool.query(sql)
      await db.pool.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [
        name,
        createHash('sha256').update(sql).digest('hex'),
      ])
    }
    const user = (
      await db.pool.query(
        "INSERT INTO users(firebase_uid,email,name) VALUES('upgrade-synthetic','upgrade@example.com','Leitora sintética') RETURNING id,email,name",
      )
    ).rows[0]
    const follower = (
      await db.pool.query(
        "INSERT INTO users(firebase_uid,email,name) VALUES('upgrade-follower','follower@example.invalid','Seguidor existente') RETURNING id",
      )
    ).rows[0].id
    await db.pool.query(
      "INSERT INTO profiles(user_id,handle,display_name,is_public) VALUES($1,'legado','Leitora sintética',true),($2,'seguidor_legado','Seguidor existente',true)",
      [user.id, follower],
    )
    await db.pool.query('INSERT INTO follows(follower_id,followed_id) VALUES($1,$2)', [
      follower,
      user.id,
    ])
    const club = (
      await db.pool.query(
        "WITH c AS (INSERT INTO clubs(name,owner_user_id) VALUES('Clube legado',$1) RETURNING id) INSERT INTO club_memberships(club_id,user_id,role) SELECT id,$1,'owner' FROM c RETURNING club_id",
        [user.id],
      )
    ).rows[0].club_id
    const media = randomUUID(),
      post = randomUUID(),
      comment = randomUUID()
    await db.pool.query(
      "INSERT INTO media_objects(id,owner_user_id,club_id,object_key,thumbnail_key,kind,mime_type,byte_size,thumbnail_size,width,height,duration,state) VALUES($1,$2,$3,'legacy/clip','legacy/thumb','video','video/mp4',100,20,720,1280,4,'active')",
      [media, user.id, club],
    )
    await db.pool.query(
      "INSERT INTO social_posts(id,author_user_id,club_id,audience,kind,body) VALUES($1,$2,$3,'club','review','Texto histórico.\n\nParágrafo preservado.')",
      [post, user.id, club],
    )
    await db.pool.query(
      'INSERT INTO post_media(post_id,media_id,scope_id,position) VALUES($1,$2,$3,0)',
      [post, media, club],
    )
    await db.pool.query(
      "INSERT INTO post_comments(id,post_id,author_user_id,body) VALUES($1,$2,$3,'Comentário histórico')",
      [comment, post, user.id],
    )
    const appearance = {
      preset: 'azul',
      mode: 'dark',
      accent: null,
      headingFont: 'lora',
      bodyFont: 'inter',
      radius: 'soft',
    }
    await db.pool.query(
      "INSERT INTO personal_workspaces(user_id,state,preferences) VALUES($1,'{}',$2)",
      [user.id, { appearance }],
    )
    const before = (
      await db.pool.query(
        'SELECT body,kind,quote,version,created_at FROM social_posts WHERE id=$1',
        [post],
      )
    ).rows[0]
    await migrate(db.pool)
    await migrate(db.pool)
    expect(
      (
        await db.pool.query('SELECT 1 FROM follows WHERE follower_id=$1 AND followed_id=$2', [
          follower,
          user.id,
        ])
      ).rowCount,
    ).toBe(1)
    expect((await db.pool.query('SELECT count(*)::int AS n FROM follow_requests')).rows[0].n).toBe(
      0,
    )
    expect(
      (
        await db.pool.query(
          'SELECT body,kind,quote,version,created_at FROM social_posts WHERE id=$1',
          [post],
        )
      ).rows[0],
    ).toEqual(before)
    expect(
      (
        await db.pool.query('SELECT preferences FROM personal_workspaces WHERE user_id=$1', [
          user.id,
        ])
      ).rows[0].preferences.appearance,
    ).toEqual(appearance)
    const dto = await new PostService(db.pool).get(user, club, post)
    expect(dto.kind).toBe('review')
    expect(dto.media[0]).toMatchObject({ id: media, kind: 'video', width: 720, height: 1280 })
    expect(
      (await db.pool.query('SELECT body FROM post_comments WHERE id=$1', [comment])).rows[0].body,
    ).toBe('Comentário histórico')
    expect(
      (await db.pool.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count,
    ).toBe(21)
  } finally {
    await db.close()
  }
})
