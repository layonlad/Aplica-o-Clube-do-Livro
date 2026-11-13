import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { WorkspaceService } from '../src/workspace-service.js'
import { emptyWorkspace } from '../src/workspace-model.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { HttpError } from '../src/errors.js'
import { hashToken } from '../src/service.js'
import { migrate } from '../src/migrations.js'
import { testDatabase } from './database.js'
import type { Club, CreatedInvite, Session } from '../src/contracts.js'
import type { WorkspaceSnapshot } from '../src/workspace-model.js'
import {strToU8,zipSync} from 'fflate'
import {PrivateFiles} from '../src/private-files.js'

let db: Awaited<ReturnType<typeof testDatabase>>
let app: Awaited<ReturnType<typeof buildApp>>
let owner: Session
let club: Club
const identity = (uid: string) => ({ uid, email: `${uid}@example.com`, emailVerified: uid !== 'unverified', name: uid })
const headers = (uid = 'owner') => ({ authorization: `Bearer ${uid}` })
async function createInvite(input: Record<string, unknown> = {}, clubId = club.id) {
  const response = await app.inject({ method: 'POST', url: `/v1/clubs/${clubId}/invites`, headers: headers(), payload: input })
  expect(response.statusCode).toBe(201)
  return response.json<CreatedInvite>()
}
const addresses = new Map<string, string>()
async function accept(token: string, uid: string) {
  if (!addresses.has(uid)) addresses.set(uid, `127.0.0.${addresses.size + 2}`)
  return app.inject({ method: 'POST', url: '/v1/invites/accept', headers: headers(uid), payload: { token }, remoteAddress: addresses.get(uid) })
}

beforeAll(async () => {
  db = await testDatabase()
  app = await buildApp({ pool: db.pool, origin: 'https://club.example', rateMax: 1000, verifyToken: async (token) => {
    if (token === 'invalid') throw new HttpError(401, 'INVALID_SESSION', 'Inválida')
    return identity(token)
  } })
  owner = (await app.inject({ url: '/v1/me', headers: headers() })).json()
  const response = await app.inject({ method: 'POST', url: '/v1/clubs', headers: headers(), payload: { name: 'Clube real' } })
  expect(response.statusCode).toBe(201)
  club = response.json()
})
afterAll(async () => { await app?.close(); await db?.close() })

describe('API com PostgreSQL real', () => {
  it('isola capacidades de proprietário, administrador, moderador e membro', async () => {
    const actorIds:Record<string,string>={}
    for(const uid of ['roles-owner','roles-admin','roles-peer','roles-moderator','roles-member']) actorIds[uid]=(await app.inject({url:'/v1/me',headers:headers(uid)})).json<Session>().user.id
    const privateClub=(await app.inject({url:'/v1/clubs',method:'POST',headers:headers('roles-owner'),payload:{name:'Papéis privados'}})).json<Club>()
    for(const uid of ['roles-admin','roles-peer','roles-moderator','roles-member'])await db.pool.query("INSERT INTO club_memberships(club_id,user_id,role) VALUES($1,$2,'member')",[privateClub.id,actorIds[uid]])
    const role=(actor:string,target:string,value:string)=>app.inject({url:`/v1/clubs/${privateClub.id}/members/${actorIds[target]}/role`,method:'POST',headers:headers(actor),payload:{role:value}})
    expect((await role('roles-owner','roles-admin','admin')).statusCode).toBe(204)
    expect((await role('roles-owner','roles-peer','admin')).statusCode).toBe(204)
    expect((await role('roles-owner','roles-moderator','moderator')).statusCode).toBe(204)
    expect((await role('roles-admin','roles-member','admin')).statusCode).toBe(403)
    expect((await role('roles-member','roles-member','owner')).statusCode).toBe(400)
    expect((await role('roles-owner','roles-owner','member')).statusCode).toBe(409)
    const invite=(uid:string)=>app.inject({url:`/v1/clubs/${privateClub.id}/invites`,method:'POST',headers:headers(uid),payload:{}})
    expect((await invite('roles-admin')).statusCode).toBe(201)
    expect((await invite('roles-moderator')).statusCode).toBe(403)
    expect((await app.inject({url:`/v1/clubs/${privateClub.id}/members/${actorIds['roles-peer']}`,method:'DELETE',headers:headers('roles-admin')})).statusCode).toBe(409)
    const workspaceUrl=`/v1/clubs/${privateClub.id}/workspace`
    const state=(await app.inject({url:workspaceUrl,headers:headers('roles-admin')})).json<WorkspaceSnapshot>()
    const book=await app.inject({url:workspaceUrl,method:'POST',headers:headers('roles-admin'),payload:{version:state.version,action:{type:'book.add',title:'Referência autorizada',author:'Autora',category:'',content:''}}})
    expect(book.statusCode).toBe(200)
    expect((await app.inject({url:workspaceUrl,method:'POST',headers:headers('roles-moderator'),payload:{version:book.json().version,action:{type:'book.add',title:'Sem permissão',author:'Autor',category:'',content:''}}})).statusCode).toBe(403)
    const topic=await app.inject({url:workspaceUrl,method:'POST',headers:headers('roles-member'),payload:{version:book.json().version,action:{type:'topic.add',title:'Discussão',body:'Texto',spoiler:false}}})
    expect(topic.statusCode).toBe(200)
    expect((await app.inject({url:workspaceUrl,method:'POST',headers:headers('roles-moderator'),payload:{version:topic.json().version,action:{type:'topic.remove',id:topic.json().state.topics[0].id}}})).statusCode).toBe(200)
    expect((await app.inject({url:`/v1/clubs/${privateClub.id}/leave`,method:'POST',headers:headers('roles-owner')})).statusCode).toBe(409)
    expect((await app.inject({url:`/v1/clubs/${privateClub.id}/leave`,method:'POST',headers:headers('roles-member')})).statusCode).toBe(204)
    expect((await app.inject({url:workspaceUrl,headers:headers('roles-member')})).statusCode).toBe(403)
    const actions=(await db.pool.query("SELECT action FROM audit_logs WHERE club_id=$1 ORDER BY id",[privateClub.id])).rows.map(row=>row.action)
    expect(actions).toContain('member.role.admin');expect(actions).toContain('member.left')
  })
  it('descobre somente clubes opt-in e aprova solicitações com isolamento, versão e paginação', async () => {
    await app.inject({url:'/v1/me',headers:headers('discover-owner')})
    const publicClubs:Club[]=[]
    for(let i=0;i<3;i++){
      const value=(await app.inject({url:'/v1/clubs',method:'POST',headers:headers('discover-owner'),payload:{name:`Descoberta única ${i}`}})).json<Club>();publicClubs.push(value)
      const settings=(await app.inject({url:`/v1/clubs/${value.id}/settings`,headers:headers('discover-owner')})).json()
      expect(settings.visibility).toBe('private')
      if(i<2)expect((await app.inject({url:`/v1/clubs/${value.id}/settings`,method:'POST',headers:headers('discover-owner'),payload:{...settings,visibility:'discoverable',description:'Conheça nosso grupo.'}})).statusCode).toBe(200)
      if(i===0)expect((await app.inject({url:`/v1/clubs/${value.id}/settings`,method:'POST',headers:headers('discover-owner'),payload:{...settings,visibility:'public'}})).statusCode).toBe(409)
    }
    await db.pool.query('UPDATE clubs SET created_at=$2 WHERE id=ANY($1::uuid[])',[publicClubs.map(club=>club.id),'2026-11-13T13:30:01.123456Z'])
    const first=await app.inject({url:'/v1/discover/clubs?q=Descoberta&limit=1'})
    expect(first.statusCode).toBe(200);expect(first.json().items).toHaveLength(1);expect(first.json().nextCursor).toBeTruthy()
    expect(first.body).not.toMatch(/email|owner_user_id|firebase_uid/)
    const second=(await app.inject({url:`/v1/discover/clubs?q=Descoberta&limit=1&cursor=${first.json().nextCursor}`})).json()
    expect(second.items).toHaveLength(1);expect(second.items[0].id).not.toBe(first.json().items[0].id);expect(second.nextCursor).toBeNull()
    expect([first.json().items[0].id,second.items[0].id]).not.toContain(publicClubs[2].id)
    expect((await app.inject({url:'/v1/discover/clubs?cursor=invalid'})).statusCode).toBe(400)
    const target=publicClubs[0].id
    expect((await app.inject({url:`/v1/clubs/${target}/workspace`,headers:headers('discover-reader')})).statusCode).toBe(403)
    expect((await app.inject({url:`/v1/clubs/${publicClubs[2].id}/join-requests`,method:'POST',headers:headers('discover-reader'),payload:{}})).statusCode).toBe(404)
    const request=await app.inject({url:`/v1/clubs/${target}/join-requests`,method:'POST',headers:headers('discover-reader'),payload:{message:'Gostaria de participar.'}})
    expect(request.statusCode).toBe(201)
    expect((await app.inject({url:`/v1/clubs/${target}/join-requests`,method:'POST',headers:headers('discover-reader'),payload:{}})).statusCode).toBe(409)
    expect((await app.inject({url:`/v1/clubs/${target}/join-requests`,headers:headers('discover-reader')})).statusCode).toBe(403)
    const queue=(await app.inject({url:`/v1/clubs/${target}/join-requests`,headers:headers('discover-owner')})).json()
    expect(queue.items[0]).toMatchObject({id:request.json().id,message:'Gostaria de participar.'})
    expect(JSON.stringify(queue)).not.toContain('@example.com')
    expect((await app.inject({url:`/v1/clubs/${publicClubs[1].id}/join-requests/${request.json().id}/review`,method:'POST',headers:headers('discover-owner'),payload:{decision:'approved'}})).statusCode).toBe(404)
    const results=await Promise.all([1,2].map(()=>app.inject({url:`/v1/clubs/${target}/join-requests/${request.json().id}/review`,method:'POST',headers:headers('discover-owner'),payload:{decision:'approved'}})))
    expect(results.map(result=>result.statusCode).sort()).toEqual([200,404])
    expect((await app.inject({url:`/v1/clubs/${target}/workspace`,headers:headers('discover-reader')})).statusCode).toBe(200)
    expect((await db.pool.query('SELECT count(*)::int AS count FROM club_memberships WHERE club_id=$1',[target])).rows[0].count).toBe(2)
  })

  it('migra a base 001/002 com conteúdo legado sem perder dados e sem reaplicar mudanças', async () => {
    const legacy = await testDatabase(false)
    try {
      await legacy.pool.query('CREATE TABLE schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())')
      const markers = []
      for (const name of ['001_identity_and_clubs.sql', '002_complete_workspace.sql']) {
        const sql = await readFile(new URL('../migrations/' + name, import.meta.url), 'utf8')
        const checksum = createHash('sha256').update(sql).digest('hex')
        await legacy.pool.query(sql)
        await legacy.pool.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [name, checksum])
        markers.push({name, checksum})
      }
      const {rows:[user]} = await legacy.pool.query("INSERT INTO users(firebase_uid,email,name) VALUES('migration-fixture','migration-fixture@example.com','Leitor') RETURNING id,email,name")
      const state = emptyWorkspace(), bookId = randomUUID()
      state.books.push({id:bookId,title:'Livro anterior',author:'Autora',category:'',content:'Texto original preservado.',createdBy:user.id,createdAt:new Date().toISOString()})
      const reading = {[bookId]:{percent:40,page:2,bookmark:1,rating:4,finishedAt:null}}
      await legacy.pool.query('INSERT INTO personal_workspaces(user_id,state,reading,version) VALUES($1,$2,$3,7)', [user.id,state,reading])
      await migrate(legacy.pool)
      await migrate(legacy.pool)
      const workspace = new WorkspaceService(legacy.pool), snapshot = await workspace.get(user)
      expect(snapshot.state).toEqual(state)
      expect(snapshot.reading).toEqual(reading)
      expect(snapshot.version).toBe(7)
      const next = await workspace.act(user,{type:'reading.update',id:bookId,favorite:true,expectedRevision:0},snapshot.version)
      expect(next.reading[bookId]).toMatchObject({...reading[bookId],favorite:true,revision:1})
      expect(next.state).toEqual(state)
      expect((await legacy.pool.query('SELECT name,checksum FROM schema_migrations WHERE name=ANY($1::text[]) ORDER BY name',[markers.map(m=>m.name)])).rows).toEqual(markers)
      expect((await legacy.pool.query('SELECT count(*)::int AS count FROM private_book_files')).rows[0].count).toBe(0)
    } finally { await legacy.close() }
  })

  it('recusa acesso anônimo, token inválido e e-mail não confirmado', async () => {
    expect((await app.inject({ url: '/v1/me' })).statusCode).toBe(401)
    expect((await app.inject({ url: '/v1/me', headers: headers('invalid') })).statusCode).toBe(401)
    expect((await app.inject({ url: '/v1/me', headers: headers('unverified') })).json().error.code).toBe('EMAIL_NOT_VERIFIED')
    expect((await db.pool.query("SELECT 1 FROM users WHERE firebase_uid = 'unverified'")).rowCount).toBe(0)
  })
  it('persiste clube, proprietário e auditoria; migrations são reaplicáveis', async () => {
    await migrate(db.pool)
    const session = (await app.inject({ url: '/v1/me', headers: headers() })).json<Session>()
    expect(session.clubs).toContainEqual({ ...club })
    expect((await db.pool.query("SELECT action FROM audit_logs WHERE club_id = $1", [club.id])).rows[0].action).toBe('club.created')
    await expect(db.pool.query('UPDATE audit_logs SET action = $1', ['tampered'])).rejects.toThrow('append-only')
  })
  it('não permite acessar outro clube, administrar como membro ou promover papel pelo payload', async () => {
    const invite = await createInvite()
    expect((await accept(invite.token, 'member')).statusCode).toBe(200)
    expect((await app.inject({ url: `/v1/clubs/${club.id}`, headers: headers('outsider') })).statusCode).toBe(403)
    expect((await app.inject({ url: `/v1/clubs/${club.id}/invites`, headers: headers('member') })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: `/v1/clubs/${club.id}/invites`, headers: headers('member'), payload: {} })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: '/v1/invites/accept', headers: headers('outsider'), payload: { token: invite.token, role: 'owner' } })).statusCode).toBe(400)
  })
  it('armazena somente hash e não expõe segredo ou hash nas listagens', async () => {
    const invite = await createInvite({ maxUses: 2 })
    const stored = (await db.pool.query('SELECT * FROM invites WHERE id = $1', [invite.id])).rows[0]
    expect(stored.token_hash).toBe(hashToken(invite.token))
    expect(JSON.stringify(stored)).not.toContain(invite.token)
    const list = await app.inject({ url: `/v1/clubs/${club.id}/invites`, headers: headers() })
    expect(list.body).not.toContain(invite.token)
    expect(list.body).not.toContain(stored.token_hash)
    expect(list.headers['cache-control']).toBe('no-store')
  })
  it('reserva convite por e-mail e consome um único uso mesmo em reenvio', async () => {
    const invite = await createInvite({ email: 'Target@Example.com' })
    expect((await accept(invite.token, 'wrong')).statusCode).toBe(400)
    expect((await accept(invite.token, 'target')).statusCode).toBe(200)
    expect((await accept(invite.token, 'target')).statusCode).toBe(200)
    expect((await db.pool.query('SELECT uses FROM invites WHERE id = $1', [invite.id])).rows[0].uses).toBe(1)
  })
  it('impede que duas pessoas consumam o último uso simultaneamente', async () => {
    const invite = await createInvite()
    const results = await Promise.all([accept(invite.token, 'race1'), accept(invite.token, 'race2')])
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400])
    expect((await db.pool.query('SELECT count(*)::int AS count FROM invite_acceptances WHERE invite_id = $1', [invite.id])).rows[0].count).toBe(1)
  })
  it('recusa convites revogados e expirados', async () => {
    const revoked = await createInvite()
    expect((await app.inject({ method: 'DELETE', url: `/v1/clubs/${club.id}/invites/${revoked.id}`, headers: headers() })).statusCode).toBe(204)
    expect((await accept(revoked.token, 'revoked')).statusCode).toBe(400)
    const expired = await createInvite()
    await db.pool.query("UPDATE invites SET created_at = now() - interval '2 days', expires_at = now() - interval '1 day' WHERE id = $1", [expired.id])
    expect((await accept(expired.token, 'expired')).statusCode).toBe(400)
  })
  it('revoga acesso do membro imediatamente e bloqueia retorno por convite', async () => {
    const invite = await createInvite({ maxUses: 2 })
    await accept(invite.token, 'removable')
    const member = (await app.inject({ url: '/v1/me', headers: headers('removable') })).json<Session>().user
    expect((await app.inject({ method: 'DELETE', url: `/v1/clubs/${club.id}/members/${member.id}`, headers: headers() })).statusCode).toBe(204)
    expect((await app.inject({ url: `/v1/clubs/${club.id}`, headers: headers('removable') })).statusCode).toBe(403)
    expect((await accept(invite.token, 'removable')).json().error.code).toBe('MEMBERSHIP_REMOVED')
    expect((await app.inject({ url: '/v1/me', headers: headers('removable') })).json<Session>().clubs).toEqual([])
    expect((await app.inject({ method: 'POST', url: `/v1/clubs/${club.id}/members/${member.id}/restore`, headers: headers() })).statusCode).toBe(204)
    expect((await app.inject({ url: `/v1/clubs/${club.id}`, headers: headers('removable') })).statusCode).toBe(200)
  })
  it('protege o proprietário e mantém as mutações restritas ao clube correto', async () => {
    expect((await app.inject({ method: 'DELETE', url: `/v1/clubs/${club.id}/members/${owner.user.id}`, headers: headers() })).json().error.code).toBe('OWNER_PROTECTED')
    const other = (await app.inject({ method: 'POST', url: '/v1/clubs', headers: headers(), payload: { name: 'Segundo clube' } })).json<Club>()
    const invite = await createInvite()
    expect((await app.inject({ method: 'DELETE', url: `/v1/clubs/${other.id}/invites/${invite.id}`, headers: headers() })).statusCode).toBe(404)
    expect((await app.inject({ method: 'DELETE', url: `/v1/clubs/${club.id}/members/${randomUUID()}`, headers: headers() })).statusCode).toBe(404)
  })
  it('valida limites e impede armazenar múltiplos usos em convite por e-mail', async () => {
    for (const payload of [{ maxUses: 51 }, { expiresInDays: 0 }, { email: 'a@example.com', maxUses: 2 }, { role: 'owner' }]) {
      expect((await app.inject({ method: 'POST', url: `/v1/clubs/${club.id}/invites`, headers: headers(), payload })).statusCode).toBe(400)
    }
    expect((await app.inject({ method: 'POST', url: '/v1/clubs', headers: headers(), payload: { name: 'Oi', timezone: 'Invalid/Zone' } })).statusCode).toBe(400)
  })
  it('aplica CORS exato e limite de requisições', async () => {
    const limited = await buildApp({ pool: db.pool, origin: 'https://club.example', rateMax: 2, verifyToken: async () => identity('rate') })
    try {
      const result = await limited.inject({ url: '/v1/me', headers: { ...headers(), origin: 'https://evil.example' } })
      expect(result.headers['access-control-allow-origin']).not.toBe('https://evil.example')
      await limited.inject({ url: '/v1/me', headers: headers() })
      expect((await limited.inject({ url: '/v1/me', headers: headers() })).statusCode).toBe(429)
    } finally { await limited.close() }
  })
  it('persiste o acervo do clube, limita a administração e mantém progresso privado por membro', async () => {
    const url=`/v1/clubs/${club.id}/workspace`
    let state=(await app.inject({url,headers:headers()})).json<WorkspaceSnapshot>()
    const added=await app.inject({method:'POST',url,headers:headers(),payload:{version:state.version,action:{type:'book.add',title:'Livro real',author:'Autora',category:'Romance',content:'Conteúdo original.'}}})
    expect(added.statusCode).toBe(200);state=added.json()
    const bookId=state.state.books[0].id
    expect((await app.inject({url,headers:headers('outsider')})).statusCode).toBe(403)
    expect((await app.inject({method:'POST',url,headers:headers('member'),payload:{version:state.version,action:{type:'book.remove',id:bookId}}})).statusCode).toBe(403)
    const progress=await app.inject({method:'POST',url,headers:headers('member'),payload:{version:state.version,action:{type:'reading.update',id:bookId,percent:100,rating:5}}})
    expect(progress.statusCode).toBe(200)
    expect(progress.json<WorkspaceSnapshot>().reading[bookId].finishedAt).toBeTruthy()
    expect((await app.inject({url,headers:headers()})).json<WorkspaceSnapshot>().reading[bookId]).toBeUndefined()
    expect((await app.inject({url,headers:headers('member')})).json<WorkspaceSnapshot>().reading[bookId].rating).toBe(5)
  })
  it('mantém o espaço pessoal separado dos outros usuários e clubes', async () => {
    const url='/v1/me/workspace'
    const state=(await app.inject({url,headers:headers('individual')})).json<WorkspaceSnapshot>()
    const result=await app.inject({method:'POST',url,headers:headers('individual'),payload:{version:state.version,action:{type:'topic.add',title:'Minha nota',body:'Só eu posso ver',spoiler:false}}})
    expect(result.statusCode).toBe(200)
    expect((await app.inject({url,headers:headers('other-individual')})).json<WorkspaceSnapshot>().state.topics).toEqual([])
    expect((await app.inject({url:`/v1/clubs/${club.id}/workspace`,headers:headers()})).body).not.toContain('Só eu posso ver')
    expect((await app.inject({url,headers:headers('individual')})).json<WorkspaceSnapshot>().state.topics[0].title).toBe('Minha nota')
  })
  it('registra uma única rodada de sorteio sob concorrência e recusa conteúdo administrativo forjado', async () => {
    const url=`/v1/clubs/${club.id}/workspace`
    let state=(await app.inject({url,headers:headers()})).json<WorkspaceSnapshot>()
    state=(await app.inject({method:'POST',url,headers:headers('member'),payload:{version:state.version,action:{type:'nomination.add',title:'Uma indicação',author:'Autora'}}})).json()
    expect((await app.inject({method:'POST',url,headers:headers('member'),payload:{version:state.version,action:{type:'draw'}}})).statusCode).toBe(403)
    expect((await app.inject({method:'POST',url,headers:headers('member'),payload:{version:state.version,action:{type:'topic.add',title:'Título',body:'Texto',spoiler:false,by:'owner'}}})).statusCode).toBe(400)
    const results=await Promise.all([1,2].map(()=>app.inject({method:'POST',url,headers:headers(),payload:{version:state.version,action:{type:'draw'}}})))
    expect(results.map(r=>r.statusCode).sort()).toEqual([200,409])
    const saved=(await app.inject({url,headers:headers()})).json<WorkspaceSnapshot>()
    expect(saved.state.draws).toHaveLength(1);expect(saved.state.nominations).toEqual([])
    expect((await db.pool.query("SELECT count(*)::int AS count FROM audit_logs WHERE club_id=$1 AND action='draw'",[club.id])).rows[0].count).toBe(1)
  })
  it('isola estantes, preferências e anotações de membros no mesmo clube',async()=>{
    const url=`/v1/clubs/${club.id}/workspace`
    const state=(await app.inject({url,headers:headers('member')})).json<WorkspaceSnapshot>()
    const book=state.state.books[0]
    const send=(action:unknown)=>app.inject({url,method:'POST',headers:headers('member'),payload:{version:state.version,action}})
    expect((await send({type:'shelf.add',name:'Minha estante privada'})).statusCode).toBe(200)
    expect((await send({type:'reading.annotate',id:book.id,start:0,end:8,quote:'Conteúdo',note:'Nota que não compartilhei'})).statusCode).toBe(200)
    const mine=(await app.inject({url,headers:headers('member')})).json<WorkspaceSnapshot>()
    const other=await app.inject({url,headers:headers()})
    expect(mine.preferences?.shelves).toContain('Minha estante privada')
    expect(mine.reading[book.id].annotations?.[0].note).toBe('Nota que não compartilhei')
    expect(other.body).not.toContain('Minha estante privada');expect(other.body).not.toContain('Nota que não compartilhei')
    const rejected=await send({type:'reading.update',id:book.id,percent:3,expectedRevision:0})
    expect(rejected.statusCode).toBe(409);expect(rejected.json().error.code).toBe('READING_CHANGED')
  })
  it('armazena e entrega EPUB original somente ao titular, sem expor chave de storage',async()=>{
    const objects=new Map<string,Buffer>();let failDelete=false;const storage={put:async(key:string,bytes:Buffer)=>{objects.set(key,bytes)},get:async(key:string)=>objects.get(key)!,remove:async(key:string)=>{if(failDelete)throw Error('temporary storage outage');objects.delete(key)}}
    const filesApp=await buildApp({pool:db.pool,origin:'https://club.example',verifyToken:async(token)=>identity(token),storage,rateMax:1000})
    try{
      const initial=(await filesApp.inject({url:'/v1/me/workspace',headers:headers('file-owner')})).json<WorkspaceSnapshot>()
      const created=(await filesApp.inject({url:'/v1/me/workspace',method:'POST',headers:headers('file-owner'),payload:{version:initial.version,action:{type:'book.add',title:'Meu arquivo',author:'Autora',category:'',content:'Texto próprio.'}}})).json<WorkspaceSnapshot>()
      const bookId=created.state.books[0].id
      const bytes=Buffer.from(zipSync({'mimetype':strToU8('application/epub+zip'),'META-INF/container.xml':strToU8('<rootfile full-path="book.opf"/>'),'book.opf':strToU8('<package/>')}))
      const payload={filename:'minha-leitura.epub',data:bytes.toString('base64')}
      const uploaded=await filesApp.inject({url:`/v1/me/book-files/${bookId}`,method:'POST',headers:headers('file-owner'),payload})
      expect(uploaded.statusCode).toBe(201);expect(uploaded.body).not.toContain('object_key');expect(uploaded.body).not.toContain('private-epub')
      const id=uploaded.json().id
      expect((await filesApp.inject({url:`/v1/me/book-files/${bookId}`,method:'POST',headers:headers('file-owner'),payload})).statusCode).toBe(409)
      expect((await filesApp.inject({url:`/v1/me/files/${id}/content`,headers:headers('outsider')})).statusCode).toBe(404)
      const downloaded=await filesApp.inject({url:`/v1/me/files/${id}/content`,headers:headers('file-owner')})
      expect(downloaded.statusCode).toBe(200);expect(downloaded.rawPayload.equals(bytes)).toBe(true);expect(downloaded.headers['cache-control']).toBe('no-store')
      expect((await filesApp.inject({url:`/v1/me/files/${id}`,method:'DELETE',headers:headers('outsider')})).statusCode).toBe(404)
      failDelete=true
      expect((await filesApp.inject({url:`/v1/me/files/${id}`,method:'DELETE',headers:headers('file-owner')})).statusCode).toBe(202)
      expect((await filesApp.inject({url:`/v1/me/files/${id}/content`,headers:headers('file-owner')})).statusCode).toBe(404);expect(objects.size).toBe(1)
      failDelete=false
      expect(await new PrivateFiles(db.pool,storage).cleanup()).toEqual({purged:1,failed:0});expect(objects.size).toBe(0)
      const replacement=await filesApp.inject({url:`/v1/me/book-files/${bookId}`,method:'POST',headers:headers('file-owner'),payload})
      expect(replacement.statusCode).toBe(201)
      const removed=await filesApp.inject({url:'/v1/me/workspace',method:'POST',headers:headers('file-owner'),payload:{version:created.version,action:{type:'book.remove',id:bookId}}})
      expect(removed.statusCode).toBe(200)
      expect((await filesApp.inject({url:`/v1/me/files/${replacement.json().id}/content`,headers:headers('file-owner')})).statusCode).toBe(404)
      expect(await new PrivateFiles(db.pool,storage).cleanup()).toEqual({purged:1,failed:0});expect(objects.size).toBe(0)
      expect((await filesApp.inject({url:`/v1/me/book-files/${bookId}`,method:'POST',payload:{data:'not base64'}})).statusCode).toBe(401)
    }finally{await filesApp.close()}
  })
})
