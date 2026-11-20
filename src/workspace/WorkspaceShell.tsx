import { Suspense, useEffect, useRef, useState, type MouseEvent } from 'react'
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { BookOpen, Compass, House, Search, UserRound, UsersRound, type LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { NotificationBanner } from '../notifications/NotificationBanner'
import { useAuth } from '../auth/AuthProvider'
import { SkeletonPage } from '../components/ui'
import { measureApp } from '../app/performance'
import { AppErrorBoundary } from '../app/AppErrorBoundary'
import { preloadTab, warmTabs } from './tab-modules'
import { useTabScroll } from './useTabScroll'
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
const MAIN = ['/app', '/app/explore', '/app/explore/gratuitos', '/app/library', '/app/community', '/app/profile', '/app/clubs', '/app/notifications', '/app/notifications/preferencias']

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
    ['/app/library/integracoes', 'Integrações de Leitura'],
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
    let frame = 0
    const focus = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update) }
    viewport?.addEventListener('resize', update); window.addEventListener('resize', update); document.addEventListener('focusin', focus); document.addEventListener('focusout', focus)
    return () => { cancelAnimationFrame(frame); viewport?.removeEventListener('resize', update); window.removeEventListener('resize', update); document.removeEventListener('focusin', focus); document.removeEventListener('focusout', focus) }
  }, [])

  const { snapshot, scope, scopeName, clubs, setScope, loading, error, errorCode, refresh } = useWorkspace()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [accountError, setAccountError] = useState('')
  async function reenter() { try { await signOut(); navigate('/account') } catch { setAccountError('Não foi possível sair da sessão. Tente novamente.') } }
  const [params] = useSearchParams()
  const { pathname, search } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const tabPressed = useRef<number>()
  const unread = params.get('notice')
  const personal = scope === 'personal'
  const globalPage = ['/app/community', '/app/explore', '/app/people/', '/app/social-profile', '/app/profile', '/app/settings', '/app/notifications', '/app/downloads', '/app/moderation', '/app/clubs', '/app/ajustes', '/app/theme'].some((path) => pathname.startsWith(path))
  const reading = /^\/app\/reader\/[^/]+/.test(pathname)
  // Telas principais desenham o próprio cabeçalho; em um clube, Início e Biblioteca mostram o espaço do clube.
  const main = (MAIN.includes(pathname) || pathname.startsWith('/app/people/')) && (personal || !['/app', '/app/library'].includes(pathname))
  // Moderação do clube abre como tela global, mas pertence ao clube: mesma faixa escura e as mesmas abas.
  const clubModeration = pathname.startsWith('/app/moderation') && !!params.get('club') && params.get('club') === scope
  const clubPage = (!personal && !globalPage) || clubModeration
  const subnavRef = useRef<HTMLElement>(null)
  // A aba ativa sempre aparece inteira na faixa rolável (sem animar se a pessoa prefere menos movimento).
  useEffect(() => {
    const active = subnavRef.current?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!active || !subnavRef.current) return
    const nav = subnavRef.current
    const left = active.offsetLeft - nav.clientWidth / 2 + active.offsetWidth / 2
    nav.scrollTo({ left: Math.max(0, left), behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [pathname, scope])

  useTabScroll(pathname, search, scope, mainRef)
  useEffect(() => {
    if (tabPressed.current === undefined) return
    measureApp('tab-render', tabPressed.current)
    tabPressed.current = undefined
  }, [pathname])
  useEffect(() => {
    const timer = setTimeout(() => warmTabs(pathname), 1200)
    return () => clearTimeout(timer)
  }, [pathname])
  // Cor da barra de status do celular acompanha o gradiente do cabeçalho.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    const previous = meta?.getAttribute('content')
    if (!reading && document.documentElement.dataset.theme !== 'dark') meta?.setAttribute('content', '#f9694e')
    return () => { if (previous) meta?.setAttribute('content', previous) }
  }, [reading, pathname])

  function skip(event: MouseEvent) { event.preventDefault(); mainRef.current?.focus() }

  const content = loading && !snapshot && !globalPage
    ? <SkeletonPage label="Abrindo seu espaço…" />
    : snapshot || globalPage
      ? <AppErrorBoundary key={reading ? 'reader' : pathname}><Suspense fallback={<SkeletonPage label="Abrindo esta página…" />}><Outlet /></Suspense></AppErrorBoundary>
      : !error ? <p role="status">Escolha seu espaço para começar.</p> : null
  const notices = <>
    {unread && <p className="toast-status" role="status">{unread}</p>}
    {error && <div role="alert" className="access-error">{error} {['AUTH_REQUIRED', 'EMAIL_NOT_VERIFIED'].includes(errorCode) ? <button type="button" onClick={() => void reenter()}>Entrar novamente</button> : <button type="button" onClick={() => void refresh()}>Recarregar</button>}</div>}
    {accountError && <p role="alert" className="access-error">{accountError}</p>}
  </>

  if (pathname==='/app/chat' && import.meta.env.VITE_CLUB_CHAT_ENABLED==='true') return <main className="club-chat-page"><AppearanceSync/><NotificationBanner/>{notices}{content}</main>
  return <div className={`app-frame workspace-app ${reading ? 'is-reading' : ''} ${main ? 'is-main' : ''}`} data-keyboard={keyboardOpen ? 'open' : 'closed'} data-space={clubPage ? 'club' : globalPage ? 'community' : personal ? 'personal' : 'club'}>
    <a className="skip-link" href="#conteudo" onClick={skip}>Pular para o conteúdo</a>
    <AppearanceSync />
    <NotificationBanner />
    <BookOpenerLayer />
    <CoverBackdrop />
    <aside className="app-rail">
      <nav className="bottom-nav" aria-label="Navegação principal">
        {nav.map(({ to, name, icon: Icon, match, className }) => {
          const active = match(pathname)
          return <Link key={to} to={to} className={`${className} ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined} onPointerEnter={() => preloadTab(to)} onPointerDown={() => preloadTab(to)} onFocus={() => preloadTab(to)} onClick={() => {
            if (pathname !== to) tabPressed.current = performance.now()
            if (to === '/app' && !personal && active) setScope('personal')
          }}>
            <Icon size={24} strokeWidth={active ? 2 : 1.7} aria-hidden="true" />
            <span>{name}</span>
          </Link>
        })}
      </nav>
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
          {clubPage && <nav ref={subnavRef} className="club-subnav" aria-label="Navegação do clube">{[['/app', 'Visão geral'], ['/app/wall', 'Mural'], ['/app/forum', 'Fórum'], ['/app/library', 'Leituras'], ['/app/calendar', 'Encontros'], ['/app/gallery', 'Galeria'], [`/clubs/${scope}`, ['owner', 'admin'].includes(snapshot?.role ?? 'member') ? 'Membros e administração' : 'Membros']].map(([to, label]) => { const active = to === '/app' ? pathname === '/app' : pathname.startsWith(to); return <Link key={to} to={to} aria-current={active ? 'page' : undefined} className={active ? 'active' : ''}>{label}</Link> })}{['owner', 'admin', 'moderator'].includes(snapshot?.role ?? 'member') && <Link to={`/app/moderation?club=${scope}`} aria-current={clubModeration ? 'page' : undefined} className={clubModeration ? 'active' : ''}>Moderação</Link>}</nav>}
          {notices}
          <motion.div key={pathname} className="route-view" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            {content}
          </motion.div>
        </SheetBody>
      </>}
    </main>
  </div>
}
