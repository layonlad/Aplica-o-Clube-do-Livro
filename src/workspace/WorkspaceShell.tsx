import { Suspense, useEffect, useRef, useState, type MouseEvent } from 'react'
import { Link, NavLink, Outlet, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { Bell, BookOpen, CalendarDays, ChevronRight, History, Home, Camera, Compass, LogIn, Menu, MessagesSquare, NotebookPen, Palette, Sparkles, UserRound, UsersRound, X, type LucideIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useTheme } from '../app/ThemeProvider'
import { SkeletonPage } from '../components/ui'
import { useWorkspace } from './WorkspaceProvider'

type NavItem = { to: string; name: string; icon: LucideIcon; hint?: string }

const DISMISS_KEY = 'clube-livro-visitor-note-dismissed'

function readDismissed() {
  try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
}

/** Ambiente visual da rota atual: muda o acento de cor sem mudar a identidade. */
function spaceFor(pathname: string, scope: string) {
  if (scope !== 'personal') return 'club'
  if (pathname.startsWith('/app/library') || pathname.startsWith('/app/reader') || pathname.startsWith('/app/history')) return 'library'
  return 'personal'
}

export function WorkspaceShell() {
  const [menu, setMenu] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [dismissed, setDismissed] = useState(readDismissed)
  const { publicModerator,snapshot, scope, scopeName, clubs, setScope, loading, busy, error, errorCode, refresh } = useWorkspace()
  const { user,signOut } = useAuth()
  const navigate=useNavigate()
  const [accountError,setAccountError]=useState('')
  async function reenter(){try{await signOut();navigate('/account')}catch{setAccountError('Não foi possível sair da sessão. Tente novamente.')}}
  const { theme } = useTheme()
  const [params] = useSearchParams()
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const unread = params.get('notice')
  const personal = scope === 'personal'
  const monogram = theme.monogram === 'CA' ? 'CL' : theme.monogram

  const nav: NavItem[] = [
    { to: '/app', name: 'Início', icon: Home },
    { to: '/app/community', name: 'Comunidade', icon: MessagesSquare },
    { to: '/app/library', name: 'Biblioteca', icon: BookOpen },
    { to: '/clubs', name: 'Meus clubes', icon: UsersRound },

    { to: '/app/profile', name: 'Perfil', icon: UserRound },
  ]
  const extra: NavItem[] = [
    {to:'/app/notifications',name:'Notificações',icon:Bell},
    ...(publicModerator?[{to:'/app/moderation',name:'Moderação pública',icon:MessagesSquare}]:[]),
    {to:'/app/reader',name:'Minha leitura',icon:BookOpen},
    {to:'/app/social-profile',name:'Meu perfil social',icon:UserRound},
    {to:'/app/calendar',name:'Agenda e encontros',icon:CalendarDays},
    {to:'/app/forum',name:personal?'Caderno pessoal':'Fórum do clube',icon:personal?NotebookPen:MessagesSquare},
    {to:'/app/wall',name:'Mural do clube',icon:MessagesSquare,hint:'Conversas do seu grupo'},
    {to:'/app/gallery',name:'Galeria de encontros',icon:Camera,hint:'Memórias compartilhadas'},
    {to:'/app/explore',name:'Explorar',icon:Compass,hint:'Encontre novas leituras'},
    { to: '/app/nominations', name: 'Indicações e sorteio', icon: Sparkles, hint: 'Escolha a próxima leitura' },
    { to: '/app/history', name: 'Histórico de leitura', icon: History, hint: 'Tudo o que você já leu' },
    { to: '/clubs', name: 'Clubes e convites', icon: UsersRound, hint: 'Leia em grupo' },
    { to: '/app/theme', name: 'Aparência', icon: Palette, hint: 'Cores, fonte e modo escuro' },
  ]

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }) }, [pathname])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!menu) return
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(false) }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    const trigger = menuButtonRef.current
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; trigger?.focus() }
  }, [menu])

  function skip(event: MouseEvent) { event.preventDefault(); mainRef.current?.focus() }
  function dismiss() { setDismissed(true); try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* sem armazenamento */ } }

  const showVisitorNote = !user?.emailVerified && !dismissed && pathname === '/app'

  return <div className="app-frame workspace-app" data-space={spaceFor(pathname, scope)}>
    <a className="skip-link" href="#conteudo" onClick={skip}>Pular para o conteúdo</a>
    <aside className="app-rail">
      <header className={`app-header ${scrolled ? 'is-scrolled' : ''}`}>
        <Link className="brand-lockup" to="/app" aria-label="Clube do Livro, início"><span className="brand-mark">{monogram}</span><span className="rail-brand-name rail-only"><strong>Clube do Livro</strong><small>Leituras que aproximam</small></span></Link>
        <label className="space-switch"><small>Você está em</small><select aria-label="Espaço de leitura" disabled={busy} value={scope} onChange={e => setScope(e.target.value)}><option value="personal">Meu espaço pessoal</option>{clubs.map(club => <option key={club.id} value={club.id}>{club.name}</option>)}</select></label>
        {!user && <Link className="header-chip mobile-only" to="/account">Entrar</Link>}
        <button ref={menuButtonRef} className="icon-button mobile-only" aria-label="Abrir menu" aria-expanded={menu} onClick={() => setMenu(true)}><Menu /></button>
      </header>
      <nav className="bottom-nav" aria-label="Navegação principal">
        {nav.map(({ to, name, icon: Icon }) => <NavLink key={to} to={to} end={to === '/app'} className={({ isActive }) => isActive ? 'active' : ''}><Icon size={21} strokeWidth={1.9} aria-hidden="true" /><span>{name}</span></NavLink>)}
      </nav>
      <nav className="rail-more rail-only" aria-label="Mais do aplicativo">
        <p className="rail-section-label">Explorar</p>
        {extra.map(({ to, name, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : ''}><Icon size={19} strokeWidth={1.9} aria-hidden="true" /><span>{name}</span></NavLink>)}
      </nav>
      <div className="rail-foot rail-only">
        {user
          ? <Link className="rail-account" to="/app/profile"><span className="avatar avatar--md" aria-hidden="true">{(user.displayName || user.email || '?').slice(0, 2).toUpperCase()}</span><span><strong>{user.displayName || 'Sua conta'}</strong><small>{user.email}</small></span></Link>
          : <Link className="rail-account" to="/account"><span className="avatar avatar--md" aria-hidden="true"><LogIn size={18} /></span><span><strong>Entrar ou criar conta</strong><small>Para sincronizar e ler em grupo</small></span></Link>}
      </div>
    </aside>

    <main id="conteudo" ref={mainRef} tabIndex={-1} className="page-content">
      {!personal&&<nav className="club-subnav" aria-label="Navegação do clube">{[['/app','Visão geral'],['/app/wall','Mural'],['/app/forum','Fórum'],['/app/library','Leituras'],['/app/calendar','Encontros'],['/app/gallery','Galeria'],[`/clubs/${scope}`,['owner','admin'].includes(snapshot?.role??'member')?'Membros e administração':'Membros']].map(([to,label])=><NavLink key={to} to={to} end={to==='/app'}>{label}</NavLink>)}{['owner','admin','moderator'].includes(snapshot?.role??'member')&&<NavLink to={`/app/moderation?club=${scope}`}>Moderação</NavLink>}</nav>}
      {showVisitorNote && <div className="notice visitor-note"><span><strong>Entre, fique à vontade.</strong><span>Use sem cadastro. Seus dados ficam neste navegador; exporte um backup no Perfil. Para sincronizar ou participar de um clube, <Link to="/account">entre na sua conta</Link>.</span></span><button type="button" className="icon-button" aria-label="Dispensar aviso" onClick={dismiss}><X size={18} /></button></div>}
      {unread && <p className="toast-status" role="status">{unread}</p>}
      {error && <div role="alert" className="access-error">{error} {['AUTH_REQUIRED','EMAIL_NOT_VERIFIED'].includes(errorCode)?<button type="button" onClick={()=>void reenter()}>Entrar novamente</button>:<button type="button" onClick={() => void refresh()}>Recarregar</button>}</div>}
      {accountError&&<p role="alert">{accountError}</p>}
      {loading ? <SkeletonPage label="Abrindo seu espaço…" /> : snapshot ? <div key={pathname} className="route-view"><Suspense fallback={<SkeletonPage label="Abrindo esta página…"/>}><Outlet /></Suspense></div> : !error ? <p role="status">Escolha seu espaço para começar.</p> : null}
    </main>

    {menu && <div className="drawer-layer" onMouseDown={() => setMenu(false)}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" onMouseDown={e => e.stopPropagation()}>
        <div className="drawer-header"><div><span className="eyebrow">Clube do Livro</span><h2 id="drawer-title">Seu universo de leitura</h2></div><button ref={closeRef} className="icon-button" aria-label="Fechar menu" onClick={() => setMenu(false)}><X /></button></div>
        <nav className="drawer-nav" aria-label="Menu do aplicativo">
          {[...extra, ...(user ? [] : [{ to: '/account', name: 'Entrar ou criar conta', icon: LogIn, hint: 'Sincronize e participe de clubes' }])].map(({ to, name, icon: Icon, hint }) => <NavLink key={to} to={to} onClick={() => setMenu(false)}><span className="nav-icon"><Icon size={20} aria-hidden="true" /></span><span>{name}{hint && <small>{hint}</small>}</span><ChevronRight size={18} aria-hidden="true" /></NavLink>)}
        </nav>
        <p className="drawer-note">Você pode usar seu espaço pessoal sem participar de nenhum clube.</p>
      </aside>
    </div>}
  </div>
}
