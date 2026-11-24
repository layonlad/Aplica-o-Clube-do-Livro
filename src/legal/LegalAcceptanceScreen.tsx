import { useState, type FormEvent } from 'react'
import { Button } from '../components/ui'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, readableError } from '../auth/api'
import { privacyVersion, termsVersion } from '../../server/src/legal-versions'
import { LegalLinks } from './LegalPages'

export function LegalCheck({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="legal-check">
    <input type="checkbox" required checked={checked} onChange={e => onChange(e.target.checked)} />
    <span>Aceito os Termos de Serviço e declaro que li a Política de Privacidade.</span>
  </label>
}

export function LegalAcceptanceScreen() {
  const { user, retry, signOut } = useAuth()
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!user || !checked || busy) return
    setBusy(true)
    setError('')
    try {
      await apiRequest(user, '/me/legal-acceptance', 'POST', {
        termsVersion, privacyVersion, acceptTerms: true, acknowledgePrivacy: true,
      })
      retry()
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }
  return <main className="access-page"><section className="access-card">
    <h1>Conclua seu cadastro</h1>
    <p>Leia os documentos e confirme para acessar sua conta.</p>
    <LegalLinks newTab />
    <form className="access-form" onSubmit={submit}>
      <LegalCheck checked={checked} onChange={setChecked} />
      {error && <p role="alert">{error}</p>}
      <Button type="submit" disabled={busy}>Confirmar e continuar</Button>
    </form>
    <Button variant="ghost" disabled={busy} onClick={() => void signOut().catch(err => setError(readableError(err)))}>Sair da conta</Button>
  </section></main>
}
