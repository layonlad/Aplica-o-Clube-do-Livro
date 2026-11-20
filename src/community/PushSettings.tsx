import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { usePush } from '../notifications/push'
export { pushSupport } from '../notifications/push'

/** Cartão compacto de push (usado em Conta e dados). A lógica é a mesma da tela de preferências. */
export function PushSettings() {
  const { user } = useAuth()
  const push = usePush()
  const { support, permission, enabled, busy, config, error } = push
  const state = !support.available
    ? 'Indisponível'
    : permission === 'denied'
      ? 'Bloqueado'
      : permission === 'default'
        ? 'Não solicitado'
        : enabled
          ? 'Permitido · ativado neste aparelho'
          : 'Permitido · desativado neste aparelho'
  return (
    <section className="card push-settings">
      <h2>Receber notificações</h2>
      <p>Acompanhe respostas, menções e encontros mesmo com o aplicativo fechado. O conteúdo das conversas fica dentro do app.</p>
      {!user?.emailVerified ? (
        <p>
          <Link to="/account">Entre para configurar os avisos</Link>.
        </p>
      ) : (
        <>
          <label className="workspace-check">
            <input
              type="checkbox"
              checked={enabled && permission === 'granted'}
              disabled={busy || !support.available || !config?.enabled || permission === 'denied'}
              onChange={(event) => void (event.target.checked ? push.enable() : push.disable())}
            />
            Receber notificações neste aparelho
          </label>
          <p className="t-caption" role="status">{state}</p>
          {!support.available && <p>{support.reason}</p>}
          {permission === 'denied' && enabled && (
            <button type="button" className="button button--ghost" disabled={busy} onClick={() => void push.disable()}>
              Desativar neste aparelho
            </button>
          )}
          {permission === 'denied' && <p>Permita notificações nas configurações do navegador ou do sistema e volte a esta tela.</p>}
          {support.available && config && !config.enabled && <p>O envio push ainda aguarda ativação. Suas notificações internas continuam disponíveis.</p>}
          {error && <p role="alert">{error}</p>}
          <Link to="/app/notifications/preferencias">Central e preferências de notificações →</Link>
        </>
      )}
    </section>
  )
}
