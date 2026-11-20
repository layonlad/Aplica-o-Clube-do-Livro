import type { PoolClient } from 'pg'
import { HttpError } from './errors.js'
export const editorialAuthorId = '83bf6008-790b-4a72-a259-8791c302b061'
export const editorialFirebaseUid = '~literary-editorial'
export const publicScope = '00000000-0000-0000-0000-000000000000'
// actor is always a bound SQL expression; no user text is interpolated here.
export function notBlocked(target: string, actor: string) {
  return `NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=${actor} AND b.blocked_id=${target}) OR (b.blocked_id=${actor} AND b.blocker_id=${target}))`
}
/** Only community/profile content. Never use this to authorize a club. */
export function visibleProfile(target: string, actor: string) {
  return `EXISTS(SELECT 1 FROM profiles vp WHERE vp.user_id=${target} AND NOT vp.suspended AND (vp.is_public OR vp.user_id=${actor} OR EXISTS(SELECT 1 FROM follows vf WHERE vf.followed_id=vp.user_id AND vf.follower_id=${actor}))) AND ${notBlocked(target, actor)}`
}
export function visiblePublicPost(alias = 'p', actor = '$2') {
  return `${alias}.audience='public' AND ${alias}.club_id IS NULL AND ${alias}.deleted_at IS NULL AND (${visibleProfile(`${alias}.author_user_id`, actor)} OR (${alias}.author_user_id='${editorialAuthorId}'::uuid
    AND ${notBlocked(`${alias}.author_user_id`, actor)}
    AND EXISTS(SELECT 1 FROM profiles editorial WHERE editorial.user_id=${alias}.author_user_id AND NOT editorial.suspended)))`
}
export async function requireSocialProfile(client: PoolClient, userId: string) {
  if (!(await client.query('SELECT 1 FROM profiles WHERE user_id=$1 AND NOT suspended FOR SHARE', [userId])).rowCount)
    throw new HttpError(403, 'PROFILE_REQUIRED', 'Prepare seu perfil antes de publicar. Perfis suspensos não podem publicar.')
}
export async function requirePublicProfile(client: PoolClient, userId: string) {
  const result = await client.query(
    'SELECT 1 FROM profiles WHERE user_id=$1 AND is_public FOR SHARE',
    [userId],
  )
  if (!result.rowCount)
    throw new HttpError(
      403,
      'PUBLIC_PROFILE_REQUIRED',
      'Ative seu perfil público antes de publicar na comunidade.',
    )
}
export const publicMissing = () =>
  new HttpError(404, 'CONTENT_NOT_FOUND', 'Este conteúdo não está disponível.')
