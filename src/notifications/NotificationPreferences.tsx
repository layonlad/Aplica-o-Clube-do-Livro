import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AtSign, BellOff, BellRing, BookOpen, CalendarDays, Check, Heart, MessagesSquare, Smartphone, UsersRound, type LucideIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, readableError } from '../auth/api'
import { AppBar, SheetBody } from '../coral/kit'
import { useMyClubs } from '../coral/data'
import { usePush } from './push'
import { bannersEnabled, setBannersEnabled } from './NotificationBanner'
import type { ChatNotificationMode, NotificationPreferences as Preferences } from './types'
import './notifications.css'

const categories: { key: keyof Omit<Preferences, 'reminderMinutes'>; label: string; hint: string; icon: LucideIcon }[] = [
  { key: 'interactions', label: 'Curtidas, comentários e respostas', hint: 'Inclui novos seguidores e pedidos para seguir', icon: Heart },
  { key: 'mentions', label: 'Menções', hint: 'Quando alguém chama você com @', icon: AtSign },
  { key: 'clubs', label: 'Atividade dos clubes', hint: 'Mural, fotos, debates do fórum, convites e pedidos de entrada', icon: UsersRound },
  { key: 'events', label: 'Encontros do clube', hint: 'Novos encontros, mudanças e lembretes', icon: CalendarDays },
  { key: 'readings', label: 'Atividades de leitura', hint: 'Livro novo e mudança na leitura do clube', icon: BookOpen },
]
const chatModes: { id: ChatNotificationMode; label: string }[] = [
  { id: 'all', label: 'Todas as mensagens' },
  { id: 'mentions', label: 'Só menções e respostas' },
  { id: 'announcements', label: 'Só comunicados' },
  { id: 'silent', label: 'Silenciado' },
]
const chatEnabled = import.meta.env.VITE_CLUB_CHAT_ENABLED === 'true'

/** Configurações → Notificações. Tudo é salvo na conta (vale em todos os aparelhos), menos o que diz "neste aparelho". */
export function NotificationPreferences() {
  const { user } = useAuth()
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [saving, setSaving] = useState(false)
  const [banners, setBanners] = useState(bannersEnabled)
  const pending = useRef(0)

  useEffect(() => {
    if (!user?.emailVerified) return
    let live = true
    // Recarrega ao voltar para a tela: uma mudança feita em outro aparelho aparece aqui.
    const load = () => {
      if (pending.current) return
      apiRequest<Preferences>(user, '/me/notification-preferences')
        .then((value) => live && !pending.current && setPrefs(value))
        .catch((err) => live && setError(readableError(err)))
    }
    load()
    const visible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', visible)
    return () => { live = false; document.removeEventListener('visibilitychange', visible) }
  }, [user?.uid, user?.emailVerified])

  async function save(next: Preferences) {
    if (!user || !prefs) return
    const before = prefs
    setPrefs(next)
    setSaved('')
    setError('')
    setSaving(true)
    pending.current++
    try {
      await apiRequest(user, '/me/notification-preferences', 'POST', next)
      setSaved('Preferências salvas na sua conta.')
    } catch (err) {
      setPrefs(before)
      setError(`Não foi possível salvar: ${readableError(err)}`)
    } finally {
      pending.current--
      setSaving(false)
    }
  }

  return (
    <div className="notification-preferences">
      <AppBar title="Notificações" subtitle="Configurações" back="/app/notifications" />
      <SheetBody>
        {!user?.emailVerified ? (
          <div className="soft-empty">
            <BellRing size={28} aria-hidden="true" />
            <h2 className="soft-empty__title">Entre para configurar as notificações</h2>
            <Link className="pill-button pill-button--solid" to="/account">Entrar</Link>
          </div>
        ) : (
          <>
            <PushCard />

            <section aria-labelledby="pref-app">
              <h2 className="settings-group__title" id="pref-app">Dentro do aplicativo</h2>
              <div className="settings-group">
                <label className="settings-row pref-row">
                  <span className="settings-row__icon"><Smartphone size={18} aria-hidden="true" /></span>
                  <span className="settings-row__text"><strong>Avisos no topo da tela</strong><small>Um aviso discreto quando chega algo novo. Vale neste aparelho; não aparece durante a leitura.</small></span>
                  <span className="toggle"><input type="checkbox" checked={banners} onChange={(event) => { setBannersEnabled(event.target.checked); setBanners(event.target.checked) }} /></span>
                </label>
              </div>
            </section>

            <section aria-labelledby="pref-what" aria-busy={!prefs}>
              <h2 className="settings-group__title" id="pref-what">O que acompanhar</h2>
              {!prefs && !error && <span className="skeleton" style={{ display: 'block', height: 280, borderRadius: 16 }} aria-hidden="true" />}
              {prefs && (
                <div className="settings-group">
                  {categories.map(({ key, label, hint, icon: Icon }) => (
                    <label key={key} className="settings-row pref-row">
                      <span className="settings-row__icon"><Icon size={18} aria-hidden="true" /></span>
                      <span className="settings-row__text"><strong>{label}</strong><small>{hint}</small></span>
                      <span className="toggle"><input type="checkbox" checked={!!prefs[key]} disabled={saving} onChange={(event) => void save({ ...prefs, [key]: event.target.checked })} /></span>
                    </label>
                  ))}
                  <label className="settings-row pref-row pref-row--select">
                    <span className="settings-row__icon"><CalendarDays size={18} aria-hidden="true" /></span>
                    <span className="settings-row__text"><strong>Lembrete de encontro</strong><small>Quanto tempo antes avisar</small></span>
                    <select className="pref-select" value={prefs.reminderMinutes ?? 1440} disabled={saving || !prefs.events} onChange={(event) => void save({ ...prefs, reminderMinutes: Number(event.target.value) as Preferences['reminderMinutes'] })} aria-label="Lembrete de encontro">
                      <option value={1440}>1 dia antes</option>
                      <option value={60}>1 hora antes</option>
                      <option value={15}>15 minutos antes</option>
                      <option value={0}>Sem lembrete</option>
                    </select>
                  </label>
                </div>
              )}
              <p className="pref-feedback" role="status" aria-live="polite">{saving ? 'Salvando…' : saved && <><Check size={14} aria-hidden="true" />{saved}</>}</p>
              {error && <div role="alert" className="access-error">{error}<button type="button" onClick={() => window.location.reload()}>Recarregar</button></div>}
            </section>

            {chatEnabled && <ChatModes />}
          </>
        )}
      </SheetBody>
    </div>
  )
}

/** Push neste aparelho: explica antes de pedir, pede uma vez e orienta quando o navegador bloqueia. */
export function PushCard() {
  const push = usePush()
  const { status, support } = push
  const ios = support.ios
  return (
    <section className={`push-card push-card--${status}`} aria-labelledby="push-card-title">
      <span className="push-card__icon" aria-hidden="true">{status === 'on' ? <BellRing size={22} /> : <BellOff size={22} />}</span>
      <div className="push-card__body">
        <h2 id="push-card-title">Notificações neste aparelho</h2>
        {status === 'loading' && <p>Verificando este aparelho…</p>}
        {status === 'on' && <p>Ativadas. Você recebe avisos mesmo com o aplicativo fechado. O texto das conversas fica dentro do app.</p>}
        {status === 'off' && <p>Receba avisos quando houver mensagens nos seus clubes, novas publicações e destaques da comunidade.</p>}
        {status === 'denied' && (
          <p>
            As notificações estão bloqueadas para este site.{' '}
            {ios ? 'No iPhone, abra Ajustes › Notificações › Clubes de leitura e permita os avisos.'
              : /Android/i.test(navigator.userAgent) ? 'No Android, toque no cadeado ao lado do endereço › Permissões › Notificações › Permitir.'
                : 'Clique no ícone ao lado do endereço do site, permita as notificações e volte a esta tela.'}
          </p>
        )}
        {status === 'unsupported' && (
          <p>
            {support.reason}
            {ios && <> No Safari, toque em Compartilhar › Adicionar à Tela de Início.</>}
          </p>
        )}
        {status === 'unavailable' && <p>O envio para o aparelho ainda não foi ligado no servidor. A central e os avisos dentro do app continuam funcionando.</p>}
        {push.error && <p role="alert" className="push-card__error">{push.error}</p>}
        {status === 'off' && (
          <button type="button" className="pill-button pill-button--solid" disabled={push.busy} aria-busy={push.busy} onClick={() => void push.enable()}>Ativar notificações</button>
        )}
        {status === 'on' && (
          <button type="button" className="pill-button" disabled={push.busy} aria-busy={push.busy} onClick={() => void push.disable()}>Desativar neste aparelho</button>
        )}
        {status === 'denied' && push.enabled && (
          <button type="button" className="pill-button" disabled={push.busy} onClick={() => void push.disable()}>Remover este aparelho</button>
        )}
      </div>
    </section>
  )
}

/** Modo de aviso do chat em cada clube (salvo no clube, vale em todos os aparelhos). */
function ChatModes() {
  const { user } = useAuth()
  const clubs = useMyClubs()
  const [modes, setModes] = useState<Record<string, ChatNotificationMode | 'error'>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (!user || !clubs.items) return
    let live = true
    for (const club of clubs.items)
      apiRequest<{ preference: ChatNotificationMode }>(user, `/clubs/${club.id}/chat/settings`)
        .then((value) => live && setModes((current) => ({ ...current, [club.id]: value.preference })))
        .catch(() => live && setModes((current) => ({ ...current, [club.id]: 'error' })))
    return () => { live = false }
  }, [user?.uid, clubs.items?.map((club) => club.id).join()])
  async function change(clubId: string, name: string, value: ChatNotificationMode) {
    if (!user) return
    const before = modes[clubId]
    setModes((current) => ({ ...current, [clubId]: value }))
    setSaving(clubId)
    setMessage('')
    try {
      await apiRequest(user, `/clubs/${clubId}/chat/settings`, 'POST', { type: 'preference', value })
      setMessage(`${name}: ${chatModes.find((mode) => mode.id === value)!.label.toLowerCase()}.`)
    } catch (err) {
      setModes((current) => ({ ...current, [clubId]: before }))
      setMessage(`Não foi possível salvar ${name}: ${readableError(err)}`)
    } finally {
      setSaving(null)
    }
  }
  return (
    <section aria-labelledby="pref-chat">
      <h2 className="settings-group__title" id="pref-chat">Chat de cada clube</h2>
      {clubs.items === null ? (
        <span className="skeleton" style={{ display: 'block', height: 120, borderRadius: 16 }} aria-hidden="true" />
      ) : clubs.items.length ? (
        <div className="settings-group">
          {clubs.items.map((club) => {
            const mode = modes[club.id]
            return (
              <label key={club.id} className="settings-row pref-row pref-row--select">
                <span className="settings-row__icon">{mode === 'silent' ? <BellOff size={18} aria-hidden="true" /> : <MessagesSquare size={18} aria-hidden="true" />}</span>
                <span className="settings-row__text"><strong>{club.name}</strong><small>{mode === 'error' ? 'Chat indisponível neste clube' : mode === 'silent' ? 'Clube silenciado no chat' : 'Mensagens do chat'}</small></span>
                {mode && mode !== 'error' ? (
                  <select className="pref-select" value={mode} disabled={saving === club.id} aria-label={`Avisos do chat de ${club.name}`} onChange={(event) => void change(club.id, club.name, event.target.value as ChatNotificationMode)}>
                    {chatModes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                ) : !mode ? <span className="skeleton" style={{ width: 120, height: 28, borderRadius: 8 }} aria-hidden="true" /> : null}
              </label>
            )
          })}
        </div>
      ) : (
        <p className="soft-empty">Você ainda não participa de clubes.</p>
      )}
      <p className="pref-feedback" role="status" aria-live="polite">{message}</p>
    </section>
  )
}
