import type { User } from 'firebase/auth'
import { apiRequest, publicRequest, readCached } from '../auth/api'
export const postBase = (clubId: string | null) =>
  clubId === null ? '/public/posts' : `/clubs/${clubId}/posts`
export const mediaBase = (clubId: string | null) =>
  clubId === null ? '/public/media' : `/clubs/${clubId}/media`
export function socialRead<T>(user: User | null, path: string) {
  return user?.emailVerified ? apiRequest<T>(user, path) : publicRequest<T>(path)
}


export function cachedSocialRead<T>(user: User | null, path: string, refresh = false) {
  return readCached(user?.emailVerified ? user.uid : null, path, () => socialRead<T>(user, path), refresh)
}
