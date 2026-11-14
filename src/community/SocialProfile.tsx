import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { PostMedia, Page } from '../../server/src/community-contracts'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, readableError } from '../auth/api'
import { Button, SkeletonPage } from '../components/ui'
import { MediaPicker, PrivateMedia } from './PrivateMedia'
import { socialRead } from './social-api'
import { ConfirmAction } from './ClubWall'
import { ReportAction } from './ReportAction'
export interface SocialProfileDto {
  id: string
  handle: string
  displayName: string
  bio: string
  genres: string[]
  isPublic: boolean
  showLibrary: boolean
  showStats: boolean
  showClubs: boolean
  goal: number
  avatarId: string | null
  coverId: string | null
  version: number
  suspended?: boolean
  following?: boolean
  followers?: number
  follows?: number
  library?: { title: string; author: string; status: string }[]
  stats?: { books: number; completed: number } | null
  clubs?: { id: string; name: string }[]
}
function Photo({ id, alt }: { id: string; alt: string }) {
  return (
    <PrivateMedia
      publicMedia
      media={{ id, kind: 'image', width: 4, height: 3, duration: null }}
      alt={alt}
    />
  )
}
export function SocialProfile() {
  const { id } = useParams(),
    { user } = useAuth(),
    [profile, setProfile] = useState<SocialProfileDto | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0)
  useEffect(() => {
    let live = true
    setProfile(null)
    setError('')
    socialRead<SocialProfileDto>(user, `/public/profiles/${id}`)
      .then((value) => live && setProfile(value))
      .catch((err) => live && setError(readableError(err)))
    return () => {
      live = false
    }
  }, [user?.uid, user?.emailVerified, id, revision])
  async function relation(kind: 'follow' | 'block', value: boolean) {
    if (!user) return
    setBusy(true)
    try {
      await apiRequest(user, `/public/profiles/${id}/${kind}`, 'POST', { value })
      setRevision((n) => n + 1)
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }
  if (error)
    return (
      <div role="alert">
        <h1>Perfil indisponível</h1>
        <p>{error}</p>
        <Link to="/app/community">Voltar à comunidade</Link>
      </div>
    )
  if (!profile) return <SkeletonPage label="Abrindo perfil…" />
  return (
    <div className="social-room stack-lg">
      {profile.coverId && (
        <div className="profile-cover">
          <Photo id={profile.coverId} alt={`Capa do perfil de ${profile.displayName}`} />
        </div>
      )}
      <header className="social-heading">
        {profile.avatarId && (
          <div className="profile-avatar">
            <Photo id={profile.avatarId} alt={profile.displayName} />
          </div>
        )}
        <span className="eyebrow">@{profile.handle}</span>
        <h1>{profile.displayName}</h1>
        <p className="preserve-text">{profile.bio}</p>
        <p>{profile.genres.join(' · ')}</p>
        <p>
          {profile.followers} seguidor(es) · {profile.follows} seguindo
        </p>
      </header>
      <div className="workspace-actions">
        {user?.emailVerified && (
          <>
            <Button disabled={busy} onClick={() => void relation('follow', !profile.following)}>
              {profile.following ? 'Deixar de seguir' : 'Seguir leitor'}
            </Button>
            <ConfirmAction
              label="Bloquear leitor"
              confirmLabel="Confirmar bloqueio"
              disabled={busy}
              onConfirm={() => relation('block', true)}
            />
            <ReportAction kind="profile" id={profile.id} />
          </>
        )}
        <Link to={`/app/community?author=${profile.id}`}>Publicações deste leitor →</Link>
      </div>
      {profile.stats && (
        <section>
          <h2>Entre livros</h2>
          <p>
            {profile.stats.completed} leitura(s) concluída(s) · {profile.stats.books} livro(s) na
            biblioteca · meta: {profile.goal}
          </p>
        </section>
      )}
      {!!profile.library?.length && (
        <section>
          <h2>Biblioteca compartilhada pelo leitor</h2>
          <ul>
            {profile.library.map((book, i) => (
              <li key={i}>
                <strong>{book.title}</strong> · {book.author}
                <small>
                  {' '}
                  ·{' '}
                  {(
                    {
                      completed: 'Concluído',
                      reading: 'Lendo',
                      want: 'Quero ler',
                      paused: 'Pausado',
                      abandoned: 'Abandonado',
                    } as Record<string, string>
                  )[book.status] ?? book.status}
                </small>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!!profile.clubs?.length && (
        <section>
          <h2>Clubes visíveis</h2>
          {profile.clubs.map((club) => (
            <p key={club.id}>
              <Link to="/app/explore">{club.name}</Link>
            </p>
          ))}
        </section>
      )}
    </div>
  )
}
export function SocialProfileEditor() {
  const { user } = useAuth(),
    [profile, setProfile] = useState<SocialProfileDto | null>(null),
    [savedPublic, setSavedPublic] = useState(false),
    [media, setMedia] = useState<PostMedia[]>([]),
    [genres, setGenres] = useState(''),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [blocks, setBlocks] = useState<Page<{ id: string; name: string }>>({
      items: [],
      nextCursor: null,
    })
  useEffect(() => {
    if (!user?.emailVerified) return
    let live = true
    apiRequest<SocialProfileDto>(user, '/me/profile')
      .then((value) => {
        if (live) {
          setProfile(value)
          setSavedPublic(value.isPublic)
          setGenres(value.genres.join(', '))
        }
      })
      .catch((err) => live && setError(readableError(err)))
    return () => {
      live = false
    }
  }, [user?.uid, user?.emailVerified])
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!user || !profile) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const { id, suspended, ...input } = profile
      await apiRequest(user, '/me/profile', 'POST', {
        ...input,
        genres: [
          ...new Set(
            genres
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean),
          ),
        ],
      })
      const next = await apiRequest<SocialProfileDto>(user, '/me/profile')
      setProfile(next)
      setSavedPublic(next.isPublic)
      setMessage('Perfil e privacidade salvos.')
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }
  async function loadBlocks(cursor?: string) {
    if (!user) return
    try {
      const next = await apiRequest<Page<{ id: string; name: string }>>(
        user,
        '/me/blocks' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''),
      )
      setBlocks((value) =>
        cursor ? { items: [...value.items, ...next.items], nextCursor: next.nextCursor } : next,
      )
    } catch (err) {
      setError(readableError(err))
    }
  }
  if (!user?.emailVerified)
    return (
      <div className="library-empty">
        <h1>Seu perfil social</h1>
        <p>Você pode ler a comunidade sem conta. Para criar seu perfil, entre quando desejar.</p>
        <Link to="/account">Entrar ou criar conta →</Link>
      </div>
    )
  if (!profile)
    return error ? (
      <p role="alert">{error}</p>
    ) : (
      <SkeletonPage label="Abrindo configurações do perfil…" />
    )
  return (
    <div className="social-room stack-lg">
      <header className="social-heading">
        <span className="eyebrow">SUA IDENTIDADE NA COMUNIDADE</span>
        <h1>Como você quer se apresentar?</h1>
        <p>
          Seu perfil começa privado. Fotos e informações só aparecem na comunidade quando você ativa
          a opção abaixo.
        </p>
      </header>
      <form className="workspace-form card" onSubmit={save}>
        <label>
          Nome público
          <input
            required
            maxLength={100}
            value={profile.displayName}
            onChange={(event) => setProfile({ ...profile, displayName: event.target.value })}
          />
        </label>
        <label>
          Nome de usuário · letras minúsculas, números e _
          <input
            required
            pattern="[a-z0-9_]{3,30}"
            minLength={3}
            maxLength={30}
            value={profile.handle}
            onChange={(event) => setProfile({ ...profile, handle: event.target.value })}
          />
        </label>
        <label>
          Biografia
          <textarea
            maxLength={1000}
            value={profile.bio}
            onChange={(event) => setProfile({ ...profile, bio: event.target.value })}
          />
        </label>
        <label>
          Gêneros favoritos · até 12, separados por vírgula
          <input
            maxLength={480}
            value={genres}
            onChange={(event) => setGenres(event.target.value)}
          />
        </label>
        <label>
          Meta de leitura
          <input
            required
            type="number"
            min={1}
            max={1000}
            value={profile.goal}
            onChange={(event) => setProfile({ ...profile, goal: Number(event.target.value) })}
          />
        </label>
        <fieldset>
          <legend>Privacidade</legend>
          {profile.suspended && <p role="alert">Seu perfil público foi suspenso pela moderação.</p>}
          {[
            ['isPublic', 'Ativar perfil público e permitir publicações na comunidade'],
            ['showLibrary', 'Exibir títulos e status da minha biblioteca pessoal'],
            ['showStats', 'Exibir estatísticas e meta de leitura'],
            ['showClubs', 'Exibir os clubes públicos dos quais participo'],
          ].map(([key, label]) => (
            <label className="workspace-check" key={key}>
              <input
                type="checkbox"
                checked={!!profile[key as keyof SocialProfileDto]}
                onChange={(event) => setProfile({ ...profile, [key]: event.target.checked })}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <p className="t-caption">
          Arquivos EPUB, anotações, destaques e clubes privados permanecem pessoais. Ao desativar o
          perfil, suas publicações e fotos deixam de aparecer em novas consultas públicas.
        </p>
        <div className="workspace-actions">
          <Button disabled={busy || uploading}>Salvar perfil e privacidade</Button>
          {profile.isPublic && (
            <Link to={`/app/people/${profile.id}`}>Ver meu perfil público →</Link>
          )}
        </div>
      </form>
      {savedPublic && (
        <section className="card">
          <h2>Foto e capa</h2>
          <p>
            Prepare imagens para o perfil público e escolha onde usá-las. Salve o perfil para
            confirmar.
          </p>
          <MediaPicker
            clubId={null}
            imagesOnly
            value={media}
            onChange={setMedia}
            onBusy={setUploading}
          />
          {media.map((item) => (
            <div className="workspace-actions" key={item.id}>
              <Button
                variant="secondary"
                onClick={() => setProfile({ ...profile, avatarId: item.id })}
              >
                Usar como foto
              </Button>
              <Button
                variant="secondary"
                onClick={() => setProfile({ ...profile, coverId: item.id })}
              >
                Usar como capa
              </Button>
            </div>
          ))}
          <div className="workspace-actions">
            <Button variant="ghost" onClick={() => setProfile({ ...profile, avatarId: null })}>
              Retirar foto
            </Button>
            <Button variant="ghost" onClick={() => setProfile({ ...profile, coverId: null })}>
              Retirar capa
            </Button>
          </div>
        </section>
      )}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <details
        className="card"
        onToggle={(event) => {
          if (event.currentTarget.open) void loadBlocks()
        }}
      >
        <summary>Leitores bloqueados</summary>
        <p>
          O bloqueio oculta perfis e interações entre vocês nesta conta. Conteúdo público ainda pode
          ser visto fora de uma sessão autenticada.
        </p>
        {blocks.items.map((block) => (
          <div className="workspace-actions" key={block.id}>
            <span>{block.name}</span>
            <ConfirmAction
              label="Desbloquear"
              confirmLabel="Confirmar desbloqueio"
              onConfirm={async () => {
                await apiRequest(user, `/public/profiles/${block.id}/block`, 'POST', {
                  value: false,
                })
                await loadBlocks()
              }}
            />
          </div>
        ))}
        {blocks.nextCursor && (
          <Button onClick={() => void loadBlocks(blocks.nextCursor!)}>Mais leitores</Button>
        )}
      </details>
      <Link to="/app/profile">Conta e backup pessoal →</Link>
    </div>
  )
}
