import type {PoolClient} from 'pg'
import {HttpError} from './errors.js'
export const publicScope='00000000-0000-0000-0000-000000000000'
// actor is always a bound SQL expression; no user text is interpolated here.
export function notBlocked(target:string,actor:string){return `NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=${actor} AND b.blocked_id=${target}) OR (b.blocked_id=${actor} AND b.blocker_id=${target}))`}
export function visiblePublicPost(alias='p',actor='$2'){return `${alias}.audience='public' AND ${alias}.club_id IS NULL AND ${alias}.deleted_at IS NULL AND EXISTS(SELECT 1 FROM profiles pr WHERE pr.user_id=${alias}.author_user_id AND pr.is_public) AND ${notBlocked(`${alias}.author_user_id`,actor)}`}
export async function requirePublicProfile(client:PoolClient,userId:string){const result=await client.query('SELECT 1 FROM profiles WHERE user_id=$1 AND is_public FOR SHARE',[userId]);if(!result.rowCount)throw new HttpError(403,'PUBLIC_PROFILE_REQUIRED','Ative seu perfil público antes de publicar na comunidade.')}
export const publicMissing=()=>new HttpError(404,'CONTENT_NOT_FOUND','Este conteúdo não está disponível.')
