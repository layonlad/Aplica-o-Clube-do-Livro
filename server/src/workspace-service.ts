import { pruneIntegrations } from './reading-integrations/privacy.js'
import type { FreeEdition } from './literary/free-books.js'
import { genreLabels } from './literary/free-books.js'
import {EventService} from './event-service.js'
import {ForumService} from './forum-service.js'
import { randomInt, randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import type { UserProfile } from './contracts.js'
import { transaction } from './database.js'
import { HttpError } from './errors.js'
import { authorize } from './service.js'
import { applyWorkspaceAction, emptyWorkspace, isPersonalAction, WorkspaceError, type WorkspaceAction, type WorkspaceSnapshot } from './workspace-model.js'

type WorkspaceRow = Pick<WorkspaceSnapshot, 'state' | 'reading' | 'version' | 'preferences'>

export class WorkspaceService {
  private forum:ForumService
  constructor(private pool: Pool) {this.forum=new ForumService(pool)}
  private async personalSnapshot(connection: Pool | PoolClient, user: UserProfile, lock: boolean): Promise<WorkspaceSnapshot> {
    const sql = 'SELECT state,reading,version,preferences FROM personal_workspaces WHERE user_id=$1' + (lock ? ' FOR UPDATE' : '')
    let { rows: [row] } = await connection.query<WorkspaceRow>(sql, [user.id])
    if (!row) {
      await connection.query('INSERT INTO personal_workspaces (user_id,state) VALUES ($1,$2) ON CONFLICT DO NOTHING', [user.id, emptyWorkspace()])
      const initialized = await connection.query<WorkspaceRow>(sql, [user.id])
      row = initialized.rows[0]
    }
    return { ...row, role: 'owner', actorId: user.id }
  }

  private async clubSnapshot(client: PoolClient, user: UserProfile, clubId: string, lock: boolean): Promise<WorkspaceSnapshot> {
    const { role } = await authorize(client, clubId, user.id, false, lock ? 'update' : 'share')
    const sql = `SELECT w.state,w.version,r.reading,r.preferences
      FROM club_workspaces w JOIN club_reading_states r ON r.club_id=w.club_id
      WHERE w.club_id=$1 AND r.user_id=$2` + (lock ? ' FOR UPDATE OF w,r' : '')
    let { rows: [row] } = await client.query<WorkspaceRow>(sql, [clubId, user.id])
    if (!row) {
      await client.query('INSERT INTO club_workspaces (club_id,state) VALUES ($1,$2) ON CONFLICT DO NOTHING', [clubId, emptyWorkspace()])
      await client.query('INSERT INTO club_reading_states (club_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [clubId, user.id])
      const initialized = await client.query<WorkspaceRow>(sql, [clubId, user.id])
      row = initialized.rows[0]
    }
    const visibleBooks = new Set(row.state.books.map(book => book.id))
    const reading = Object.fromEntries(Object.entries(row.reading).filter(([id]) => visibleBooks.has(id)))
    return { ...row, reading, role, actorId: user.id }
  }
  private async present(client:PoolClient,value:WorkspaceSnapshot,user:UserProfile,clubId?:string,legacyForum=true):Promise<WorkspaceSnapshot>{
    if(!clubId)return value
    const events=await new EventService(this.pool).legacyEvents(client,clubId,legacyForum)
    const topics=await this.forum.legacyTopics(client,clubId,user.id,legacyForum)
    const {rows:[count]}=await client.query('SELECT count(*)::int AS count FROM forum_topics WHERE club_id=$1 AND deleted_at IS NULL',[clubId])
    return {...value,state:{...value.state,topics,events},forumCount:count.count}
  }
  get(user: UserProfile, clubId?: string, legacyForum = true): Promise<WorkspaceSnapshot> {
    if (!clubId) return this.personalSnapshot(this.pool, user, false)
    return transaction(this.pool, async client => {
      const snapshot = await this.clubSnapshot(client, user, clubId, false)
      return this.present(client, snapshot, user, clubId, legacyForum)
    })
  }
  async addLiteraryEdition(user: UserProfile, edition: FreeEdition) {
    return transaction(this.pool, async client => {
      const current = await this.personalSnapshot(client, user, true)
      const existing = current.state.books.find(book => book.metadata?.literaryEditionId === edition.id)
      if (existing) return { bookId: existing.id, created: false }
      const bookId = randomUUID()
      try {
        const next = applyWorkspaceAction(current, {
          type: 'book.add', title: edition.title, author: edition.author,
          category: genreLabels[edition.genres[0]] ?? '', content: '',
          metadata: {
            literaryEditionId: edition.id, literaryWorkId: edition.workId, language: edition.language,
            literaryEpub: edition.availability === 'internal' && edition.rights?.read === true,
            year: edition.year === null ? undefined : String(edition.year), source: edition.source, synopsis: edition.description,
            license: edition.rights?.license ?? 'Leitura conforme as condições da fonte externa.',
          },
        }, user, { id: bookId, now: new Date().toISOString(), personal: true })
        await this.savePersonal(client, user, next)
        return { bookId, created: true }
      } catch (error) {
        if (error instanceof WorkspaceError) throw new HttpError(409, error.code, error.message)
        throw error
      }
    })
  }

  private async savePersonal(client: PoolClient, user: UserProfile, next: WorkspaceSnapshot) {
    await client.query('UPDATE personal_workspaces SET state=$2,reading=$3,version=$4,preferences=$5,updated_at=now() WHERE user_id=$1', [user.id,next.state,next.reading,next.version,next.preferences])
  }

  async act(user: UserProfile, action: WorkspaceAction, version: number, clubId?: string,legacyForum=true):Promise<WorkspaceSnapshot> {
    if(clubId&&action.type.startsWith('event.')){await new EventService(this.pool).legacyAction(user,clubId,action,version);return this.get(user,clubId,legacyForum)}
    if(clubId&&(action.type==='topic.add'||action.type==='topic.reply'||action.type==='topic.like'||action.type==='topic.remove')){await this.forum.legacyAction(user,clubId,action,version);return this.get(user,clubId,legacyForum)}
    return transaction(this.pool, async client => {
      const current = clubId
        ? await this.clubSnapshot(client, user, clubId, true)
        : await this.personalSnapshot(client, user, true)
      if (!isPersonalAction(action) && version !== current.version) throw new HttpError(409,'WORKSPACE_CHANGED','O espaço foi atualizado. Confira os dados e tente novamente.')
      let next: WorkspaceSnapshot
      const entityId = randomUUID()
      try { next = applyWorkspaceAction(current,action,user,{id:entityId,now:new Date().toISOString(),personal:!clubId, ...(action.type==='draw' && current.state.nominations.length ? {drawIndex:randomInt(current.state.nominations.length)} : {})}) }
      catch(error) { if (error instanceof WorkspaceError) throw new HttpError(error.code==='FORBIDDEN'?403:error.code==='NOT_FOUND'?404:409,error.code,error.message); throw error }
      if (clubId) {
        if (isPersonalAction(action)) await client.query('UPDATE club_reading_states SET reading=$3,preferences=$4,updated_at=now() WHERE club_id=$1 AND user_id=$2',[clubId,user.id,next.reading,next.preferences])
        else {
          await client.query('UPDATE club_workspaces SET state=$2,version=$3,updated_at=now() WHERE club_id=$1',[clubId,next.state,next.version])
          if(action.type==='book.remove')await client.query("UPDATE club_book_files SET purge_after=CASE WHEN state='pending' THEN now()+interval '30 minutes' ELSE purge_after END,state='deleted',deleted_at=now() WHERE club_id=$1 AND book_id=$2 AND state IN ('pending','active')",[clubId,action.id])
          await client.query('INSERT INTO audit_logs(club_id,actor_user_id,action,entity_id) VALUES($1,$2,$3,$4)',[clubId,user.id,action.type,entityId])
          const notifiedBook=action.type==='book.add'?entityId:((action.type==='book.current'||action.type==='draw')?next.state.currentBookId:null)
          if(notifiedBook)await client.query(`SELECT emit_notification(m.user_id,$2,m.club_id,$4,'book',$3,NULL,'readings',$5) FROM club_memberships m WHERE m.club_id=$1 AND m.status='active'`,[clubId,user.id,notifiedBook,action.type==='book.add'?'book':'reading',action.type+':'+notifiedBook+':'+next.version])
        }
      } else {
        await this.savePersonal(client,user,next)
        if (action.type === 'book.remove' || action.type === 'workspace.import') {
          const bookIds = next.state.books.map((book) => book.id)
          await client.query("UPDATE private_book_files SET purge_after=CASE WHEN state='pending' THEN now()+interval '30 minutes' ELSE purge_after END,state='deleted',deleted_at=now() WHERE owner_user_id=$1 AND state IN ('active','pending') AND NOT(book_id=ANY($2::uuid[]))",[user.id,bookIds])
          await pruneIntegrations(client, user.id, bookIds)
        }
      }
      return this.present(client,next,user,clubId,legacyForum)
    })
  }
}
