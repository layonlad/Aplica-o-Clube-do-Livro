import { Suspense, useEffect, useRef, useState, type MouseEvent } from 'react'
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Bell, BookOpen, CalendarDays, Camera, Compass, Download, History, House, LogIn, MessagesSquare, NotebookPen, Palette, Search, Settings, ShieldCheck, Sparkles, UserRound, UsersRound, type LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { NotificationBell } from '../community/NotificationBell'
import { SpaceSwitcher } from '../components/SpaceSwitcher'
import { useAuth } from '../auth/AuthProvider'
import { SkeletonPage } from '../components/ui'
import { UserAvatar, useOwnAvatar } from '../components/UserAvatar'
import { AppearanceSync } from '../app/AppearanceSettings'
import { AppBar, SheetBody } from '../coral/kit'
import { BookOpenerLayer } from './BookOpener'
import { CoverBackdrop } from './CoverBackdrop'
import { useWorkspace } from './WorkspaceProvider'

type NavItem = { to: string; name: string; icon: LucideIcon; match: (path: string) => boolean; className: string }

/** Barra inferior: a mesma ordem das referências. */
const nav: NavItem[] = [
  { to: '/app', name: 'Início', icon: House, className: 'nav-home', match: (path) => path === '/app' },
  { to: '/app/explore', name: 'Explorar', icon: Compass, className: 'nav-explore', match: (path) => path.startsWith('/app/explore') },
  { to: '/app/library', name: 'Biblioteca', icon: BookOpen, className: 'nav-library', match: (path) => ['/app/library', '/app/reader', '/app/history', '/app/downloads'].some((item) => path.startsWith(item)) },
  { to: '/app/community', name: 'Comunidade', icon: UsersRound, className: 'nav-community', match: (path) => ['/app/community', '/app/clubs', '/app/wall', '/app/gallery', '/app/forum', '/app/calendar', '/app/nominations'].some((item) => path.startsWith(item)) },
  { to: '/app/profile', name: 'Perfil', icon: UserRound, className: 'nav-profile', match: (path) => ['/app/profile', '/app/people/', '/app/social-profile', '/app/settings', '/app/theme', '/app/ajustes', '/app/notifications', '/app/moderation'].some((item) => path.startsWith(item)) },
]

/** Telas que desenham o próprio cabeçalho em gradiente (as seis das referências). */
const MAIN = ['/app', '/app/explore', '/app/explore/gratuitos', '/app/library', '/app/community', '/app/profile', '/app/clubs']

/** Título da barra compacta das telas internas. */
function titleFor(pathname: string, personal: boolean, clubName: string) {
  const table: [string, string][] = [
    ['/app/reader', 'Leitura'],
    ['/app/calendar', personal ? 'Agenda' : 'Encontros'],
    ['/app/forum', personal ? 'Caderno de leitura' : 'Fórum do clube'],
    ['/app/nominations', 'Indicações e sorteio'],
    ['/app/history', 'Histórico de leituras'],
    ['/app/downloads', 'Leituras autorizadas'],
    ['/app/notifications', 'Notificações'],
    ['/app/moderation', 'Moderação'],
    ['/app/people/', 'Perfil'],
    ['/app/social-profile', 'Editar perfil'],
    ['/app/settings', 'Conta e dados'],
    ['/app/theme', 'Aparência e personalização'],
    ['/app/ajustes', 'Configurações'],
    ['/app/wall', 'Mural'],
    ['/app/gallery', 'Galeria de encontros'],
    ['/app/library/gerenciar', 'Gerenciar biblioteca'],
    ['/app/library', 'Leituras do clube'],
    ['/app', clubName],
  ]
  return table.find(([path]) => (path === '/app' ? pathname === '/app' : pathname.startsWith(path)))?.[1] ?? clubName
}

export function WorkspaceShell() {
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  useEffect(() => {
    const viewport = window.visualViewport
    let baseline = viewport?.height ?? window.innerHeight, width = window.innerWidth
    const update = () => {
      const height = viewport?.height ?? window.innerHeight
      if (window.innerWidth !== width) { width = window.innerWidth; baseline = height }
      const active = document.activeElement
      const editing = active instanceof HTMLTextAreaElement || (active instanceof HTMLInputElement && !['button', 'checkbox', 'radio', 'color', 'file'].includes(active.type))
      if (!editing) baseline = Math.max(baseline, height)
      setKeyboardOpen(editing && (baseline - height > 150 || window.innerHeight - height > 150))
    }
    const focus = () => requestAnimationFrame(update)
    viewport?.addEventListener('resize', update); window.addEventListener('resize', update); document.addEventListener('focusin', focus); document.addEventListener('focusout', focus)
    return () => { viewport?.removeEventListener('resize', update); window.removeEventListener('resize', update); document.removeEventListener('focusin', focus); document.removeEventListener('focusout', focus) }
  }, [])

  const { publicModerator, snapshot, scope, scopeName, clubs, setScope, loading, busy, error, errorCode, refresh } = useWorkspace()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [accountError, setAccountError] = useState('')
  async function reenter() { try { await signOut(); navigate('/account') } catch { setAccountError('Não foi possível sair da sessão. Tente novamente.') } }
  const [params] = useSearchParams()
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const unread = params.get('notice')
  const personal = scope === 'personal'
  const globalPage = ['/app/community', '/app/explore', '/app/people/', '/app/social-profile', '/app/profile', '/app/settings', '/app/notifications', '/app/downloads', '/app/moderation', '/app/clubs', '/app/ajustes', '/app/theme'].some((path) => pathname.startsWith(path))
  const reading = /^\/app\/reader\/[^/]+/.test(pathname)
  // Telas principais desenham o próprio cabeçalho; em um clube, Início e Biblioteca mostram o espaço do clube.
  const main = (MAIN.includes(pathname) || pathname.startsWith('/app/people/')) && (personal || !['/app', '/app/library'].includes(pathname))
  const clubPage = !personal && !globalPage

  /** Menu lateral do computador: atalhos que no celular ficam em Perfil → Configurações. */
  const groups: { label: string; items: { to: string; name: string; icon: LucideIcon }[] }[] = [
    { label: 'Sua leitura', items: [
      { to: '/app/reader', name: 'Minha leitura', icon: BookOpen },
      { to: '/app/calendar', name: personal ? 'Agenda' : 'Encontros', icon: CalendarDays },
      { to: '/app/forum', name: personal ? 'Caderno de leitura' : 'Fórum do clube', icon: personal ? NotebookPen : MessagesSquare },
      { to: '/app/nominations', name: 'Indicações e sorteio', icon: Sparkles },
      { to: '/app/history', name: 'Histórico', icon: History },
      { to: '/app/downloads', name: 'Leituras autorizadas', icon: Download },
    ] },
    { label: 'Comunidade', items: [
      { to: '/app/clubs', name: 'Clubes', icon: UsersRound },
      { to: '/app/notifications', name: 'Notificações', icon: Bell },
      ...(publicModerator ? [{ to: '/app/moderation', name: 'Moderação pública', icon: ShieldCheck }] : []),
    ] },
    ...(!personal ? [{ label: 'Neste clube', items: [
      { to: '/app/wall', name: 'Mural', icon: MessagesSquare },
      { to: '/app/gallery', name: 'Galeria de encontros', icon: Camera },
    ] }] : []),
    { label: 'Ajustes', items: [
      { to: '/app/ajustes', name: 'Configurações', icon: Settings },
      { to: '/app/theme', name: 'Aparência', icon: Palette },
      ...(user ? [] : [{ to: '/account', name: 'Entrar ou criar conta', icon: LogIn }]),
    ] },
  ]

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }) }, [pathname])
  // Cor da barra de status do celular acompanha o gradiente do cabeçalho.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    const previous = meta?.getAttribute('content')
    if (!reading && document.documentElement.dataset.theme !== 'dark') meta?.setAttribute('content', '#f9694e')
    return () => { if (previous) meta?.setAttribute('content', previous) }
  }, [reading, pathname])

  function skip(event: MouseEvent) { event.preventDefault(); mainRef.current?.focus() }
  const ownAvatar = useOwnAvatar()

  const content = loading && !snapshot && !globalPage
    ? <SkeletonPage label="Abrindo seu espaço…" />
    : snapshot || globalPage
      ? <Suspense fallback={<SkeletonPage label="Abrindo esta página…" />}><Outlet /></Suspense>
      : !error ? <p role="status">Escolha seu espaço para começar.</p> : null
  const notices = <>
    {unread && <p className="toast-status" role="status">{unread}</p>}
    {error && <div role="alert" className="access-error">{error} {['AUTH_REQUIRED', 'EMAIL_NOT_VERIFIED'].includes(errorCode) ? <button type="button" onClick={() => void reenter()}>Entrar novamente</button> : <button type="button" onClick={() => void refresh()}>Recarregar</button>}</div>}
    {accountError && <p role="alert" className="access-error">{accountError}</p>}
  </>

  return <div className={`app-frame workspace-app ${reading ? 'is-reading' : ''} ${main ? 'is-main' : ''}`} data-keyboard={keyboardOpen ? 'open' : 'closed'} data-space={globalPage ? 'community' : personal ? 'personal' : 'club'}>
    <a className="skip-link" href="#conteudo" onClick={skip}>Pular para o conteúdo</a>
    <AppearanceSync />
    <BookOpenerLayer />
    <CoverBackdrop />
    <aside className="app-rail">
      <header className="app-header rail-only">
        <SpaceSwitcher label={globalPage ? 'Espaço para suas leituras' : 'Você está em'} disabled={busy} value={scope} options={[{ id: 'personal', name: 'Meu espaço pessoal' }, ...clubs]} onChange={(value) => { setScope(value); if (globalPage) navigate('/app') }} />
        <NotificationBell />
      </header>
      <nav className="bottom-nav" aria-label="Navegação principal">
        {nav.map(({ to, name, icon: Icon, match, className }) => {
          const active = match(pathname)
          return <Link key={to} to={to} className={`${className} ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined} onClick={() => { if (to === '/app' && !personal && active) setScope('personal') }}>
            <Icon size={24} strokeWidth={active ? 2 : 1.7} aria-hidden="true" />
            <span>{name}</span>
          </Link>
        })}
      </nav>
      <nav className="rail-more rail-only" aria-label="Mais do aplicativo">
        {groups.map((group) => <div className="rail-group" key={group.label}>
          <p className="rail-section-label">{group.label}</p>
          {group.items.map(({ to, name, icon: Icon }) => <Link key={to} to={to} className={pathname.startsWith(to) ? 'active' : ''}><Icon size={19} strokeWidth={1.8} aria-hidden="true" /><span>{name}</span></Link>)}
        </div>)}
      </nav>
      <div className="rail-foot rail-only">
        {user
          ? <Link className="rail-account" to="/app/profile"><UserAvatar name={user.displayName || user.email || '?'} avatarId={ownAvatar} size="md" /><span><strong>{user.displayName || 'Sua conta'}</strong><small>Ver perfil</small></span></Link>
          : <Link className="rail-account" to="/account"><span className="avatar avatar--md" aria-hidden="true"><LogIn size={18} /></span><span><strong>Entrar ou criar conta</strong><small>Para sincronizar e ler em grupo</small></span></Link>}
      </div>
    </aside>

    <main id="conteudo" ref={mainRef} tabIndex={-1} className="page-content">
      {reading || main ? <>
        {main ? null : notices}
        <motion.div key={reading ? 'reader' : pathname} className={reading ? 'route-view route-view--reader' : 'route-view'} initial={reading ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
          {main && (unread || error || accountError) ? <div className="main-notices">{notices}</div> : null}
          {content}
        </motion.div>
      </> : <>
        <AppBar
          title={titleFor(pathname, personal, scopeName)}
          subtitle={clubPage && pathname !== '/app' ? scopeName : clubPage ? 'Clube' : undefined}
          back={clubPage && pathname === '/app' ? () => { setScope('personal'); navigate('/app/clubs') } : undefined}
          actions={clubPage ? <Link className="hero-icon" to={`/clubs/${scope}`} aria-label="Membros e administração do clube"><UsersRound size={19} /></Link> : <Link className="hero-icon" to="/app/explore?busca=1" aria-label="Pesquisar"><Search size={19} /></Link>}
        />
        <SheetBody>
          {clubPage && <nav className="club-subnav pill-tabs" aria-label="Navegação do clube">{[['/app', 'Visão geral'], ['/app/wall', 'Mural'], ['/app/forum', 'Fórum'], ['/app/library', 'Leituras'], ['/app/calendar', 'Encontros'], ['/app/gallery', 'Galeria'], [`/clubs/${scope}`, ['owner', 'admin'].includes(snapshot?.role ?? 'member') ? 'Membros e administração' : 'Membros']].map(([to, label]) => { const active = to === '/app' ? pathname === '/app' : pathname.startsWith(to); return <Link key={to} to={to} aria-current={active ? 'page' : undefined} className={active ? 'active' : ''}>{label}</Link> })}{['owner', 'admin', 'moderator'].includes(snapshot?.role ?? 'member') && <Link to={`/app/moderation?club=${scope}`}>Moderação</Link>}</nav>}
          {notices}
          <motion.div key={pathname} className="route-view" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            {content}
          </motion.div>
        </SheetBody>
      </>}
    </main>
  </div>
}
