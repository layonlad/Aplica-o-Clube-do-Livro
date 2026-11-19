import { accountReturnPath } from '../auth/return-path'

export function nativeLinkPath(value: string, origin: string | undefined) {
  try {
    const url = new URL(value)
    if (!origin || url.origin !== new URL(origin).origin || url.protocol !== 'https:' ||
        url.username || url.password || url.pathname !== '/') return null
    const path = url.hash.slice(1)
    return accountReturnPath(path) === path ? path : null
  } catch { return null }
}
