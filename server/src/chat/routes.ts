import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getApp } from 'firebase-admin/app'
import type { FastifyInstance } from 'fastify'
import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import { authorize } from '../service.js'
import { transaction } from '../database.js'
import { HttpError, forbidden } from '../errors.js'
import { assertCapability } from '../permissions.js'
import { notBlocked } from '../public-policy.js'

const path = '/clubs/:clubId/chat'
const params = z.object({ clubId: z.uuid() })
const room = z.enum(['general', 'reading', 'spoilers'])
const pref = z.enum(['all', 'mentions', 'announcements', 'silent'])
const emoji = z.enum(['❤️', '👍', '📚', '😂', '😮'])
const envelope = z.object({
  id: z.uuid(),
  room,
  text: z.string().trim().min(1).max(2000),
  spoiler: z.boolean(),
  replyTo: z.uuid().nullable(),
  mentions: z.array(z.uuid()).max(8),
})
const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('react'), emoji: emoji.nullable() }),
  z.object({ type: z.literal('pin'), on: z.boolean() }),
  z.object({ type: z.literal('remove') }),
  z.object({
    type: z.literal('report'),
    reason: z.string().trim().min(3).max(400),
  }),
])
const history = z
  .object({
    room,
    before: z.uuid().optional(),
    focus: z.uuid().optional(),
    since: z.string().length(64).optional(),
  })
  .strict()
const visible = `m.club_id=$1 AND m.room=$3 AND NOT m.deleted AND m.created_at>now()-interval '90 days' AND ${notBlocked('m.author_id', '$2')} AND NOT EXISTS(SELECT 1 FROM profiles ps WHERE ps.user_id=m.author_id AND ps.suspended)`
const body = (club: string, id: string) =>
  getFirestore(getApp(), 'clube-chat').doc(`clubs/${club}/messages/${id}`)
async function access(c: Pool | PoolClient, club: string, who: string) {
  const rollout = process.env.CLUB_CHAT_CLUB_IDS
  if (
    rollout &&
    !rollout
      .split(',')
      .map((id) => id.trim())
      .includes(club)
  )
    throw forbidden()

  const { rows } = await c.query(
    `SELECT cm.role, COALESCE(s.enabled,true) AS enabled,COALESCE(s.chapter,'') AS chapter,COALESCE(s.slow_seconds,2) AS slow,COALESCE(s.pin_limit,3) AS pins,COALESCE(p.muted,false) AS muted,COALESCE(p.preference,'mentions') AS preference FROM club_memberships cm LEFT JOIN chat_settings s USING(club_id) LEFT JOIN chat_members p USING(club_id,user_id) WHERE cm.club_id=$1 AND cm.user_id=$2 AND cm.status='active' AND NOT EXISTS(SELECT 1 FROM profiles pr WHERE pr.user_id=$2 AND pr.suspended)`,
    [club, who],
  )
  if (!rows[0]) throw forbidden()
  return rows[0]
}
async function notices(
  c: PoolClient,
  club: string,
  who: string,
  id: string,
  direct: string[],
  pin: boolean,
) {
  await c.query(
    `INSERT INTO notifications(recipient_id,actor_id,club_id,kind,target_type,target_id,category,dedupe_key)
 SELECT cm.user_id,$2,$1,CASE WHEN cm.user_id=ANY($4::uuid[]) THEN 'mention' ELSE 'post' END,'chat',$3::uuid,'clubs',
 'chat:'||($3::uuid)::text||':'||($5::boolean)::text FROM club_memberships cm LEFT JOIN chat_members p USING(club_id,user_id)
 WHERE cm.club_id=$1 AND cm.status='active' AND cm.user_id<>$2 AND ${notBlocked('cm.user_id', '$2')}
 AND (p.preference='all' OR ($5::boolean AND p.preference='announcements') OR (cm.user_id=ANY($4) AND COALESCE(p.preference,'mentions')='mentions'))
 ON CONFLICT(recipient_id,dedupe_key) DO NOTHING`,
    [club, who, id, direct, pin],
  )
}

export function registerChat(
  api: FastifyInstance,
  pool: Pool,
  notify?: () => void,
) {
  const wake = new EventEmitter().setMaxListeners(0)
  // The current single Cloud Run instance accepts two concurrent requests.
  // Reserve the second slot for sends and other app operations.
  let waiting = false
  api.get(path + '/locate/:id', async (req) => {
    const { clubId, id } = params.extend({ id: z.uuid() }).parse(req.params),
      who = req.user.id
    if (!(await access(pool, clubId, who)).enabled) throw forbidden()
    const result = await pool.query(
      `SELECT m.room FROM chat_messages m WHERE m.club_id=$1 AND m.id=$3 AND NOT m.deleted AND m.created_at>now()-interval '90 days' AND ${notBlocked('m.author_id', '$2')} AND NOT EXISTS(SELECT 1 FROM profiles p WHERE p.user_id=m.author_id AND p.suspended)`,
      [clubId, who, id],
    )
    if (!result.rows[0]) throw forbidden()
    return result.rows[0]
  })
  api.get(path + '/reports', async (req) => {
    const { clubId } = params.parse(req.params),
      who = req.user.id
    assertCapability((await access(pool, clubId, who)).role, 'moderate')
    return (
      await pool.query(
        `SELECT m.id,m.room,r.reason FROM chat_reports r JOIN chat_messages m ON r.message_id=m.id WHERE m.club_id=$1 AND NOT m.deleted AND m.created_at>now()-interval '90 days' ORDER BY r.created_at DESC LIMIT 30`,
        [clubId],
      )
    ).rows
  })
  api.get(path + '/members', async (req) => {
    const { clubId } = params.parse(req.params),
      who = req.user.id
    const { q } = z.object({ q: z.string().trim().max(100) }).parse(req.query)
    await access(pool, clubId, who)
    return (
      await pool.query(
        `SELECT m.user_id AS id,coalesce(p.display_name,u.name) AS name FROM club_memberships m JOIN users u ON u.id=m.user_id LEFT JOIN profiles p ON p.user_id=m.user_id WHERE m.club_id=$1 AND m.status='active' AND NOT coalesce(p.suspended,false) AND ${notBlocked('m.user_id', '$2')} AND strpos(lower(coalesce(p.display_name,u.name)),lower($3))>0 ORDER BY name,m.user_id LIMIT 8`,
        [clubId, who, q],
      )
    ).rows
  })
  api.get(path + '/settings', async (req) =>
    access(pool, params.parse(req.params).clubId, req.user.id),
  )
  api.post(path + '/settings', async (req) => {
    const { clubId } = params.parse(req.params),
      who = req.user.id
    const change = z
      .discriminatedUnion('type', [
        z.object({ type: z.literal('preference'), value: pref }),
        z.object({
          type: z.literal('mute'),
          member: z.uuid(),
          on: z.boolean(),
        }),
        z.object({
          type: z.literal('settings'),
          enabled: z.boolean(),
          chapter: z.string().trim().max(100),
          slow: z.number().int().min(1).max(300),
          pins: z.number().int().min(1).max(10),
        }),
      ])
      .parse(req.body)
    await transaction(pool, async (c) => {
      await authorize(c, clubId, who, false, 'share')
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        change.type === 'mute' ? clubId + change.member : clubId,
      ])
      const a = await access(c, clubId, who)
      if (change.type === 'preference') {
        await c.query(
          'INSERT INTO chat_members(club_id,user_id,preference) VALUES($1,$2,$3) ON CONFLICT(club_id,user_id) DO UPDATE SET preference=excluded.preference',
          [clubId, who, change.value],
        )
        return
      }
      if (change.type === 'mute') {
        assertCapability(a.role, 'moderate')
        const target = await access(c, clubId, change.member)
        if (target.role !== 'member') throw forbidden()
        await c.query(
          'INSERT INTO chat_members(club_id,user_id,muted) VALUES($1,$2,$3) ON CONFLICT(club_id,user_id) DO UPDATE SET muted=excluded.muted',
          [clubId, change.member, change.on],
        )
      } else {
        assertCapability(a.role, 'configure')
        await c.query(
          'INSERT INTO chat_settings(club_id,enabled,chapter,slow_seconds,pin_limit) VALUES($1,$2,$3,$4,$5) ON CONFLICT(club_id) DO UPDATE SET enabled=excluded.enabled,chapter=excluded.chapter,slow_seconds=excluded.slow_seconds,pin_limit=excluded.pin_limit',
          [clubId, change.enabled, change.chapter, change.slow, change.pins],
        )
      }
      await c.query(
        'INSERT INTO audit_logs(club_id,actor_user_id,action,entity_id) VALUES($1,$2,$3,$4)',
        [
          clubId,
          who,
          'chat.' + change.type,
          change.type === 'mute' ? change.member : clubId,
        ],
      )
    })
    wake.emit(clubId)
    return { ok: true }
  })
  api.get(path, async (req, reply) => {
    const { clubId } = params.parse(req.params),
      who = req.user.id,
      q = history.parse(req.query)
    const load = async () => {
      const a = await access(pool, clubId, who)
      if (!a.enabled) throw forbidden()
      const args = [clubId, who, q.room, q.before ?? null, q.focus ?? null]
      const { rows } = await pool.query(
        `SELECT m.id,m.author_id AS "authorId",COALESCE(p.display_name,u.name) AS name,p.avatar_id AS "avatarId",m.created_at AS "createdAt",m.spoiler,m.chapter,m.reply_to AS "replyTo",m.pinned,
    (SELECT jsonb_object_agg(r.emoji,r.n) FROM (SELECT emoji,count(*) n FROM chat_reactions cr WHERE cr.message_id=m.id AND ${notBlocked('cr.user_id', '$2')} GROUP BY emoji) r) AS reactions,
    (SELECT emoji FROM chat_reactions WHERE message_id=m.id AND user_id=$2) AS mine,m.author_id=$2 AS own
    FROM chat_messages m JOIN users u ON u.id=m.author_id LEFT JOIN profiles p ON p.user_id=u.id WHERE ${visible}
    AND ($4::uuid IS NULL OR (m.created_at,m.id)<(SELECT created_at,id FROM chat_messages WHERE id=$4 AND club_id=$1 AND room=$3))
    AND ($5::uuid IS NULL OR m.id=$5) ORDER BY m.created_at DESC,m.id DESC LIMIT 31`,
        args,
      )
      const pins = await pool.query(
        `SELECT m.id FROM chat_messages m WHERE ${visible} AND m.pinned ORDER BY m.created_at DESC LIMIT 10`,
        args.slice(0, 3),
      )
      const version = createHash('sha256')
        .update(JSON.stringify([rows, pins.rows, a]))
        .digest('hex')
      return { rows, pins: pins.rows.map((p) => p.id), version }
    }
    let result = await load()
    if (q.since === result.version && !q.before && !q.focus) {
      if (waiting)
        return { unchanged: true, version: result.version, retryAfterMs: 1800 }
      waiting = true
      try {
        await new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer)
            wake.off(clubId, done)
            reply.raw.off('close', done)
            resolve()
          }
          const timer = setTimeout(done, 8000)
          wake.once(clubId, done)
          reply.raw.once('close', done)
        })
      } finally {
        waiting = false
      }
      result = await load()
      if (q.since === result.version)
        return { unchanged: true, version: result.version }
    }
    const page = result.rows.slice(0, 30)
    const docs = page.length
      ? await getFirestore(getApp(), 'clube-chat').getAll(
          ...page.map((m) => body(clubId, m.id)),
        )
      : []
    const items = page
      .map((m, i) => ({ ...m, text: docs[i].get('text') ?? '' }))
      .reverse()
    return {
      items,
      pins: result.pins,
      version: result.version,
      before: result.rows.length > 30 ? page.at(-1).id : null,
    }
  })
  api.post(path, async (req) => {
    const { clubId } = params.parse(req.params),
      who = req.user.id,
      input = envelope.strict().parse(req.body)
    await transaction(pool, async (c) => {
      await authorize(c, clubId, who, false, 'share')
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        clubId + who,
      ])
      const a = await access(c, clubId, who)
      if (!a.enabled || a.muted) throw forbidden()
      const replay = await c.query(
        'SELECT 1 FROM chat_messages WHERE id=$1 AND club_id=$2 AND author_id=$3 AND room=$4',
        [input.id, clubId, who, input.room],
      )
      if (replay.rowCount) return
      if (
        (
          await c.query(
            "SELECT 1 FROM chat_messages WHERE club_id=$1 AND author_id=$2 AND created_at>now()-$3::int*interval '1 second' LIMIT 1",
            [clubId, who, a.slow],
          )
        ).rowCount
      )
        throw new HttpError(
          429,
          'SLOW_MODE',
          'Aguarde um instante antes de enviar.',
        )
      const recipients = new Set(input.mentions)
      if (recipients.size) {
        const allowed = await c.query(
          `SELECT cm.user_id FROM club_memberships cm WHERE cm.club_id=$1 AND cm.user_id=ANY($3::uuid[]) AND cm.status='active' AND ${notBlocked('cm.user_id', '$2')} AND NOT EXISTS(SELECT 1 FROM profiles p WHERE p.user_id=cm.user_id AND p.suspended)`,
          [clubId, who, [...recipients]],
        )
        if (allowed.rowCount !== recipients.size) throw forbidden()
      }
      if (input.replyTo) {
        const target = await c.query(
          `SELECT m.author_id FROM chat_messages m WHERE ${visible} AND m.id=$4`,
          [clubId, who, input.room, input.replyTo],
        )
        if (!target.rows[0]) throw forbidden()
        recipients.add(target.rows[0].author_id)
      }
      await c.query(
        'INSERT INTO chat_messages(id,club_id,author_id,room,reply_to,spoiler,chapter) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          input.id,
          clubId,
          who,
          input.room,
          input.replyTo,
          input.spoiler || input.room === 'spoilers',
          input.room === 'general' ? '' : a.chapter,
        ],
      )
      await notices(c, clubId, who, input.id, [...recipients], false)
      await body(clubId, input.id).set({
        text: input.text,
        expiresAt: Timestamp.fromMillis(Date.now() + 90 * 86400000),
      })
    })
    wake.emit(clubId)
    notify?.()
    return { id: input.id }
  })
  api.post(path + '/:id/action', async (req) => {
    const { clubId, id } = params.extend({ id: z.uuid() }).parse(req.params),
      who = req.user.id
    const input = action.parse(req.body)
    await transaction(pool, async (c) => {
      await authorize(c, clubId, who, false, 'share')
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [clubId])
      const a = await access(c, clubId, who)
      if (!a.enabled) throw forbidden()
      const target = (
        await c.query(
          `SELECT m.author_id FROM chat_messages m WHERE m.club_id=$1 AND m.id=$3 AND NOT m.deleted AND m.created_at>now()-interval '90 days' AND ${notBlocked('m.author_id', '$2')}`,
          [clubId, who, id],
        )
      ).rows[0]
      if (!target) throw forbidden()
      if (input.type === 'react') {
        if (a.muted) throw forbidden()
        if (input.emoji)
          await c.query(
            'INSERT INTO chat_reactions VALUES($1,$2,$3) ON CONFLICT(message_id,user_id) DO UPDATE SET emoji=excluded.emoji WHERE chat_reactions.emoji<>excluded.emoji',
            [id, who, input.emoji],
          )
        else
          await c.query(
            'DELETE FROM chat_reactions WHERE message_id=$1 AND user_id=$2',
            [id, who],
          )
        return
      }
      if (input.type === 'report') {
        await c.query(
          'INSERT INTO chat_reports(message_id,reporter,reason) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [id, who, input.reason],
        )
        return
      }
      if (input.type === 'pin') {
        assertCapability(a.role, 'moderate')
        if (
          input.on &&
          (
            await c.query(
              "SELECT 1 FROM chat_messages WHERE club_id=$1 AND pinned AND NOT deleted AND id<>$2 AND created_at>now()-interval '90 days' OFFSET $3 LIMIT 1",
              [clubId, id, a.pins - 1],
            )
          ).rowCount
        )
          throw new HttpError(
            409,
            'PIN_LIMIT',
            'Limite de mensagens fixadas atingido.',
          )
        await c.query('UPDATE chat_messages SET pinned=$2 WHERE id=$1', [
          id,
          input.on,
        ])
        if (input.on) await notices(c, clubId, who, id, [], true)
      } else {
        if (target.author_id !== who) assertCapability(a.role, 'moderate')
        await c.query(
          'UPDATE chat_messages SET deleted=true,pinned=false WHERE id=$1',
          [id],
        )
      }
      await c.query(
        'INSERT INTO audit_logs(club_id,actor_user_id,action,entity_id) VALUES($1,$2,$3,$4)',
        [clubId, who, 'chat.' + input.type, id],
      )
    })
    wake.emit(clubId)
    return { ok: true }
  })
}
