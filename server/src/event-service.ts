import type { Pool, PoolClient } from 'pg'
import type { UserProfile } from './contracts.js'
import { transaction } from './database.js'
import { authorize } from './service.js'
import { assertCapability, can } from './permissions.js'
import { HttpError } from './errors.js'
import { decodeCursor, pageOf } from './pagination.js'
import { randomUUID } from 'node:crypto'
import type { WorkspaceAction } from './workspace-model.js'
const missing = () => new HttpError(404, 'EVENT_NOT_FOUND', 'Este encontro não está disponível.')
export interface EventInput {
  title: string
  date: string
  location: string
  description: string
  bookId?: string | null
  topicId?: string | null
}
const columns = `e.id,e.title,e.starts_at AS date,e.location,e.description,e.book_id AS "bookId",e.book_title AS "bookTitle",e.topic_id AS "topicId",e.version,e.created_at AS "createdAt",e.starts_at::text AS "sortTime",(SELECT count(*)::int FROM event_attendees a JOIN club_memberships cm ON cm.club_id=a.club_id AND cm.user_id=a.user_id AND cm.status='active' WHERE a.event_id=e.id AND a.rsvp='yes') AS confirmed,(SELECT rsvp FROM event_attendees a WHERE a.event_id=e.id AND a.user_id=$2) AS "myRsvp",jsonb_array_length(e.legacy_photos) AS "legacyPhotoCount",(SELECT count(*)::int FROM club_albums a WHERE a.event_id=e.id AND a.deleted_at IS NULL) AS albums`
export class EventService {
  constructor(private pool: Pool) {}
  private async links(client: PoolClient, clubId: string, input: EventInput) {
    let bookTitle = ''
    if (input.bookId) {
      const {
        rows: [book],
      } = await client.query(
        "SELECT book->>'title' AS title FROM club_workspaces w CROSS JOIN LATERAL jsonb_array_elements(w.state->'books') book WHERE w.club_id=$1 AND book->>'id'=$2",
        [clubId, input.bookId],
      )
      if (!book) throw new HttpError(400, 'INVALID_BOOK', 'Escolha um livro deste clube.')
      bookTitle = book.title
    }
    if (
      input.topicId &&
      !(
        await client.query(
          'SELECT 1 FROM forum_topics WHERE id=$1 AND club_id=$2 AND deleted_at IS NULL',
          [input.topicId, clubId],
        )
      ).rowCount
    )
      throw new HttpError(400, 'INVALID_TOPIC', 'Escolha uma discussão deste clube.')
    return bookTitle
  }
  // Bridge old clients during rollout. Frozen JSON is compared to a checkpoint; unchanged history is not recopied.
  async reconcile(client: PoolClient, clubId: string) {
    await client.query(
      "INSERT INTO event_legacy_checkpoints(club_id,events) VALUES($1,'[]') ON CONFLICT DO NOTHING",
      [clubId],
    )
    const {
      rows: [changed],
    } = await client.query(
      "SELECT COALESCE(w.state->'events','[]') AS events,c.events AS previous FROM club_workspaces w JOIN event_legacy_checkpoints c ON c.club_id=w.club_id WHERE w.club_id=$1 AND COALESCE(w.state->'events','[]') IS DISTINCT FROM c.events FOR UPDATE OF c",
      [clubId],
    )
    if (!changed) return
    const previous = new Map<string, Record<string, unknown>>(
      changed.previous.map((e: Record<string, unknown>) => [e.id, e]),
    )
    for (const event of changed.events) {
      const old = previous.get(event.id)
      const existing = (
        await client.query('SELECT club_id,created_by FROM club_events WHERE id=$1', [event.id])
      ).rows[0]
      if (existing && (existing.club_id !== clubId || existing.created_by !== event.createdBy))
        throw new HttpError(
          409,
          'LEGACY_EVENT_CONFLICT',
          'O encontro anterior exige revisão antes de ser importado.',
        )
      if (!existing)
        await client.query(
          'INSERT INTO club_events(id,club_id,created_by,title,starts_at,location,description,legacy_photos) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            event.id,
            clubId,
            event.createdBy,
            event.title,
            event.date,
            event.location,
            event.description,
            JSON.stringify(event.photos),
          ],
        )
      else if (old && JSON.stringify(old.photos) !== JSON.stringify(event.photos))
        await client.query('UPDATE club_events SET legacy_photos=$2 WHERE id=$1', [
          event.id,
          JSON.stringify(event.photos),
        ])
      for (const [userId, value] of Object.entries(event.rsvps as Record<string, string>)) {
        if ((old?.rsvps as Record<string, string> | undefined)?.[userId] === value) continue
        await client.query(
          'INSERT INTO event_attendees(event_id,club_id,user_id,rsvp) VALUES($1,$2,$3,$4) ON CONFLICT(event_id,user_id) DO UPDATE SET rsvp=EXCLUDED.rsvp,updated_at=now()',
          [event.id, clubId, userId, value],
        )
      }
    }
    const current = new Set(changed.events.map((e: { id: string }) => e.id))
    for (const id of previous.keys())
      if (!current.has(id))
        await client.query(
          'UPDATE club_events SET deleted_at=COALESCE(deleted_at,now()),version=version+1 WHERE id=$1 AND club_id=$2',
          [id, clubId],
        )
    await client.query('UPDATE event_legacy_checkpoints SET events=$2 WHERE club_id=$1', [
      clubId,
      JSON.stringify(changed.events),
    ])
  }
  async legacyEvents(client: PoolClient, clubId: string, photos = true) {
    await this.reconcile(client, clubId)
    const { rows } = await client.query(
      `SELECT e.id,e.title,e.starts_at AS date,e.location,e.description,e.created_by AS "createdBy",${photos ? 'e.legacy_photos' : "'[]'::jsonb"} AS photos,COALESCE((SELECT jsonb_object_agg(a.user_id,a.rsvp) FROM event_attendees a WHERE a.event_id=e.id),'{}') AS rsvps FROM club_events e WHERE e.club_id=$1 AND e.deleted_at IS NULL ORDER BY abs(extract(epoch FROM (e.starts_at-now()))),e.id LIMIT 100`,
      [clubId],
    )
    return rows
  }
  list(
    user: UserProfile,
    clubId: string,
    input: {
      limit: number
      cursor?: string
      from?: string
      until?: string
      order?: 'asc' | 'desc'
    },
  ) {
    return transaction(this.pool, async (client) => {
      const club = await authorize(client, clubId, user.id, false, 'share')
      await this.reconcile(client, clubId)
      const cursor = decodeCursor(input.cursor),
        order = input.order === 'asc' ? 'ASC' : 'DESC',
        comparison = order === 'ASC' ? '>' : '<'
      const { rows } = await client.query(
        `SELECT ${columns} FROM club_events e WHERE e.club_id=$1 AND e.deleted_at IS NULL AND ($3::timestamptz IS NULL OR (e.starts_at,e.id)${comparison}($3,$4::uuid)) AND ($5::timestamptz IS NULL OR e.starts_at>=$5) AND ($6::timestamptz IS NULL OR e.starts_at<$6) ORDER BY e.starts_at ${order},e.id ${order} LIMIT $7`,
        [
          clubId,
          user.id,
          cursor?.time ?? null,
          cursor?.id ?? null,
          input.from ?? null,
          input.until ?? null,
          input.limit + 1,
        ],
      )
      return { ...pageOf(rows, input.limit), canManage: can(club.role, 'manageEvents') }
    })
  }
  get(user: UserProfile, clubId: string, id: string) {
    return transaction(this.pool, async (client) => {
      await authorize(client, clubId, user.id, false, 'share')
      await this.reconcile(client, clubId)
      const {
        rows: [event],
      } = await client.query(
        `SELECT ${columns} FROM club_events e WHERE e.club_id=$1 AND e.id=$3 AND e.deleted_at IS NULL`,
        [clubId, user.id, id],
      )
      if (!event) throw missing()
      const { sortTime, ...dto } = event
      return dto
    })
  }
  create(user: UserProfile, clubId: string, input: EventInput) {
    return transaction(this.pool, async (client) => {
      assertCapability((await authorize(client, clubId, user.id)).role, 'manageEvents')
      await this.reconcile(client, clubId)
      const bookTitle = await this.links(client, clubId, input)
      const {
        rows: [event],
      } = await client.query(
        'INSERT INTO club_events(club_id,created_by,title,starts_at,location,description,book_id,book_title,topic_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
        [
          clubId,
          user.id,
          input.title,
          input.date,
          input.location,
          input.description,
          input.bookId ?? null,
          bookTitle,
          input.topicId ?? null,
        ],
      )
      await this.audit(client, clubId, user.id, 'event.created', event.id)
      return event
    })
  }
  edit(user: UserProfile, clubId: string, id: string, input: EventInput & { version: number }) {
    return transaction(this.pool, async (client) => {
      assertCapability((await authorize(client, clubId, user.id)).role, 'manageEvents')
      await this.reconcile(client, clubId)
      const event = await this.event(client, clubId, id)
      if (event.version !== input.version)
        throw new HttpError(409, 'EVENT_CHANGED', 'Este encontro mudou. Atualize antes de salvar.')
      const bookTitle = await this.links(client, clubId, input)
      await client.query(
        'UPDATE club_events SET title=$2,starts_at=$3,location=$4,description=$5,book_id=$6,book_title=$7,topic_id=$8,version=version+1,updated_at=now() WHERE id=$1',
        [
          id,
          input.title,
          input.date,
          input.location,
          input.description,
          input.bookId ?? null,
          bookTitle,
          input.topicId ?? null,
        ],
      )
      await this.audit(client, clubId, user.id, 'event.edited', id)
      return { updated: true }
    })
  }
  private async event(client: PoolClient, clubId: string, id: string) {
    const {
      rows: [event],
    } = await client.query(
      'SELECT * FROM club_events WHERE id=$1 AND club_id=$2 AND deleted_at IS NULL FOR UPDATE',
      [id, clubId],
    )
    if (!event) throw missing()
    return event
  }
  rsvp(user: UserProfile, clubId: string, id: string, value: 'yes' | 'maybe' | 'no') {
    return transaction(this.pool, async (client) => {
      await authorize(client, clubId, user.id)
      await this.reconcile(client, clubId)
      await this.event(client, clubId, id)
      await client.query(
        'INSERT INTO event_attendees(event_id,club_id,user_id,rsvp) VALUES($1,$2,$3,$4) ON CONFLICT(event_id,user_id) DO UPDATE SET rsvp=$4,updated_at=now()',
        [id, clubId, user.id, value],
      )
      return { updated: true }
    })
  }
  attendees(
    user: UserProfile,
    clubId: string,
    id: string,
    input: { limit: number; cursor?: string },
  ) {
    return transaction(this.pool, async (client) => {
      const club = await authorize(client, clubId, user.id, false, 'share')
      await this.reconcile(client, clubId)
      await this.event(client, clubId, id)
      const cursor = decodeCursor(input.cursor)
      const { rows } = await client.query(
        `SELECT u.id,u.name,a.rsvp,CASE WHEN $6::boolean OR a.user_id=$2 THEN a.attended ELSE NULL END AS attended,a.updated_at::text AS "sortTime" FROM event_attendees a JOIN users u ON u.id=a.user_id JOIN club_memberships m ON m.club_id=a.club_id AND m.user_id=a.user_id AND m.status='active' WHERE a.event_id=$1 AND ($3::timestamptz IS NULL OR (a.updated_at,u.id)<($3,$4::uuid)) ORDER BY a.updated_at DESC,u.id DESC LIMIT $5`,
        [
          id,
          user.id,
          cursor?.time ?? null,
          cursor?.id ?? null,
          input.limit + 1,
          can(club.role, 'manageEvents'),
        ],
      )
      return pageOf(rows, input.limit)
    })
  }
  attendance(user: UserProfile, clubId: string, id: string, targetId: string, attended: boolean) {
    return transaction(this.pool, async (client) => {
      assertCapability((await authorize(client, clubId, user.id)).role, 'manageEvents')
      await this.reconcile(client, clubId)
      await this.event(client, clubId, id)
      if (
        !(
          await client.query(
            "SELECT 1 FROM club_memberships WHERE club_id=$1 AND user_id=$2 AND status='active'",
            [clubId, targetId],
          )
        ).rowCount
      )
        throw missing()
      await client.query(
        "INSERT INTO event_attendees(event_id,club_id,user_id,rsvp,attended,recorded_by) VALUES($1,$2,$3,'maybe',$4,$5) ON CONFLICT(event_id,user_id) DO UPDATE SET attended=$4,recorded_by=$5,updated_at=now()",
        [id, clubId, targetId, attended, user.id],
      )
      await this.audit(client, clubId, user.id, 'event.attendance', id)
      return { updated: true }
    })
  }
  remove(user: UserProfile, clubId: string, id: string) {
    return transaction(this.pool, async (client) => {
      assertCapability((await authorize(client, clubId, user.id)).role, 'manageEvents')
      await this.reconcile(client, clubId)
      await this.event(client, clubId, id)
      await client.query('UPDATE club_events SET deleted_at=now(),version=version+1 WHERE id=$1', [
        id,
      ])
      await this.audit(client, clubId, user.id, 'event.deleted', id)
    })
  }
  photos(user: UserProfile, clubId: string, id: string) {
    return transaction(this.pool, async (client) => {
      await authorize(client, clubId, user.id, false, 'share')
      await this.reconcile(client, clubId)
      const event = await this.event(client, clubId, id)
      return { photos: event.legacy_photos as { id: string; src: string; by: string }[] }
    })
  }
  private async audit(
    client: PoolClient,
    clubId: string,
    userId: string,
    action: string,
    id: string,
  ) {
    await client.query(
      'INSERT INTO audit_logs(club_id,actor_user_id,action,entity_id) VALUES($1,$2,$3,$4)',
      [clubId, userId, action, id],
    )
  }
  async legacyAction(user: UserProfile, clubId: string, action: WorkspaceAction, version: number) {
    return transaction(this.pool, async (client) => {
      const club = await authorize(client, clubId, user.id)
      await this.reconcile(client, clubId)
      await client.query(
        'INSERT INTO club_workspaces(club_id,state) VALUES($1,\'{"books":[],"events":[],"topics":[],"nominations":[],"draws":[],"currentBookId":null}\') ON CONFLICT DO NOTHING',
        [clubId],
      )
      const current = (
        await client.query('SELECT version FROM club_workspaces WHERE club_id=$1 FOR UPDATE', [
          clubId,
        ])
      ).rows[0]
      if (current.version !== version)
        throw new HttpError(
          409,
          'WORKSPACE_CHANGED',
          'O espaço mudou. Atualize antes de tentar novamente.',
        )
      if (action.type === 'event.add') {
        assertCapability(club.role, 'manageEvents')
        await client.query(
          'INSERT INTO club_events(id,club_id,created_by,title,starts_at,location,description) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [
            randomUUID(),
            clubId,
            user.id,
            action.title,
            action.date,
            action.location,
            action.description,
          ],
        )
      } else if (action.type === 'event.remove') {
        assertCapability(club.role, 'manageEvents')
        await this.event(client, clubId, action.id)
        await client.query(
          'UPDATE club_events SET deleted_at=now(),version=version+1 WHERE id=$1',
          [action.id],
        )
      } else if (action.type === 'event.rsvp') {
        await this.event(client, clubId, action.id)
        await client.query(
          'INSERT INTO event_attendees(event_id,club_id,user_id,rsvp) VALUES($1,$2,$3,$4) ON CONFLICT(event_id,user_id) DO UPDATE SET rsvp=$4,updated_at=now()',
          [action.id, clubId, user.id, action.value],
        )
      } else if (action.type === 'event.photo') {
        await this.event(client, clubId, action.id)
        const changed = await client.query(
          'UPDATE club_events SET legacy_photos=legacy_photos||$2::jsonb,version=version+1 WHERE id=$1 AND jsonb_array_length(legacy_photos)<8',
          [action.id, JSON.stringify([{ id: randomUUID(), src: action.src, by: user.id }])],
        )
        if (!changed.rowCount)
          throw new HttpError(
            409,
            'LIMIT',
            'Este encontro já tem oito fotos antigas. Use a galeria para novos registros.',
          )
      }
      await client.query('UPDATE club_workspaces SET version=version+1 WHERE club_id=$1', [clubId])
      await this.audit(
        client,
        clubId,
        user.id,
        action.type,
        'id' in action && typeof action.id === 'string' ? action.id : clubId,
      )
    })
  }
}
