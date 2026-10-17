import { ArrowRight, BookHeart, Check, LockKeyhole, Mail, Ticket } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../app/ThemeProvider'
import { Button, DemoBadge } from '../components/ui'

export function LoginPage() {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const [mode, setMode] = useState<'login' | 'invite'>('invite')

  function enterDemo(event: FormEvent) {
    event.preventDefault()
    navigate('/app')
  }

  return (
    <main className="login-page">
      <div className="login-art" aria-hidden="true">
        <span className="floating-book floating-book--one" />
        <span className="floating-book floating-book--two" />
        <span className="floating-star">✦</span>
      </div>
      <section className="login-content">
        <div className="login-brand">
          <span className="brand-mark brand-mark--hero">{theme.monogram}</span>
          <DemoBadge />
        </div>
        <p className="eyebrow">BEM-VINDA AO</p>
        <h1>{theme.clubName}</h1>
        <p className="login-lead">Leituras que aproximam.<br />Conversas que ficam.</p>

        <div className="segmented-control" aria-label="Forma de entrada">
          <button className={mode === 'invite' ? 'active' : ''} onClick={() => setMode('invite')}><Ticket size={17} /> Convite</button>
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}><LockKeyhole size={17} /> Entrar</button>
        </div>

        <form className="login-form" onSubmit={enterDemo}>
          {mode === 'invite' ? (
            <>
              <label htmlFor="invite">Código do convite</label>
              <div className="input-with-icon"><Ticket size={19} /><input id="invite" defaultValue="AURORA-26" autoComplete="off" /></div>
              <p className="field-hint"><Check size={15} /> Convite de Marina para o Clube Aurora</p>
            </>
          ) : (
            <>
              <label htmlFor="email">Seu e-mail</label>
              <div className="input-with-icon"><Mail size={19} /><input id="email" type="email" defaultValue="marina@exemplo.com" /></div>
              <p className="field-hint">A autenticação real será conectada em uma fase futura.</p>
            </>
          )}
          <Button type="submit" className="button--wide">Entrar na demonstração <ArrowRight size={19} /></Button>
        </form>

        <div className="demo-disclaimer"><BookHeart size={19} /><p><strong>Protótipo com dados simulados</strong><br />Nenhuma conta será criada e nada será enviado.</p></div>
      </section>
    </main>
  )
}
