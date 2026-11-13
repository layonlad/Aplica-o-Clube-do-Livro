import type {PostDto} from './community-contracts.js'
import type {Pool,PoolClient} from 'pg'
import type {UserProfile,Role} from './contracts.js'
import {transaction} from './database.js'
import {authorize} from './service.js'
import {can} from './permissions.js'
import {HttpError} from './errors.js'
import {decodeCursor,pageOf} from './pagination.js'
export interface NewPost {kind:'reflection'|'review'|'quote'|'question'|'poll'|'meeting'|'recommendation'|'achievement'|'announcement';body:string;bookTitle:string;bookAuthor:string;quote:string;source:string;mediaIds:string[];options:string[]}
export interface PostQuery {limit:number;cursor?:string;q?:string;kind?:NewPost['kind'];from?:string;until?:string}
const missing=()=>new HttpError(404,'POST_NOT_FOUND','Esta publicação não está disponível.')
const columns=`p.id,p.kind,p.body,p.book_title AS "bookTitle",p.book_author AS "bookAuthor",p.quote,p.source,p.version,p.created_at AS "createdAt",p.updated_at AS "updatedAt",p.created_at::text AS "sortTime",
  jsonb_build_object('id',u.id,'name',u.name) AS author,
  (SELECT count(*)::int FROM post_likes l WHERE l.post_id=p.id) AS likes,
  (SELECT count(*)::int FROM post_comments c WHERE c.post_id=p.id AND c.deleted_at IS NULL) AS comments,
  EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id=p.id AND l.user_id=$2) AS liked,
  EXISTS(SELECT 1 FROM saved_posts s WHERE s.post_id=p.id AND s.user_id=$2) AS saved,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'width',m.width,'height',m.height,'duration',m.duration) ORDER BY pm.position) FROM post_media pm JOIN media_objects m ON m.id=pm.media_id WHERE pm.post_id=p.id AND m.state='active'),'[]') AS media,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'label',o.label,'votes',(SELECT count(*)::int FROM post_poll_votes v WHERE v.option_id=o.id),'selected',EXISTS(SELECT 1 FROM post_poll_votes v WHERE v.option_id=o.id AND v.user_id=$2)) ORDER BY o.position) FROM post_poll_options o WHERE o.post_id=p.id),'[]') AS options`
export class PostService{
  constructor(private pool:Pool){}
  private async access(client:PoolClient,user:UserProfile,clubId:string,read=false){
    try{return await authorize(client,clubId,user.id,false,read?'share':'update')}catch(error){if(error instanceof HttpError&&error.statusCode===403)throw missing();throw error}
  }
  private async post(client:PoolClient,clubId:string,id:string){const {rows:[row]}=await client.query('SELECT id,author_user_id,kind,version FROM social_posts WHERE id=$1 AND club_id=$2 AND audience=\'club\' AND deleted_at IS NULL FOR UPDATE',[id,clubId]);if(!row)throw missing();return row as {id:string;author_user_id:string;kind:string;version:number}}
  private async tags(client:PoolClient,id:string,text:string){
    await client.query('DELETE FROM post_tags WHERE post_id=$1',[id])
    const tags=[...new Set([...text.matchAll(/#([\p{L}\p{N}_]{1,50})/gu)].map(match=>match[1].toLocaleLowerCase()))].slice(0,20)
    if(tags.length)await client.query('INSERT INTO post_tags(post_id,tag) SELECT $1,unnest($2::text[])',[id,tags])
  }
  private dto(row:Omit<PostDto,'canEdit'|'canDelete'>&{sortTime:string},actor:string,role:Role){return {...row,canEdit:row.author.id===actor,canDelete:row.author.id===actor||can(role,'moderate')}}
  list(user:UserProfile,clubId:string,input:PostQuery){return transaction(this.pool,async client=>{
    const club=await this.access(client,user,clubId,true),cursor=decodeCursor(input.cursor)
    const {rows}=await client.query(`SELECT ${columns} FROM social_posts p JOIN users u ON u.id=p.author_user_id WHERE p.club_id=$1 AND p.audience='club' AND p.deleted_at IS NULL
      AND ($3::timestamptz IS NULL OR (p.created_at,p.id)<($3,$4::uuid))
      AND ($5::text IS NULL OR (p.body||' '||p.book_title||' '||p.book_author) ILIKE '%'||$5||'%')
      AND ($6::text IS NULL OR p.kind=$6) AND ($7::timestamptz IS NULL OR p.created_at>=$7) AND ($8::timestamptz IS NULL OR p.created_at<$8)
      ORDER BY p.created_at DESC,p.id DESC LIMIT $9`,[clubId,user.id,cursor?.time??null,cursor?.id??null,input.q??null,input.kind??null,input.from??null,input.until??null,input.limit+1])
    return pageOf(rows.map(row=>this.dto(row,user.id,club.role)),input.limit)
  })}
  get(user:UserProfile,clubId:string,id:string){return transaction(this.pool,async client=>{
    const club=await this.access(client,user,clubId,true)
    const {rows:[row]}=await client.query(`SELECT ${columns} FROM social_posts p JOIN users u ON u.id=p.author_user_id WHERE p.club_id=$1 AND p.id=$3 AND p.audience='club' AND p.deleted_at IS NULL`,[clubId,user.id,id]);if(!row)throw missing()
    const {sortTime:_,...dto}=this.dto(row,user.id,club.role);return dto
  })}
  create(user:UserProfile,clubId:string,input:NewPost){return transaction(this.pool,async client=>{
    const club=await this.access(client,user,clubId)
    if(input.kind==='announcement'&&!can(club.role,'manageEvents'))throw new HttpError(403,'ACCESS_DENIED','Somente a administração publica comunicados.')
    if(input.kind==='poll'&&(input.options.length<2||new Set(input.options).size!==input.options.length))throw new HttpError(400,'INVALID_POLL','A enquete precisa de duas a seis opções diferentes.')
    if(input.kind!=='poll'&&input.options.length)throw new HttpError(400,'INVALID_POLL','Opções de votação só podem ser usadas em enquetes.')
    const {rows:[post]}=await client.query("INSERT INTO social_posts(author_user_id,club_id,audience,kind,body,book_title,book_author,quote,source) VALUES($1,$2,'club',$3,$4,$5,$6,$7,$8) RETURNING id",[user.id,clubId,input.kind,input.body,input.bookTitle,input.bookAuthor,input.quote,input.source])
    for(const [position,id] of input.mediaIds.entries()){
      const media=await client.query("SELECT id FROM media_objects WHERE id=$1 AND club_id=$2 AND owner_user_id=$3 AND state='active' FOR UPDATE",[id,clubId,user.id]);if(!media.rowCount)throw new HttpError(400,'INVALID_MEDIA','Use somente mídias suas enviadas para este clube.')
      await client.query('INSERT INTO post_media(post_id,media_id,scope_id,position) VALUES($1,$2,$3,$4)',[post.id,id,clubId,position])
    }
    for(const [position,label] of input.options.entries())await client.query('INSERT INTO post_poll_options(post_id,label,position) VALUES($1,$2,$3)',[post.id,label,position])
    await this.tags(client,post.id,input.body)
    return {id:post.id}
  })}
  edit(user:UserProfile,clubId:string,id:string,input:{body:string;quote:string;source:string;version:number}){return transaction(this.pool,async client=>{
    await this.access(client,user,clubId);const post=await this.post(client,clubId,id)
    if(post.author_user_id!==user.id)throw new HttpError(403,'ACCESS_DENIED','Você só pode editar suas próprias publicações.')
    if(post.version!==input.version)throw new HttpError(409,'POST_CHANGED','A publicação mudou. Atualize antes de editar.')
    await client.query('UPDATE social_posts SET body=$2,quote=$3,source=$4,version=version+1,updated_at=now() WHERE id=$1',[id,input.body,input.quote,input.source]);await this.tags(client,id,input.body);return {updated:true}
  })}
  remove(user:UserProfile,clubId:string,id:string){return transaction(this.pool,async client=>{
    const club=await this.access(client,user,clubId);const post=await this.post(client,clubId,id)
    if(post.author_user_id!==user.id&&!can(club.role,'moderate'))throw new HttpError(403,'ACCESS_DENIED','Você só pode excluir suas publicações.')
    await client.query("UPDATE social_posts SET deleted_at=now(),body='Publicação excluída',quote='',book_title='',book_author='',source='',version=version+1 WHERE id=$1",[id])
    await client.query('DELETE FROM post_tags WHERE post_id=$1',[id])
    await client.query("INSERT INTO audit_logs(club_id,actor_user_id,action,entity_id) VALUES($1,$2,'post.deleted',$3)",[clubId,user.id,id])
  })}
  react(user:UserProfile,clubId:string,id:string,kind:'like'|'save',value:boolean){return transaction(this.pool,async client=>{
    await this.access(client,user,clubId);await this.post(client,clubId,id)
    const table=kind==='like'?'post_likes':'saved_posts'
    if(value)await client.query(`INSERT INTO ${table}(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[id,user.id])
    else await client.query(`DELETE FROM ${table} WHERE post_id=$1 AND user_id=$2`,[id,user.id]);return {value}
  })}
  vote(user:UserProfile,clubId:string,id:string,optionId:string){return transaction(this.pool,async client=>{
    await this.access(client,user,clubId);const post=await this.post(client,clubId,id)
    if(post.kind!=='poll')throw new HttpError(400,'INVALID_POLL','Esta publicação não é uma enquete.')
    const option=await client.query('SELECT 1 FROM post_poll_options WHERE id=$1 AND post_id=$2',[optionId,id]);if(!option.rowCount)throw missing()
    await client.query('INSERT INTO post_poll_votes(post_id,option_id,user_id) VALUES($1,$2,$3) ON CONFLICT(post_id,user_id) DO UPDATE SET option_id=EXCLUDED.option_id',[id,optionId,user.id]);return {voted:true}
  })}
  comments(user:UserProfile,clubId:string,id:string,input:{limit:number;cursor?:string}){return transaction(this.pool,async client=>{
    const club=await this.access(client,user,clubId,true)
    const post=await client.query("SELECT 1 FROM social_posts WHERE id=$1 AND club_id=$2 AND audience='club' AND deleted_at IS NULL",[id,clubId]);if(!post.rowCount)throw missing()
    const cursor=decodeCursor(input.cursor)
    const {rows}=await client.query(`SELECT c.id,c.parent_id AS "parentId",CASE WHEN c.deleted_at IS NULL THEN c.body ELSE '' END AS body,c.version,c.created_at AS "createdAt",c.created_at::text AS "sortTime",c.deleted_at IS NOT NULL AS deleted,
      CASE WHEN c.deleted_at IS NULL THEN jsonb_build_object('id',u.id,'name',u.name) ELSE NULL END AS author,
      (SELECT count(*)::int FROM comment_likes l WHERE l.comment_id=c.id) AS likes,EXISTS(SELECT 1 FROM comment_likes l WHERE l.comment_id=c.id AND l.user_id=$2) AS liked,
      (c.author_user_id=$2 OR $6::boolean) AND c.deleted_at IS NULL AS "canDelete"
      FROM post_comments c JOIN users u ON u.id=c.author_user_id WHERE c.post_id=$1 AND ($3::timestamptz IS NULL OR (c.created_at,c.id)<($3,$4::uuid)) ORDER BY c.created_at DESC,c.id DESC LIMIT $5`,[id,user.id,cursor?.time??null,cursor?.id??null,input.limit+1,can(club.role,'moderate')])
    return pageOf(rows,input.limit)
  })}
  comment(user:UserProfile,clubId:string,id:string,input:{body:string;parentId?:string}){return transaction(this.pool,async client=>{
    await this.access(client,user,clubId);await this.post(client,clubId,id)
    if(input.parentId){const {rows:[parent]}=await client.query('SELECT parent_id,deleted_at FROM post_comments WHERE id=$1 AND post_id=$2',[input.parentId,id]);if(!parent||parent.deleted_at)throw missing();if(parent.parent_id)throw new HttpError(400,'REPLY_DEPTH','Responda ao comentário original para manter a conversa organizada.')}
    const {rows:[row]}=await client.query('INSERT INTO post_comments(post_id,author_user_id,body,parent_id) VALUES($1,$2,$3,$4) RETURNING id',[id,user.id,input.body,input.parentId??null]);return row
  })}
  removeComment(user:UserProfile,clubId:string,id:string,commentId:string){return transaction(this.pool,async client=>{
    const club=await this.access(client,user,clubId);await this.post(client,clubId,id)
    const {rows:[comment]}=await client.query('SELECT author_user_id FROM post_comments WHERE id=$1 AND post_id=$2 AND deleted_at IS NULL FOR UPDATE',[commentId,id]);if(!comment)throw missing()
    if(comment.author_user_id!==user.id&&!can(club.role,'moderate'))throw new HttpError(403,'ACCESS_DENIED','Você só pode excluir seus comentários.')
    await client.query("UPDATE post_comments SET body='Comentário excluído',deleted_at=now(),version=version+1 WHERE id=$1",[commentId])
    await client.query("INSERT INTO audit_logs(club_id,actor_user_id,action,entity_id) VALUES($1,$2,'comment.deleted',$3)",[clubId,user.id,commentId])
  })}
  likeComment(user:UserProfile,clubId:string,id:string,commentId:string,value:boolean){return transaction(this.pool,async client=>{
    await this.access(client,user,clubId);await this.post(client,clubId,id)
    const comment=await client.query('SELECT 1 FROM post_comments WHERE id=$1 AND post_id=$2 AND deleted_at IS NULL',[commentId,id]);if(!comment.rowCount)throw missing()
    if(value)await client.query('INSERT INTO comment_likes(comment_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[commentId,user.id]);else await client.query('DELETE FROM comment_likes WHERE comment_id=$1 AND user_id=$2',[commentId,user.id]);return {value}
  })}
}
