import { clearDevicePush } from './clear-device-push'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { onIdTokenChanged, signOut as firebaseSignOut, type Auth, type User } from 'firebase/auth'
import type { Session as AccountSession } from '../../server/src/contracts'
import { createClientAuth } from './firebase'
import { ApiError, apiRequest } from './api'
import { endSession, isInvalidSession, resumeSession, watchRejectedSession } from './session-events'

type Session =
  | { status: 'initializing' | 'signed-out'; user: null }
  | { status: 'unverified' | 'legal-review'; user: User }
  | { status: 'authenticated'; user: User; accountSession: AccountSession }
  | { status: 'error'; user: null; operation: 'validate' | 'sign-out'; message: string }

type AuthState = Session & {
  auth: Auth
  loading: boolean
  signOut: () => Promise<void>
  retry: () => void
}
const Context = createContext<AuthState | null>(null)
let client: Auth | undefined

export function AuthProvider({ children }: { children: ReactNode }) {
  const [setup] = useState(() => {
    try {
      client ??= createClientAuth()
      return { auth: client, error: null }
    } catch (error) {
      return { auth: null, error: (error as Error).message }
    }
  })
  const auth = setup.auth
  const [session, setSession] = useState<Session>({ status: 'initializing', user: null })
  const state = useRef<Session>(session)
  const ticket = useRef(0)
  const lastUser = useRef<User | null>(null)
  const signingOut = useRef(false)
  const validating = useRef<User | null>(null)
  const update = useCallback((next: Session) => {
    state.current = next
    setSession(next)
  }, [])

  const signOut = useCallback(async () => {
    if (!auth || signingOut.current) return
    signingOut.current = true
    ++ticket.current
    validating.current = null
    update({ status: 'initializing', user: null })
    const account = lastUser.current
    if (account) {
      const cleanup = clearDevicePush(account)
      if (cleanup) {
        let timer: ReturnType<typeof setTimeout> | undefined
        await Promise.race([cleanup.catch(() => {}), new Promise<void>(resolve => { timer = setTimeout(resolve, 3000) })])
        clearTimeout(timer)
      }
      endSession(account)
    }
    try {
      await firebaseSignOut(auth)
      lastUser.current = null
      update({ status: 'signed-out', user: null })
    } catch (error) {
      update({ status: 'error', user: null, operation: 'sign-out', message: 'Não foi possível encerrar a sessão. Tente sair novamente.' })
      throw error
    } finally {
      signingOut.current = false
    }
  }, [auth, update])

  const validate = useCallback(async (user: User | null, recheck = false) => {
    if (signingOut.current) return
    if (lastUser.current && lastUser.current !== user) endSession(lastUser.current)
    lastUser.current = user
    if (!user || !user.emailVerified) {
      ++ticket.current
      validating.current = null
      update(user ? { status: 'unverified', user } : { status: 'signed-out', user: null })
      return
    }
    const sameSession = state.current.status === 'authenticated' && state.current.user === user
    if (validating.current === user || (sameSession && !recheck)) return
    resumeSession(user)
    validating.current = user
    const current = ++ticket.current
    if (!sameSession) update({ status: 'initializing', user: null })
    try {
      const accountSession = await apiRequest<AccountSession>(user, '/me')
      if (current === ticket.current && auth?.currentUser === user)
        update({ status: 'authenticated', user, accountSession })
    } catch (error) {
      if (current !== ticket.current || auth?.currentUser !== user) return
      if (isInvalidSession(error)) {
        await signOut().catch(() => {})
      } else if (error instanceof ApiError && error.code === 'EMAIL_NOT_VERIFIED') {
        update({ status: 'unverified', user })
      } else if (error instanceof ApiError && error.code === 'LEGAL_ACCEPTANCE_REQUIRED') {
        update({ status: 'legal-review', user })
      } else {
        endSession(user)
        update({ status: 'error', user: null, operation: 'validate', message: 'Não foi possível verificar sua sessão. Confira a conexão e tente novamente.' })
      }
    } finally {
      if (current === ticket.current) validating.current = null
    }
  }, [auth, signOut, update])

  useEffect(() => {
    if (!auth) return
    const unsubscribe = onIdTokenChanged(auth, (user) => {
      // The initial observer runs after Firebase has restored its persisted identity.
      // Recheck rotated credentials without remounting an already validated workspace.
      void validate(user, true)
    })
    const stopRejections = watchRejectedSession((user) => {
      if (auth.currentUser === user) void signOut().catch(() => {})
    })
    const resume = () => {
      if (document.visibilityState === 'visible' && state.current.status === 'authenticated')
        void validate(auth.currentUser, true)
    }
    const pageShow = (event: PageTransitionEvent) => { if (event.persisted) resume() }
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('pageshow', pageShow)
    return () => {
      ++ticket.current
      validating.current = null
      unsubscribe()
      stopRejections()
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('pageshow', pageShow)
    }
  }, [auth, signOut, validate])

  if (!auth) return <main className="access-page"><h1>Acesso indisponível</h1><p role="alert">{setup.error}</p></main>
  return <Context.Provider value={{
    ...session,
    auth,
    loading: session.status === 'initializing',
    signOut,
    retry: () => {
      if (session.status === 'error' && session.operation === 'sign-out') void signOut().catch(() => {})
      else void validate(auth.currentUser, true)
    },
  }}>{children}</Context.Provider>
}

export function useAuth() {
  const auth = useContext(Context)
  if (!auth) throw new Error('AuthProvider ausente')
  return auth
}
