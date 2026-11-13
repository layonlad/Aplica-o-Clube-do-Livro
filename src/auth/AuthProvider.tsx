import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { onIdTokenChanged, signOut, type Auth, type User } from 'firebase/auth'
import { createClientAuth } from './firebase'

interface AuthState { auth: Auth; user: User | null; loading: boolean; signOut: () => Promise<void> }
const Context = createContext<AuthState | null>(null)
let client: Auth | undefined

export function AuthProvider({ children }: { children: ReactNode }) {
  const [setup] = useState(() => {
    try { client ??= createClientAuth(); return { auth: client, error: null } }
    catch (error) { return { auth: null, error: (error as Error).message } }
  })
  const [state, setState] = useState<{ user: User | null; loading: boolean }>({ user: null, loading: true })
  useEffect(() => {
    if (!setup.auth) return
    return onIdTokenChanged(setup.auth, (user) => setState({ user, loading: false }))
  }, [setup.auth])
  if (!setup.auth) return <main className="access-page"><h1>Acesso indisponível</h1><p role="alert">{setup.error}</p></main>
  return <Context.Provider value={{ auth: setup.auth, ...state, signOut: () => signOut(setup.auth!) }}>{children}</Context.Provider>
}
export function useAuth() {
  const auth = useContext(Context)
  if (!auth) throw new Error('AuthProvider ausente')
  return auth
}
