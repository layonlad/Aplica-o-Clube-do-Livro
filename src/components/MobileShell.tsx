import { useState } from 'react'
import { BookOpen, CalendarDays, ChevronRight, History, Home, LogOut, Menu, MessageCircle, Palette, Settings, Sparkles, TicketCheck, UserRound, X } from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '../app/ThemeProvider'
import { DemoBadge } from './ui'

const primaryNav = [
  { to: '/app', label: 'Início', icon: Home, end: true },
  { to: '/app/library', label: 'Livros', icon: BookOpen },
  { to: '/app/calendar', label: 'Agenda', icon: CalendarDays },
  { to: '/app/forum', label: 'Fórum', icon: MessageCircle },
  { to: '/app/profile', label: 'Perfil', icon: UserRound },
]

const secondaryNav = [
  { to: '/app/nominations', label: 'Indicações e sorteio', icon: Sparkles },
  { to: '/app/history', label: 'Histórico de leituras', icon: History },
  { to: '/app/admin', label: 'Painel administrativo', icon: Settings },
  { to: '/app/theme', label: 'Personalização visual', icon: Palette },
]

const pageTitles: Record<string, string> = {
  '/app/library': 'Biblioteca',
  '/app/calendar': 'Agenda',
  '/app/forum': 'Fórum',
  '/app/profile': 'Meu perfil',
  '/app/nominations': 'Indicações',
  '/app/history': 'Nossa história',
  '/app/admin': 'Administração',
  '/app/theme': 'Identidade visual',
}

export function MobileShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { theme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const isHome = location.pathname === '/app'
  const isReader = location.pathname === '/app/reader'

  if (isReader) return <Outlet />

  return (
    <div className="app-frame">
      <header className={`app-header ${isHome ? 'app-header--home' : ''}`}>
        <div className="brand-lockup" onClick={() => navigate('/app')} role="button" tabIndex={0}>
          <span className="brand-mark">{theme.monogram}</span>
          <div>
            <small>{isHome ? 'BOA NOITE, MARINA' : theme.clubName}</small>
            <strong>{isHome ? 'Que história vamos viver?' : (pageTitles[location.pathname] ?? 'Clube Aurora')}</strong>
          </div>
        </div>
        <button className="icon-button" aria-label="Abrir menu" onClick={() => setMenuOpen(true)}><Menu /></button>
      </header>

      <main className="page-content"><Outlet /></main>

      <nav className="bottom-nav" aria-label="Navegação principal">
        {primaryNav.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'active' : ''}>
            <Icon size={21} strokeWidth={1.9} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {menuOpen && (
        <div className="drawer-layer" role="presentation" onMouseDown={() => setMenuOpen(false)}>
          <aside className="drawer" role="dialog" aria-modal="true" aria-label="Menu do clube" onMouseDown={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div><DemoBadge /><h2>Mais do clube</h2></div>
              <button className="icon-button" aria-label="Fechar menu" onClick={() => setMenuOpen(false)}><X /></button>
            </div>
            <div className="drawer-club">
              <span className="brand-mark brand-mark--large">{theme.monogram}</span>
              <div><strong>{theme.clubName}</strong><small>12 membros · Owner</small></div>
            </div>
            <nav className="drawer-nav">
              {secondaryNav.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} onClick={() => setMenuOpen(false)}>
                  <Icon size={21} /><span>{label}</span><ChevronRight size={18} />
                </NavLink>
              ))}
            </nav>
            <div className="drawer-note"><TicketCheck size={18} /><span>Ambiente de protótipo<br/><small>Nenhum dado é real</small></span></div>
            <button className="drawer-logout" onClick={() => navigate('/')}><LogOut size={19} /> Sair da demonstração</button>
          </aside>
        </div>
      )}
    </div>
  )
}
