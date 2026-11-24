import { LegalAcceptanceScreen } from '../legal/LegalAcceptanceScreen'
import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from '../auth/AuthProvider'
import { AuthScreen, VerifyEmailScreen } from '../auth/AuthScreen'
import { accountReturnPath } from '../auth/return-path'
import { Button } from '../components/ui'
import './workspace.css'

const WorkspaceRoutes = lazy(() => import('./WorkspaceRoutes').then((module) => ({ default: module.WorkspaceRoutes })))

function WorkspaceSession() {
  const session = useAuth()
  const { user, loading, status, signOut, retry } = session
  const { pathname, search, state } = useLocation()
  if (loading) return <main className="access-page"><p role="status">Verificando sua sessão…</p></main>
  if (status === 'error') return <main className="access-page"><section className="access-card">
    <h1>Sessão temporariamente indisponível</h1>
    <p role="alert">{session.message}</p>
    <div className="access-actions"><Button onClick={retry}>Tentar novamente</Button>
      <Button variant="ghost" onClick={() => void signOut().catch(() => {})}>Sair da conta</Button></div>
  </section></main>
  if (status === 'legal-review') return <LegalAcceptanceScreen key={user.uid} />
  if (!user || !user.emailVerified || status === 'unverified') {
    return <Routes>
      <Route path="/account" element={user ? <VerifyEmailScreen /> : <AuthScreen />} />
      <Route path="*" element={<Navigate to="/account" replace state={{ from: accountReturnPath(pathname + search) }} />} />
    </Routes>
  }
  if (pathname === '/account') return <Navigate to={accountReturnPath(state?.from)} replace />
  return <Suspense fallback={<main className="access-page"><p role="status">Abrindo seu espaço…</p></main>}>
    <WorkspaceRoutes accountId={user.uid} />
  </Suspense>
}

export function WorkspaceApp(){return <AuthProvider><WorkspaceSession/></AuthProvider>}
