import { randomInt, randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import type { UserProfile } from './contracts.js'
import { transaction } from './database.js'
import { HttpError } from './errors.js'
import { authorize } from './service.js'
import { applyWorkspaceAction, emptyWorkspace, isPersonalAction, WorkspaceError, type WorkspaceAction, type WorkspaceSnapshot } from './workspace-model.js'

export class WorkspaceService {
  constructor(private pool: Pool) {}
  private async load(client: PoolClient, user: UserProfile, clubId?: string): Promise<WorkspaceSnapshot> {
    const role = clubId ? (await authorize(client, clubId, user.id)).role : 'owner'
    if (clubId) {
      await client.query('INSERT INTO club_workspaces (club_id,state) VALUES ($1,$2) ON CONFLICT DO NOTHING', [clubId, emptyWorkspace()])
      await client.query('INSERT INTO club_reading_states (club_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [clubId, user.id])
      const { rows: [row] } = await client.query('SELECT w.state,w.version,r.reading,r.preferences FROM club_workspaces w JOIN club_reading_states r ON r.club_id=w.club_id WHERE w.club_id=$1 AND r.user_id=$2 FOR UPDATE OF w,r', [clubId,user.id])
      row.reading=Object.fromEntries(Object.entries(row.reading).filter(([id])=>row.state.books.some((book:{id:string})=>book.id===id)))
      return { ...row, role, actorId: user.id }
    }
    await client.query('INSERT INTO personal_workspaces (user_id,state) VALUES ($1,$2) ON CONFLICT DO NOTHING', [user.id,emptyWorkspace()])
    const { rows: [row] } = await client.query('SELECT state,reading,version,preferences FROM personal_workspaces WHERE user_id=$1 FOR UPDATE', [user.id])
    return { ...row, role, actorId: user.id }
  }
  get(user: UserProfile, clubId?: string) { return transaction(this.pool, client => this.load(client,user,clubId)) }
  act(user: UserProfile, action: WorkspaceAction, version: number, clubId?: string) {
    return transaction(this.pool, async client => {
      const current = await this.load(client,user,clubId)
      if (!isPersonalAction(action) && version !== current.version) throw new HttpError(409,'WORKSPACE_CHANGED','O espaço foi atualizado. Confira os dados e tente novamente.')
      let next: WorkspaceSnapshot
      const entityId = randomUUID()
      try { next = applyWorkspaceAction(current,action,user,{id:entityId,now:new Date().toISOString(),personal:!clubId, ...(action.type==='draw' && current.state.nominations.length ? {drawIndex:randomInt(current.state.nominations.length)} : {})}) }
      catch(error) { if (error instanceof WorkspaceError) throw new HttpError(error.code==='FORBIDDEN'?403:error.code==='NOT_FOUND'?404:409,error.code,error.message); throw error }
      if (clubId) {
        if (isPersonalAction(action)) await client.query('UPDATE club_reading_states SET reading=$3,preferences=$4,updated_at=now() WHERE club_id=$1 AND user_id=$2',[clubId,user.id,next.reading,next.preferences])
        else {
          await client.query('UPDATE club_workspaces SET state=$2,version=$3,updated_at=now() WHERE club_id=$1',[clubId,next.state,next.version])
          await client.query('INSERT INTO audit_logs(club_id,actor_user_id,action,entity_id) VALUES($1,$2,$3,$4)',[clubId,user.id,action.type,entityId])
        }
      } else {
        await client.query('UPDATE personal_workspaces SET state=$2,reading=$3,version=$4,preferences=$5,updated_at=now() WHERE user_id=$1',[user.id,next.state,next.reading,next.version,next.preferences])
        if(action.type==='book.remove'||action.type==='workspace.import')await client.query("UPDATE private_book_files SET state='deleted',deleted_at=now() WHERE owner_user_id=$1 AND state IN ('active','pending') AND NOT(book_id=ANY($2::uuid[]))",[user.id,next.state.books.map(book=>book.id)])
      }
      return next
    })
  }
}
