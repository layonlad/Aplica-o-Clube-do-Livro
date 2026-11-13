import type {Pool,PoolClient} from 'pg'
import type {UserProfile} from './contracts.js'
import {transaction} from './database.js'
import {authorize} from './service.js'
import {can} from './permissions.js'
import {HttpError} from './errors.js'
import {decodeCursor,pageOf} from './pagination.js'
export interface AlbumInput {title:string;description:string;eventId?:string|null;eventDate:string;allowMemberUpload:boolean;allowDownload:boolean}
const missing=()=>new HttpError(404,'ALBUM_NOT_FOUND','Este álbum não está disponível.')
const denied=()=>new HttpError(403,'ACCESS_DENIED','Você não tem permissão para alterar este álbum.')
export class AlbumService {
  constructor(private pool:Pool){}
  private async access(client:PoolClient,user:UserProfile,clubId:string,read=false){try{return await authorize(client,clubId,user.id,false,read?'share':'update')}catch(error){if(error instanceof HttpError&&error.statusCode===403)throw missing();throw error}}
  private async album(client:PoolClient,clubId:string,id:string){const {rows:[album]}=await client.query('SELECT * FROM club_albums WHERE id=$1 AND club_id=$2 AND deleted_at IS NULL',[id,clubId]);if(!album)throw missing();return album as {id:string;title:string;allow_member_upload:boolean;created_by:string;version:number}}
  list(user:UserProfile,clubId:string,input:{limit:number;cursor?:string}){return transaction(this.pool,async client=>{
    const club=await this.access(client,user,clubId,true),cursor=decodeCursor(input.cursor)
    const {rows}=await client.query(`SELECT a.id,a.title,a.description,a.event_id AS "eventId",a.event_date::text AS "eventDate",a.allow_member_upload AS "allowMemberUpload",a.allow_download AS "allowDownload",a.version,a.created_at AS "createdAt",a.created_at::text AS "sortTime",
      (SELECT count(*)::int FROM album_media am JOIN media_objects m ON m.id=am.media_id WHERE am.album_id=a.id AND m.state='active') AS "photoCount",$5::boolean AS "canManage",(a.allow_member_upload OR $5::boolean) AS "canUpload"
      FROM club_albums a WHERE a.club_id=$1 AND a.deleted_at IS NULL AND ($2::timestamptz IS NULL OR (a.created_at,a.id)<($2,$3::uuid)) ORDER BY a.created_at DESC,a.id DESC LIMIT $4`,[clubId,cursor?.time??null,cursor?.id??null,input.limit+1,can(club.role,'manageEvents')])
    return pageOf(rows,input.limit)
  })}
  get(user:UserProfile,clubId:string,id:string){return transaction(this.pool,async client=>{
    const club=await this.access(client,user,clubId,true)
    const {rows:[album]}=await client.query(`SELECT a.id,a.title,a.description,a.event_id AS "eventId",a.event_date::text AS "eventDate",a.allow_member_upload AS "allowMemberUpload",a.allow_download AS "allowDownload",a.version,a.created_at AS "createdAt",
      (SELECT count(*)::int FROM album_media am JOIN media_objects m ON m.id=am.media_id WHERE am.album_id=a.id AND m.state='active') AS "photoCount",$3::boolean AS "canManage",(a.allow_member_upload OR $3::boolean) AS "canUpload" FROM club_albums a WHERE a.club_id=$1 AND a.id=$2 AND a.deleted_at IS NULL`,[clubId,id,can(club.role,'manageEvents')])
    if(!album)throw missing();return album
  })}
  create(user:UserProfile,clubId:string,input:AlbumInput){return transaction(this.pool,async client=>{
    const club=await this.access(client,user,clubId);if(!can(club.role,'manageEvents'))throw denied()
    if(input.eventId){const event=await client.query("SELECT 1 FROM club_workspaces WHERE club_id=$1 AND state->'events' @> $2::jsonb",[clubId,JSON.stringify([{id:input.eventId}])]);if(!event.rowCount)throw new HttpError(400,'INVALID_EVENT','Escolha um encontro deste clube.')}
    const {rows:[album]}=await client.query('INSERT INTO club_albums(club_id,created_by,title,description,event_id,event_date,allow_member_upload,allow_download) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[clubId,user.id,input.title,input.description,input.eventId??null,input.eventDate,input.allowMemberUpload,input.allowDownload])
    await client.query("INSERT INTO audit_logs(club_id,actor_user_id,action,entity_id) VALUES($1,$2,'album.created',$3)",[clubId,user.id,album.id]);return album
  })}
  photos(user:UserProfile,clubId:string,id:string,input:{limit:number;cursor?:string;photoId?:string}){return transaction(this.pool,async client=>{
    const club=await this.access(client,user,clubId,true);await this.album(client,clubId,id);const cursor=decodeCursor(input.cursor)
    const {rows}=await client.query(`SELECT m.id,m.kind,m.width,m.height,m.duration,am.caption,am.post_id AS "postId",jsonb_build_object('id',u.id,'name',u.name) AS "addedBy",am.created_at AS "createdAt",am.created_at::text AS "sortTime",
      (am.added_by=$2 OR $6::boolean) AS "canRemove",(SELECT count(*)::int FROM post_likes l WHERE l.post_id=am.post_id) AS likes,EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id=am.post_id AND l.user_id=$2) AS liked,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',tagged.id,'name',tagged.name)) FROM album_participant_tags t JOIN users tagged ON tagged.id=t.user_id JOIN club_memberships cm ON cm.club_id=$7 AND cm.user_id=t.user_id AND cm.status='active' WHERE t.album_id=am.album_id AND t.media_id=m.id AND t.status='accepted'),'[]') AS tags,
      EXISTS(SELECT 1 FROM album_participant_tags t WHERE t.album_id=am.album_id AND t.media_id=m.id AND t.user_id=$2 AND t.status='pending') AS "myPendingTag"
      FROM album_media am JOIN media_objects m ON m.id=am.media_id AND m.state='active' JOIN users u ON u.id=am.added_by WHERE am.album_id=$1 AND ($8::uuid IS NULL OR m.id=$8) AND ($3::timestamptz IS NULL OR (am.created_at,m.id)<($3,$4::uuid)) ORDER BY am.created_at DESC,m.id DESC LIMIT $5`,[id,user.id,cursor?.time??null,cursor?.id??null,input.limit+1,can(club.role,'moderate'),clubId,input.photoId??null])
    return pageOf(rows,input.limit)
  })}
  async photo(user:UserProfile,clubId:string,id:string,mediaId:string){const result=await this.photos(user,clubId,id,{limit:1,photoId:mediaId});if(!result.items.length)throw missing();return result.items[0]}
  addPhotos(user:UserProfile,clubId:string,id:string,input:{mediaIds:string[];caption:string}){return transaction(this.pool,async client=>{
    const club=await this.access(client,user,clubId),album=await this.album(client,clubId,id)
    if(!album.allow_member_upload&&!can(club.role,'manageEvents'))throw denied()
    const count=await client.query('SELECT count(*)::int AS count FROM album_media WHERE album_id=$1',[id]);if(count.rows[0].count+input.mediaIds.length>100)throw new HttpError(409,'ALBUM_LIMIT','Este álbum atingiu o limite inicial de cem arquivos.')
    for(const mediaId of input.mediaIds){
      const media=await client.query("SELECT 1 FROM media_objects WHERE id=$1 AND club_id=$2 AND owner_user_id=$3 AND state='active' FOR UPDATE",[mediaId,clubId,user.id]);if(!media.rowCount)throw new HttpError(400,'INVALID_MEDIA','Use somente mídias suas enviadas para este clube.')
      const exists=await client.query('SELECT 1 FROM album_media WHERE album_id=$1 AND media_id=$2',[id,mediaId]);if(exists.rowCount)continue
      const {rows:[post]}=await client.query("INSERT INTO social_posts(author_user_id,club_id,audience,kind,body) VALUES($1,$2,'club','meeting',$3) RETURNING id",[user.id,clubId,input.caption||album.title])
      await client.query('INSERT INTO post_media(post_id,media_id,scope_id,position) VALUES($1,$2,$3,0)',[post.id,mediaId,clubId])
      await client.query('INSERT INTO album_media(album_id,media_id,club_id,caption,added_by,post_id) VALUES($1,$2,$3,$4,$5,$6)',[id,mediaId,clubId,input.caption,user.id,post.id])
    }
    return {added:true}
  })}
  removePhoto(user:UserProfile,clubId:string,id:string,mediaId:string){return transaction(this.pool,async client=>{
    const club=await this.access(client,user,clubId);await this.album(client,clubId,id)
    const {rows:[photo]}=await client.query('SELECT added_by,post_id FROM album_media WHERE album_id=$1 AND media_id=$2',[id,mediaId]);if(!photo)throw missing()
    if(photo.added_by!==user.id&&!can(club.role,'moderate'))throw denied()
    await client.query('DELETE FROM album_participant_tags WHERE album_id=$1 AND media_id=$2',[id,mediaId])
    await client.query('DELETE FROM album_media WHERE album_id=$1 AND media_id=$2',[id,mediaId])
    await client.query("UPDATE social_posts SET deleted_at=now(),body='Registro retirado do álbum',version=version+1 WHERE id=$1",[photo.post_id])
    await client.query('DELETE FROM post_media WHERE post_id=$1',[photo.post_id])
    await client.query("UPDATE media_objects SET state='deleted',deleted_at=now() WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM post_media pm JOIN social_posts p ON p.id=pm.post_id WHERE pm.media_id=$1 AND p.deleted_at IS NULL) AND NOT EXISTS(SELECT 1 FROM album_media am WHERE am.media_id=$1) AND NOT EXISTS(SELECT 1 FROM forum_topic_media fm JOIN forum_topics t ON t.id=fm.topic_id WHERE fm.media_id=$1 AND t.deleted_at IS NULL) AND NOT EXISTS(SELECT 1 FROM forum_reply_media fm JOIN forum_replies r ON r.id=fm.reply_id JOIN forum_topics t ON t.id=r.topic_id WHERE fm.media_id=$1 AND r.deleted_at IS NULL AND t.deleted_at IS NULL)",[mediaId])
    await client.query("INSERT INTO audit_logs(club_id,actor_user_id,action,entity_id) VALUES($1,$2,'album.photo.removed',$3)",[clubId,user.id,mediaId])
  })}
  remove(user:UserProfile,clubId:string,id:string){return transaction(this.pool,async client=>{
    const club=await this.access(client,user,clubId);await this.album(client,clubId,id);if(!can(club.role,'manageEvents'))throw denied()
    await client.query('UPDATE club_albums SET deleted_at=now(),description=\'\',version=version+1 WHERE id=$1',[id])
    await client.query("UPDATE social_posts SET deleted_at=now(),body='Álbum excluído',version=version+1 WHERE id IN(SELECT post_id FROM album_media WHERE album_id=$1)",[id])
    await client.query("INSERT INTO audit_logs(club_id,actor_user_id,action,entity_id) VALUES($1,$2,'album.deleted',$3)",[clubId,user.id,id])
  })}
  proposeTag(user:UserProfile,clubId:string,id:string,mediaId:string,targetId:string){return transaction(this.pool,async client=>{
    await this.access(client,user,clubId);await this.album(client,clubId,id)
    const photo=await client.query('SELECT 1 FROM album_media am JOIN media_objects m ON m.id=am.media_id WHERE am.album_id=$1 AND am.media_id=$2 AND m.state=\'active\'',[id,mediaId]);if(!photo.rowCount)throw missing()
    const member=await client.query("SELECT 1 FROM club_memberships WHERE club_id=$1 AND user_id=$2 AND status='active'",[clubId,targetId]);if(!member.rowCount)throw missing()
    // A rejected tag cannot be proposed again. Only the tagged person can consent.
    await client.query("INSERT INTO album_participant_tags(album_id,media_id,user_id,proposed_by,status) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",[id,mediaId,targetId,user.id,targetId===user.id?'accepted':'pending']);return {proposed:true}
  })}
  consentTag(user:UserProfile,clubId:string,id:string,mediaId:string,accept:boolean){return transaction(this.pool,async client=>{
    await this.access(client,user,clubId);await this.album(client,clubId,id)
    const result=await client.query('UPDATE album_participant_tags SET status=$4 WHERE album_id=$1 AND media_id=$2 AND user_id=$3',[id,mediaId,user.id,accept?'accepted':'rejected']);if(!result.rowCount)throw missing();return {accepted:accept}
  })}
}
