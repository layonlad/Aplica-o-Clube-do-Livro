import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Palette } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, readableError } from '../auth/api'
import { Card } from '../components/ui'
import { AvatarUploader } from '../components/AvatarUploader'
import { UserAvatar } from '../components/UserAvatar'
import { useTheme } from '../app/ThemeProvider'
import { fontOptions, presetOptions } from '../app/appearance'
import { useWorkspace } from './WorkspaceProvider'

/**
 * Topo da página "Meu perfil": foto (com recorte e envio) e a seção própria de Aparência e personalização.
 */
export function ProfileIdentityCard() {
  const { user } = useAuth()
  const { snapshot } = useWorkspace()
  const { appearance } = useTheme()
  const [profile, setProfile] = useState<{ displayName: string; avatarId: string | null } | null>(null)
  const [error, setError] = useState('')
  const verified = !!user?.emailVerified
  useEffect(() => {
    if (!verified || !user) return
    let live = true
    apiRequest<{ displayName: string; avatarId: string | null }>(user, '/me/profile')
      .then((value) => live && setProfile(value))
      .catch((err) => live && setError(readableError(err)))
    return () => {
      live = false
    }
  }, [user?.uid, verified])
  const name = user?.displayName || profile?.displayName || 'Leitor'
  const preset = presetOptions.find((item) => item.id === appearance.preset)
  return (
    <>
      <Card className="profile-identity">
        {verified ? (
          profile ? (
            <>
              <AvatarUploader
                name={name}
                avatarId={profile.avatarId}
                onChange={(avatarId) => setProfile((value) => value && { ...value, avatarId })}
              />
              {snapshot?.actorId && snapshot.actorId !== 'visitor' && (
                <p className="profile-identity__links">
                  <Link className="text-link" to={`/app/people/${snapshot.actorId}`}>
                    Ver como os outros leitores me veem <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                  <Link className="text-link" to="/app/social-profile">
                    Nome público, biografia e privacidade <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                </p>
              )}
            </>
          ) : error ? (
            <p role="alert" className="access-error">{error}</p>
          ) : (
            <p className="t-caption">Abrindo sua foto…</p>
          )
        ) : (
          <div className="avatar-uploader">
            <UserAvatar name={name} size="xl" />
            <div className="avatar-uploader__body">
              <h2>Sua foto</h2>
              <p>
                Para adicionar uma foto que apareça nos murais, no fórum e nos clubes, entre na sua
                conta. Sem conta, suas leituras continuam neste navegador.
              </p>
              <Link className="button-link" to="/account">
                Entrar ou criar conta →
              </Link>
            </div>
          </div>
        )}
      </Card>
      <Link className="card card--interactive appearance-entry" to="/app/theme">
        <span className="appearance-entry__icon">
          <Palette size={22} aria-hidden="true" />
        </span>
        <span className="appearance-entry__text">
          <strong>Aparência e personalização</strong>
          <small>
            {preset?.label ?? 'Padrão'} ·{' '}
            {fontOptions.find((font) => font.id === appearance.headingFont)?.label} nos títulos ·{' '}
            {fontOptions.find((font) => font.id === appearance.bodyFont)?.label} nos textos
          </small>
        </span>
        <ArrowRight size={18} aria-hidden="true" />
      </Link>
    </>
  )
}
