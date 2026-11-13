import type {Pool,PoolClient} from 'pg'
import {randomUUID} from 'node:crypto'
import {transaction} from './database.js'
import {authorize} from './service.js'
import {can} from './permissions.js'
import {HttpError} from './errors.js'
import {processMedia} from './media-processing.js'
import type {PrivateStorage} from './private-storage.js'
interface Media {id:string;owner_user_id:string;club_id:string|null;object_key:string;thumbnail_key:string;mime_type:string;state:string}
const missing=()=>new HttpError(404,'MEDIA_NOT_FOUND','Esta mídia não está disponível.')
const unavailable=()=>new HttpError(503,'STORAGE_UNAVAILABLE','O armazenamento privado ainda não está configurado neste ambiente.')
export class MediaService{
  constructor(private pool:Pool,private storage?:PrivateStorage){}
  private async membership(client:PoolClient,userId:string,clubId:string,read=false){try{return await authorize(client,clubId,userId,false,read?'share':'update')}catch(error){if(error instanceof HttpError&&error.statusCode===403)throw missing();throw error}}
  async upload(userId:string,clubId:string,kind:'image'|'video',bytes:Buffer){
    if(!this.storage)throw unavailable()
    await transaction(this.pool,client=>this.membership(client,userId,clubId))
    const processed=await processMedia(bytes,kind),id=randomUUID(),key=`club-media/${clubId}/${id}.${kind==='image'?'webp':'mp4'}`,thumbnailKey=`club-media/${clubId}/${id}-thumb.webp`
    await transaction(this.pool,async client=>{
      await this.membership(client,userId,clubId);await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId])
      const quota=await client.query("SELECT COALESCE(sum(byte_size+thumbnail_size),0)::bigint AS bytes FROM media_objects WHERE owner_user_id=$1 AND state<>'purged'",[userId])
      if(Number(quota.rows[0].bytes)+processed.bytes.length+processed.thumbnail.length>50000000)throw new HttpError(409,'MEDIA_QUOTA','Sua conta atingiu a cota inicial de 50 MB de fotos e vídeos.')
      await client.query('INSERT INTO media_objects(id,owner_user_id,club_id,object_key,thumbnail_key,kind,mime_type,byte_size,thumbnail_size,width,height,duration) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[id,userId,clubId,key,thumbnailKey,kind,processed.mimeType,processed.bytes.length,processed.thumbnail.length,processed.width,processed.height,processed.duration])
    })
    try{
      await this.storage.put(key,processed.bytes,processed.mimeType);await this.storage.put(thumbnailKey,processed.thumbnail,'image/webp')
      await transaction(this.pool,async client=>{await this.membership(client,userId,clubId);const updated=await client.query("UPDATE media_objects SET state='active' WHERE id=$1 AND state='pending'",[id]);if(!updated.rowCount)throw missing()})
      return {id,kind,width:processed.width,height:processed.height,duration:processed.duration,byteSize:processed.bytes.length}
    }catch(error){
      await this.pool.query("UPDATE media_objects SET state='deleted',deleted_at=now() WHERE id=$1 AND state='pending'",[id]);await this.purge({id,object_key:key,thumbnail_key:thumbnailKey}).catch(()=>{})
      if(error instanceof HttpError)throw error;throw new HttpError(503,'UPLOAD_FAILED','Não foi possível concluir o envio da mídia.')
    }
  }
  async content(userId:string,id:string,thumbnail:boolean,download=false){
    if(!this.storage)throw unavailable()
    const media=await transaction(this.pool,async client=>{
      const {rows:[file]}=await client.query<Media>("SELECT * FROM media_objects WHERE id=$1 AND state='active'",[id]);if(!file||!file.club_id)throw missing()
      await this.membership(client,userId,file.club_id,true)
      const {rows:[links]}=await client.query(`SELECT EXISTS(SELECT 1 FROM post_media pm JOIN social_posts p ON p.id=pm.post_id WHERE pm.media_id=$1 AND p.deleted_at IS NULL AND p.audience='club') AS posted,
        EXISTS(SELECT 1 FROM album_media am JOIN club_albums a ON a.id=am.album_id WHERE am.media_id=$1 AND a.deleted_at IS NULL) AS album,
        EXISTS(SELECT 1 FROM album_media am JOIN club_albums a ON a.id=am.album_id WHERE am.media_id=$1 AND a.deleted_at IS NULL AND a.allow_download) AS downloadable,
        (EXISTS(SELECT 1 FROM forum_topic_media fm JOIN forum_topics t ON t.id=fm.topic_id WHERE fm.media_id=$1 AND t.deleted_at IS NULL) OR EXISTS(SELECT 1 FROM forum_reply_media fm JOIN forum_replies r ON r.id=fm.reply_id JOIN forum_topics t ON t.id=r.topic_id WHERE fm.media_id=$1 AND r.deleted_at IS NULL AND t.deleted_at IS NULL)) AS forum`,[id])
      if(file.owner_user_id!==userId&&!links.posted&&!links.album&&!links.forum)throw missing()
      if(download&&file.owner_user_id!==userId&&!links.downloadable)throw new HttpError(403,'DOWNLOAD_DISABLED','O download não foi liberado para este arquivo.')
      return file
    })
    try{return {bytes:await this.storage.get(thumbnail?media.thumbnail_key:media.object_key),mimeType:thumbnail?'image/webp':media.mime_type}}
    catch{throw new HttpError(503,'DOWNLOAD_FAILED','Não foi possível carregar a mídia agora.')}
  }
  private async purge(file:Pick<Media,'id'|'object_key'|'thumbnail_key'>){
    await this.storage!.remove(file.object_key);await this.storage!.remove(file.thumbnail_key)
    await this.pool.query("UPDATE media_objects SET state='purged' WHERE id=$1 AND state='deleted'",[file.id])
  }
  async remove(userId:string,id:string){
    if(!this.storage)throw unavailable()
    const file=await transaction(this.pool,async client=>{
      const {rows:[file]}=await client.query<Media>("SELECT * FROM media_objects WHERE id=$1 AND state IN ('active','deleted')",[id]);if(!file)throw missing()
      if(file.owner_user_id!==userId){if(!file.club_id||!can((await this.membership(client,userId,file.club_id)).role,'moderate'))throw missing()}
      await client.query("UPDATE media_objects SET state='deleted',deleted_at=COALESCE(deleted_at,now()) WHERE id=$1",[id]);return file
    })
    try{await this.purge(file);return {purged:true}}catch{return {purged:false}}
  }
  async cleanup(limit=20){
    if(!this.storage)throw unavailable()
    limit=Math.max(1,Math.min(50,limit))
    await this.pool.query(`UPDATE media_objects SET state='deleted',deleted_at=now() WHERE id IN(SELECT m.id FROM media_objects m WHERE (m.state='pending' AND m.created_at<now()-interval '15 minutes') OR (m.state='active' AND m.created_at<now()-interval '1 day' AND NOT EXISTS(SELECT 1 FROM post_media pm JOIN social_posts p ON p.id=pm.post_id WHERE pm.media_id=m.id AND p.deleted_at IS NULL) AND NOT EXISTS(SELECT 1 FROM album_media am JOIN club_albums a ON a.id=am.album_id WHERE am.media_id=m.id AND a.deleted_at IS NULL) AND NOT EXISTS(SELECT 1 FROM forum_topic_media fm JOIN forum_topics t ON t.id=fm.topic_id WHERE fm.media_id=m.id AND t.deleted_at IS NULL) AND NOT EXISTS(SELECT 1 FROM forum_reply_media fm JOIN forum_replies r ON r.id=fm.reply_id JOIN forum_topics t ON t.id=r.topic_id WHERE fm.media_id=m.id AND r.deleted_at IS NULL AND t.deleted_at IS NULL)) ORDER BY m.created_at LIMIT $1 FOR UPDATE SKIP LOCKED)`,[limit])
    const {rows}=await this.pool.query<Media>("SELECT * FROM media_objects WHERE state='deleted' ORDER BY created_at LIMIT $1",[limit]);let purged=0,failed=0
    for(const file of rows){try{await this.purge(file);purged++}catch{failed++}}return {purged,failed}
  }
}
