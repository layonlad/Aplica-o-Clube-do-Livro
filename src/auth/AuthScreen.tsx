import { useState, type FormEvent } from 'react'
import { createUserWithEmailAndPassword, GoogleAuthProvider, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, updateProfile } from 'firebase/auth'
import { Button } from '../components/ui'
import { useAuth } from './AuthProvider'
import { readableError } from './api'
import { Link } from 'react-router-dom'

/** Painel editorial da entrada: estante em lombadas e uma citação em domínio público. */
function AccessArt() {
  return <aside className="access-art" aria-hidden="true">
    <div className="access-art__shelf">{Array.from({ length: 11 }, (_, index) => <i key={index} />)}</div>
    <blockquote>Ler é sonhar pela mão de outrem.<cite>Fernando Pessoa</cite></blockquote>
  </aside>
}

export function AuthScreen() {
  const { auth } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      if (mode === 'reset') {
        await sendPasswordResetEmail(auth, email)
        setMessage('Se houver uma conta para esse e-mail, você receberá as instruções de recuperação.')
      } else if (mode === 'signup') {
        const { user } = await createUserWithEmailAndPassword(auth, email, password)
        await updateProfile(user, { displayName: name.trim() })
        await sendEmailVerification(user)
      } else { await signInWithEmailAndPassword(auth, email, password) }
    } catch (err) { setError(readableError(err)) }
    finally { setBusy(false); setPassword('') }
  }
  async function google() {
    setBusy(true); setError('')
    try { await signInWithPopup(auth, new GoogleAuthProvider()) }
    catch (err) { setError(readableError(err)) }
    finally { setBusy(false) }
  }
  return <main className="access-page access-page--split"><AccessArt /><section className="access-card">
    <span className="brand-mark brand-mark--large">CL</span><p className="eyebrow">Clube do Livro</p>
    <h1>{mode === 'signup' ? 'Comece sua história' : mode === 'reset' ? 'Recuperar senha' : 'Bom ter você aqui'}</h1>
    <p>Entre para sincronizar suas leituras, acessar seus clubes ou aceitar um convite. Você também pode usar o aplicativo sem conta.</p>
    <Link className="button-link" to="/app">Continuar sem cadastro →</Link>
    <form className="access-form" onSubmit={submit}>
      {mode === 'signup' && <label>Seu nome<input required maxLength={100} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></label>}
      <label>E-mail<input type="email" required maxLength={254} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      {mode !== 'reset' && <label>Senha<input type="password" required minLength={mode === 'signup' ? 12 : 1} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} /></label>}
      {mode === 'signup' && <small>Use pelo menos 12 caracteres. Você precisará confirmar seu e-mail.</small>}
      {error && <p role="alert" className="access-error">{error}</p>}
      {message && <p role="status">{message}</p>}
      <Button disabled={busy} type="submit">{busy ? 'Aguarde…' : mode === 'signup' ? 'Criar conta' : mode === 'reset' ? 'Enviar instruções' : 'Entrar'}</Button>
    </form>
    <div className="access-actions"><Button variant="secondary" disabled={busy} onClick={google}>Continuar com Google</Button>
      <Button variant="ghost" disabled={busy} onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(''); setMessage('') }}>{mode === 'signup' ? 'Já tenho uma conta' : 'Criar uma conta'}</Button>
      <Button variant="ghost" disabled={busy} onClick={() => { setMode(mode === 'reset' ? 'login' : 'reset'); setError(''); setMessage('') }}>{mode === 'reset' ? 'Voltar para entrar' : 'Esqueci minha senha'}</Button></div>
  </section></main>
}

export function VerifyEmailScreen() {
  const { user, signOut } = useAuth()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function verify(resend: boolean) {
    if (!user) return
    setBusy(true); setMessage('')
    try {
      if (resend) { await sendEmailVerification(user); setMessage('Mensagem enviada. Confira também a pasta de spam.') }
      else { await user.reload(); await user.getIdToken(true); if (!user.emailVerified) setMessage('Seu e-mail ainda não foi confirmado.') }
    } catch (err) { setMessage(readableError(err)) }
    finally { setBusy(false) }
  }
  return <main className="access-page"><section className="access-card"><h1>Confirme seu e-mail</h1>
    <p>Abra a mensagem enviada para <strong>{user?.email}</strong> e confirme seu endereço para continuar.</p>
    <p role="status">{message}</p><div className="access-actions">
      <Button disabled={busy} onClick={() => verify(false)}>Já confirmei meu e-mail</Button>
      <Button disabled={busy} variant="secondary" onClick={() => verify(true)}>Reenviar confirmação</Button>
      <Button disabled={busy} variant="ghost" onClick={() => { void signOut().catch((err) => setMessage(readableError(err))) }}>Usar outra conta</Button>
      <Link to="/app">Continuar no espaço pessoal sem confirmar agora →</Link>
    </div></section></main>
}
