import {beforeAll,afterAll,expect,it} from 'vitest'
import {randomUUID} from 'node:crypto'
import sharp from 'sharp'
import {buildApp} from '../src/app.js'
import {testDatabase} from './database.js'
import {emptyWorkspace} from '../src/workspace-model.js'
import type {Club,Session} from '../src/contracts.js'
import type {ForumPage,ForumTopic} from '../src/forum-contracts.js'
let db:Awaited<ReturnType<typeof testDatabase>>,app:Awaited<ReturnType<typeof buildApp>>,club:Club,other:Club
const ids:Record<string,string>={},objects=new Map<string,Buffer>()
const headers=(uid='forum-owner')=>({authorization:`Bearer ${uid}`}),path=()=>`/v1/clubs/${club.id}/forum/topics`
const storage={put:async(key:string,bytes:Buffer)=>{objects.set(key,bytes)},get:async(key:string)=>objects.get(key)!,remove:async(key:string)=>{objects.delete(key)}}
async function topic(input:Record<string,unknown>={},uid='forum-member'){const result=await app.inject({url:path(),method:'POST',headers:headers(uid),payload:{title:'Uma discussão',body:'Um pensamento para conversar.',...input}});expect(result.statusCode,result.body).toBe(201);return result.json<{id:string}>().id}
beforeAll(async()=>{
  db=await testDatabase();app=await buildApp({pool:db.pool,origin:'https://club.example',storage,rateMax:2000,verifyToken:async uid=>({uid,email:uid+'@example.com',name:uid,emailVerified:true})})
  for(const uid of ['forum-owner','forum-member','forum-moderator','forum-other'])ids[uid]=(await app.inject({url:'/v1/me',headers:headers(uid)})).json<Session>().user.id
  club=(await app.inject({url:'/v1/clubs',method:'POST',headers:headers(),payload:{name:'Fórum privado A'}})).json<Club>()
  other=(await app.inject({url:'/v1/clubs',method:'POST',headers:headers(),payload:{name:'Fórum privado B'}})).json<Club>()
  await db.pool.query("INSERT INTO club_memberships(club_id,user_id,role) VALUES($1,$2,'member'),($1,$3,'moderator'),($4,$5,'member')",[club.id,ids['forum-member'],ids['forum-moderator'],other.id,ids['forum-other']])
})
afterAll(async()=>{await app?.close();await db?.close()})
it('modera, fixa e encerra sem permitir respostas nem contorno pela API antiga',async()=>{
  const id=await topic({spoiler:true}),url=path()+'/'+id
  expect((await app.inject({url,headers:headers('forum-other')})).statusCode).toBe(404)
  expect((await app.inject({url})).statusCode).toBe(401)
  expect((await app.inject({url:url+'/moderation',method:'POST',headers:headers('forum-member'),payload:{version:0,closed:true}})).statusCode).toBe(403)
  expect((await app.inject({url:url+'/moderation',method:'POST',headers:headers('forum-moderator'),payload:{version:0,pinned:true,closed:true}})).statusCode).toBe(200)
  const current=(await app.inject({url,headers:headers('forum-member')})).json<ForumTopic>();expect(current.closed).toBe(true);expect(current.pinned).toBe(true)
  expect((await app.inject({url:url+'/replies',method:'POST',headers:headers('forum-member'),payload:{body:'Resposta bloqueada'}})).json().error.code).toBe('TOPIC_CLOSED')
  const state=(await app.inject({url:`/v1/clubs/${club.id}/workspace`,headers:headers('forum-member')})).json()
  expect(state.state.topics.some((item:{id:string})=>item.id===id)).toBe(true)
  const legacy=await app.inject({url:`/v1/clubs/${club.id}/workspace`,method:'POST',headers:headers('forum-member'),payload:{version:state.version,action:{type:'topic.reply',id,body:'Contorno antigo bloqueado'}}})
  expect(legacy.json().error.code).toBe('TOPIC_CLOSED')
  expect((await app.inject({url:url+'/moderation',method:'POST',headers:headers('forum-moderator'),payload:{version:0,closed:false}})).statusCode).toBe(409)
  expect((await app.inject({url:url+'/moderation',method:'POST',headers:headers('forum-moderator'),payload:{version:current.version,closed:false}})).statusCode).toBe(200)
  expect((await app.inject({url:url+'/replies',method:'POST',headers:headers('forum-member'),payload:{body:'Agora pode responder',spoiler:true}})).statusCode).toBe(201)
  const list=(await app.inject({url:path(),headers:headers('forum-member')})).json<ForumPage>();expect(list.pinned.some(item=>item.id===id)).toBe(true);expect(list.items.some(item=>item.id===id)).toBe(false)
})
it('pagina tópicos e mantém like único, edição própria e respostas no recurso correto',async()=>{
  const first=await topic({title:'Página alfa'}),second=await topic({title:'Página beta'})
  await db.pool.query('UPDATE forum_topics SET created_at=$2 WHERE id=ANY($1::uuid[])',[[first,second],'2026-11-13T14:15:20.123456Z'])
  const page=(await app.inject({url:path()+'?q=Página&limit=1',headers:headers('forum-member')})).json<ForumPage>()
  const next=(await app.inject({url:path()+'?q=Página&limit=1&cursor='+page.nextCursor,headers:headers('forum-member')})).json<ForumPage>()
  expect(page.items).toHaveLength(1);expect(next.items).toHaveLength(1);expect(page.items[0].id).not.toBe(next.items[0].id);expect(next.nextCursor).toBeNull()
  const url=path()+'/'+first
  await Promise.all([1,2].map(()=>app.inject({url:url+'/like',method:'POST',headers:headers(),payload:{value:true}})))
  expect((await app.inject({url,headers:headers()})).json().likes).toBe(1)
  expect((await app.inject({url:url+'/edit',method:'POST',headers:headers('forum-moderator'),payload:{title:'Título alterado por outro',body:'Indevido',spoiler:false,version:0}})).statusCode).toBe(403)
  expect((await app.inject({url:url+'/edit',method:'POST',headers:headers('forum-member'),payload:{title:'Minha discussão revista',body:'Edição confirmada.',spoiler:false,version:0}})).statusCode).toBe(200)
  expect((await app.inject({url:url+'/edit',method:'POST',headers:headers('forum-member'),payload:{title:'Edição obsoleta',body:'Obsoleta',spoiler:false,version:0}})).statusCode).toBe(409)
  const reply=(await app.inject({url:url+'/replies',method:'POST',headers:headers(),payload:{body:'Uma resposta com spoiler',spoiler:true}})).json<{id:string}>()
  expect((await app.inject({url:path()+`/${second}/replies/${reply.id}`,method:'DELETE',headers:headers()})).statusCode).toBe(404)
  expect((await app.inject({url:url+`/replies/${reply.id}`,method:'DELETE',headers:headers('forum-member')})).statusCode).toBe(403)
  expect((await app.inject({url:url+`/replies/${reply.id}`,method:'DELETE',headers:headers('forum-moderator')})).statusCode).toBe(204)
  expect((await app.inject({url,headers:headers()})).body).not.toMatch(/@example.com|firebase_uid/)
})
it('mantém fotos do fórum acessíveis ao retirar vínculo de álbum e revoga após excluir discussão',async()=>{
  const bytes=await sharp({create:{width:64,height:40,channels:3,background:'#704480'}}).png().toBuffer()
  const uploaded=await app.inject({url:`/v1/clubs/${club.id}/media`,method:'POST',headers:headers(),payload:{kind:'image',data:bytes.toString('base64')}});expect(uploaded.statusCode).toBe(201)
  const mediaId=uploaded.json().id,id=await topic({mediaIds:[mediaId]},'forum-owner')
  const get=()=>app.inject({url:`/v1/media/${mediaId}/content`,headers:headers('forum-member')})
  expect((await get()).statusCode).toBe(200)
  const album=(await app.inject({url:`/v1/clubs/${club.id}/albums`,method:'POST',headers:headers(),payload:{title:'Um encontro',eventDate:'2026-11-13'}})).json<{id:string}>()
  expect((await app.inject({url:`/v1/clubs/${club.id}/albums/${album.id}/photos`,method:'POST',headers:headers(),payload:{mediaIds:[mediaId]}})).statusCode).toBe(201)
  expect((await app.inject({url:`/v1/clubs/${club.id}/albums/${album.id}/photos/${mediaId}`,method:'DELETE',headers:headers()})).statusCode).toBe(204)
  expect((await get()).statusCode).toBe(200)
  expect((await app.inject({url:path()+'/'+id,method:'DELETE',headers:headers()})).statusCode).toBe(204)
  expect((await get()).statusCode).toBe(404)
})
it('reconcilia escritas de uma instância antiga sem duplicar nem sobrescrever edição nova',async()=>{
  const legacy=emptyWorkspace(),id=randomUUID(),replyId=randomUUID(),at='2026-11-13T13:00:00.000Z'
  legacy.topics.push({id,title:'Legado durante rollout',body:'Texto legado.',by:ids['forum-owner'],name:'forum-owner',at,spoiler:false,likedBy:[ids['forum-member']],replies:[]})
  await db.pool.query('INSERT INTO club_workspaces(club_id,state) VALUES($1,$2) ON CONFLICT(club_id) DO UPDATE SET state=$2,version=club_workspaces.version+1',[club.id,legacy])
  const importedResponse=await app.inject({url:path()+'/'+id,headers:headers('forum-member')});expect(importedResponse.statusCode,importedResponse.body).toBe(200);const imported=importedResponse.json<ForumTopic>();expect(imported.body).toBe('Texto legado.');expect(imported.likes).toBe(1)
  expect((await app.inject({url:path()+`/${id}/edit`,method:'POST',headers:headers(),payload:{title:imported.title,body:'Edição na estrutura nova.',spoiler:false,version:0}})).statusCode).toBe(200)
  const modern=await topic({title:'Só existe no fórum novo'})
  legacy.topics[0].replies.push({id:replyId,body:'Resposta antiga durante a troca.',by:ids['forum-owner'],name:'forum-owner',at});legacy.topics[0].likedBy=[]
  await db.pool.query('UPDATE club_workspaces SET state=$2,version=version+1 WHERE club_id=$1',[club.id,legacy])
  const current=(await app.inject({url:path()+'/'+id,headers:headers('forum-member')})).json<ForumTopic>();expect(current.body).toBe('Edição na estrutura nova.');expect(current.likes).toBe(0);expect(current.replies).toBe(1)
  await app.inject({url:path()+'/'+id,headers:headers()})
  expect((await db.pool.query('SELECT count(*)::int AS count FROM forum_replies WHERE id=$1',[replyId])).rows[0].count).toBe(1)
  legacy.topics=[];await db.pool.query('UPDATE club_workspaces SET state=$2,version=version+1 WHERE club_id=$1',[club.id,legacy])
  expect((await app.inject({url:path()+'/'+id,headers:headers()})).statusCode).toBe(404)
  expect((await app.inject({url:path()+'/'+modern,headers:headers('forum-member')})).statusCode).toBe(200)
})
