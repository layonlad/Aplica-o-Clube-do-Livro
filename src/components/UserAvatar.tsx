import { onSessionEnd } from '../auth/session-events'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { useAuth } from '../auth/AuthProvider'
import { cachedSocialRead } from '../community/social-api'
import { coverPalette } from './ui'

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

/** Disparado quando a própria foto muda; o detalhe é o novo id (ou null). */
export const AVATAR_EVENT = 'clube:avatar-changed'
const ownAvatar = new Map<string, Promise<string | null>>()

/**
 * Foto da própria conta (id da mídia), com uma única consulta a /me/profile por sessão
 * e atualização imediata quando a foto é trocada em "Meu perfil".
 */
export function useOwnAvatar() {
  const { user } = useAuth()
  const [avatarId, setAvatarId] = useState<string | null>(null)
  useEffect(() => {
    setAvatarId(null)
    if (!user?.emailVerified) return
    let live = true
    if (!ownAvatar.has(user.uid))
      ownAvatar.set(
        user.uid,
        cachedSocialRead<{ avatarId: string | null }>(user, '/me/profile')
          .then((value) => value.avatarId)
          .catch(() => null),
      )
    void ownAvatar.get(user.uid)!.then((value) => live && setAvatarId(value))
    const onChange = (event: Event) => {
      const next = (event as CustomEvent<string | null>).detail
      ownAvatar.set(user.uid, Promise.resolve(next))
      setAvatarId(next)
    }
    window.addEventListener(AVATAR_EVENT, onChange)
    return () => {
      live = false
      window.removeEventListener(AVATAR_EVENT, onChange)
    }
  }, [user?.uid, user?.emailVerified])
  return avatarId
}

/**
 * Cache das miniaturas de foto por id de mídia (e por sessão, porque a autorização depende de quem pede).
 * Várias publicações do mesmo autor reutilizam um único download.
 */
const cache = new Map<string, Promise<string | null>>()
onSessionEnd((uid) => {
  ownAvatar.delete(uid)
  for (const [key, request] of cache) {
    if (!key.startsWith(uid + ':')) continue
    cache.delete(key)
    void request.then((url) => { if (url) URL.revokeObjectURL(url) })
  }
})
const MAX_CACHED = 300

function avatarKey(id: string, user: User | null) {
  return `${user?.emailVerified ? user.uid : 'anon'}:${id}`
}

function loadAvatar(id: string, user: User | null): Promise<string | null> {
  const key = avatarKey(id, user)
  const cached = cache.get(key)
  if (cached) return cached
  const request = (async () => {
    const base = import.meta.env.VITE_API_URL
    if (!base) return null
    const token = user?.emailVerified ? await user.getIdToken() : null
    const response = await fetch(
      `${base.replace(/\/$/, '')}/v1/public/media/${id}/content?variant=thumbnail`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(30000),
      },
    )
    // Sem permissão ou foto removida: mostra as iniciais, sem revelar o motivo.
    if (!response.ok) return null
    return URL.createObjectURL(await response.blob())
  })().catch(() => null)
  if (cache.size >= MAX_CACHED) {
    const oldest = cache.keys().next().value
    if (oldest) {
      void cache.get(oldest)?.then((url) => url && URL.revokeObjectURL(url))
      cache.delete(oldest)
    }
  }
  cache.set(key, request)
  return request
}

/** Esquece a foto em cache (ex.: logo depois de trocar a própria foto). */
export function forgetAvatar(id: string | null | undefined) {
  if (!id) return
  for (const key of [...cache.keys()])
    if (key.endsWith(':' + id)) {
      void cache.get(key)?.then((url) => url && URL.revokeObjectURL(url))
      cache.delete(key)
    }
}

export function initialsOf(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || '?'
  )
}

function useAvatarUrl(id: string | null | undefined) {
  const { user } = useAuth()
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    setUrl(null)
    if (!id) return
    let live = true
    void loadAvatar(id, user).then((value) => live && setUrl(value))
    return () => {
      live = false
    }
  }, [id, user?.uid, user?.emailVerified])
  return url
}

/**
 * Avatar circular. Com foto autorizada mostra a imagem; caso contrário, iniciais sobre uma cor da paleta
 * escolhida de forma estável pelo nome. `src` permite mostrar uma prévia local antes de enviar.
 */
export function UserAvatar({
  name,
  avatarId,
  size = 'md',
  src,
  className = '',
}: {
  name: string
  avatarId?: string | null
  size?: AvatarSize
  src?: string | null
  className?: string
}) {
  const loaded = useAvatarUrl(src ? null : avatarId)
  const image = src ?? loaded
  const [background, ink] = coverPalette(name || '?')
  return (
    <span
      className={`user-avatar user-avatar--${size} ${image ? 'has-photo' : ''} ${className}`}
      style={image ? undefined : { background, color: ink }}
      aria-hidden="true"
    >
      {image ? <img src={image} alt="" decoding="async" /> : initialsOf(name)}
    </span>
  )
}

/**
 * Identidade do usuário: avatar + nome (com link para o perfil) e metadados opcionais.
 * Use sempre este componente onde uma pessoa aparece em uma interação social.
 */
export function UserIdentity({
  id,
  name,
  avatarId,
  size = 'md',
  meta,
  badge,
  link = true,
  className = '',
}: {
  id?: string | null
  name: string
  avatarId?: string | null
  size?: AvatarSize
  meta?: ReactNode
  badge?: ReactNode
  link?: boolean
  className?: string
}) {
  const label = <strong className="user-identity__name">{name}</strong>
  return (
    <span className={`user-identity user-identity--${size} ${className}`}>
      {link && id ? (
        <Link className="user-identity__avatar" to={`/app/people/${id}`} tabIndex={-1} aria-hidden="true">
          <UserAvatar name={name} avatarId={avatarId} size={size} />
        </Link>
      ) : (
        <UserAvatar name={name} avatarId={avatarId} size={size} />
      )}
      <span className="user-identity__text">
        <span className="user-identity__line">
          {link && id ? (
            <Link to={`/app/people/${id}`}>{label}</Link>
          ) : (
            label
          )}
          {badge}
        </span>
        {meta && <small className="user-identity__meta">{meta}</small>}
      </span>
    </span>
  )
}
