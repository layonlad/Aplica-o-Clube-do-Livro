import type { User } from 'firebase/auth'

const rejected = new Set<(user: User) => void>()
const cleanup = new Set<(uid: string) => void>()
const ended = new WeakSet<User>()

export function watchRejectedSession(listener: (user: User) => void) {
  rejected.add(listener)
  return () => { rejected.delete(listener) }
}

export function reportRejectedSession(user: User) {
  for (const listener of rejected) listener(user)
}

export function isInvalidSession(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return ['INVALID_SESSION', 'AUTH_REQUIRED', 'auth/user-disabled', 'auth/user-not-found',
    'auth/user-token-expired', 'auth/invalid-user-token'].some((value) => value === code)
}

export function onSessionEnd(listener: (uid: string) => void) {
  cleanup.add(listener)
}

export function endSession(user: User) {
  ended.add(user)
  for (const listener of cleanup) listener(user.uid)
}

export function resumeSession(user: User) {
  ended.delete(user)
}

export function sessionEnded(user: User) {
  return ended.has(user)
}
