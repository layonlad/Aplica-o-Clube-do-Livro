import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, BookOpen, CalendarDays, ChevronRight, Download, History, KeyRound, Library, LogIn, LogOut, NotebookPen, Palette, ShieldCheck, Sparkles, Ticket, UserCog, UserRound, UsersRound, type LucideIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useWorkspace } from '../workspace/WorkspaceProvider'

type Row = { to: string; label: string; hint?: string; icon: LucideIcon }

/** Configurações em categorias: cada linha leva a uma tela que já existe e funciona. */
export function SettingsHub() {
  const { user, signOut } = useAuth()
  const { publicModerator } = useWorkspace()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const verified = !!user?.emailVerified
  const groups: { title: string; rows: Row[] }[] = [
    ...(verified
      ? [{ title: 'Conta', rows: [
          { to: '/app/social-profile', label: 'Editar perfil', hint: 'Foto, nome, @usuário, bio e capa', icon: UserRound },
          { to: '/app/settings', label: 'Conta e dados', hint: 'Nome, cópia de segurança e importação', icon: UserCog },
        ] }]
      : [{ title: 'Conta', rows: [{ to: '/account', label: 'Entrar ou criar conta', hint: 'Sincronize e participe de clubes', icon: LogIn }] }]),
    { title: 'Aparência', rows: [{ to: '/app/theme', label: 'Aparência e personalização', hint: 'Tema, fundo, cor do texto, fontes e tamanhos', icon: Palette }] },
    ...(verified
      ? [
          { title: 'Notificações e privacidade', rows: [
            { to: '/app/notifications', label: 'Notificações', hint: 'Central, avisos no aparelho e preferências', icon: Bell },
            { to: '/app/social-profile#privacidade', label: 'Privacidade do perfil', hint: 'Perfil público ou privado, o que aparece para os outros', icon: KeyRound },
            { to: '/app/profile?requests=1', label: 'Solicitações para seguir', hint: 'Aprovar ou recusar pedidos', icon: UsersRound },
          ] },
        ]
      : []),
    { title: 'Leitura', rows: [
      { to: '/app/library/gerenciar', label: 'Gerenciar biblioteca', hint: 'Importar EPUB, catálogo e espaço na conta', icon: Library },
      { to: '/app/reader', label: 'Minha leitura', hint: 'Abrir o livro em andamento', icon: BookOpen },
      { to: '/app/history', label: 'Histórico', hint: 'Leituras concluídas', icon: History },
      { to: '/app/calendar', label: 'Agenda', hint: 'Sessões de leitura e encontros', icon: CalendarDays },
      { to: '/app/forum', label: 'Caderno de leitura', hint: 'Notas e trechos pessoais', icon: NotebookPen },
      { to: '/app/nominations', label: 'Indicações e sorteio', hint: 'Escolha a próxima leitura', icon: Sparkles },
      { to: '/app/downloads', label: 'Leituras autorizadas', hint: 'Arquivos com permissão de uso', icon: Download },
    ] },
    ...(verified
      ? [{ title: 'Clubes', rows: [
          { to: '/app/clubs', label: 'Meus clubes', hint: 'Convites, criar e descobrir clubes', icon: UsersRound },
          { to: '/invite', label: 'Usar código de convite', icon: Ticket },
          ...(publicModerator ? [{ to: '/app/moderation', label: 'Moderação pública', hint: 'Denúncias da comunidade', icon: ShieldCheck }] : []),
        ] }]
      : []),
  ]
  return (
    <div className="settings-hub">
      {groups.map((group) => (
        <section key={group.title} aria-labelledby={`grupo-${group.title}`}>
          <h2 className="settings-group__title" id={`grupo-${group.title}`}>{group.title}</h2>
          <div className="settings-group">
            {group.rows.map(({ to, label, hint, icon: Icon }) => (
              <Link key={to} className="settings-row" to={to}>
                <span className="settings-row__icon"><Icon size={18} aria-hidden="true" /></span>
                <span className="settings-row__text"><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      ))}
      {user && (
        <div className="settings-group">
          <button type="button" className="settings-row settings-row--danger" onClick={() => void signOut().then(() => navigate('/account')).catch(() => setError('Não foi possível sair agora. Tente novamente.'))}>
            <span className="settings-row__icon"><LogOut size={18} aria-hidden="true" /></span>
            <span className="settings-row__text"><strong>Sair da conta</strong></span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      )}
      {error && <p role="alert" className="access-error">{error}</p>}
    </div>
  )
}
