import { ProfileActivityFeed, FollowRequests, SavedReading } from './ProfileActivity'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Ellipsis, Heart, MessageCircle, Settings } from 'lucide-react'
import { HeroBell } from '../coral/kit'
import { ConnectionsSheet, CreateFab } from '../coral/ProfileExtras'
import type { PostDto, PostMedia, Page } from '../../server/src/community-contracts'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, readableError } from '../auth/api'
import { Button, CoverArt, SkeletonPage } from '../components/ui'
import { UserAvatar } from '../components/UserAvatar'
import { AvatarUploader } from '../components/AvatarUploader'
import { CoverUploader } from '../components/CoverUploader'
import { MediaPicker, PrivateMedia } from './PrivateMedia'
import { socialRead } from './social-api'
import { ConfirmAction, PostCard } from './ClubWall'
import { ReportAction } from './ReportAction'
import './community.css'
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
  canSeeContent?: boolean
  isSelf?: boolean
  requested?: boolean
  relation?: string
  posts?: number | null
  pendingRequests?: number
  followers?: number | null
  follows?: number | null
  library?: { title: string; author: string; status: string }[]
  stats?: { books: number; completed: number } | null
  clubs?: { id: string; name: string; role?: string; visibility?: string; shared?: boolean }[]
}
/** Capa no topo do perfil: imagem completa (GIF animado incluso); com movimento reduzido, só o primeiro quadro. */
function Photo({ id, alt }: { id: string; alt: string }) {
  const still =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  return (
    <PrivateMedia
      publicMedia
      full={!still}
      media={{ id, kind: 'image', width: 16, height: 5, duration: null }}
      alt={alt}
    />
  )
}
/** Cartão mínimo vindo de /people/:id: existe quando o perfil é público ou quando há clube em comum. */
interface PersonCard {
  id: string
  name: string
  avatarId: string | null
  isPublic: boolean
  sharedClubs: { id: string; name: string }[]
}
type ClubPost = PostDto & { club: { id: string; name: string } }
type Tab = 'public' | 'clubs' | 'about' | 'activity' | 'saved'
const statusLabels: Record<string, string> = {
  completed: 'Concluído',
  reading: 'Lendo',
  want: 'Quero ler',
  paused: 'Pausado',
  abandoned: 'Abandonado',
}

/** Lista paginada de publicações de um perfil (públicas ou de clubes compartilhados). */
function ProfilePostList({
  load,
  empty,
  clubLabel,
  grid = false,
}: {
  load: (cursor?: string) => Promise<Page<PostDto | ClubPost>>
  empty: string
  clubLabel?: boolean
  /** Grade de duas colunas (aba Publicações do perfil): miniatura, trecho e contadores. */
  grid?: boolean
}) {
  const [page, setPage] = useState<Page<PostDto | ClubPost> | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    let live = true
    setPage(null)
    setError('')
    load()
      .then((value) => live && setPage(value))
      .catch((err) => live && setError(readableError(err)))
    return () => {
      live = false
    }
  }, [load])
  async function more() {
    if (!page?.nextCursor) return
    setBusy(true)
    try {
      const next = await load(page.nextCursor)
      setPage((value) => ({
        items: [...(value?.items ?? []), ...next.items],
        nextCursor: next.nextCursor,
      }))
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }
  if (error)
    return (
      <p role="alert" className="access-error">
        {error}
      </p>
    )
  if (!page) return <SkeletonPage label="Abrindo publicações…" />
  if (!page.items.length) return <p className="soft-empty">{empty}</p>
  if (grid)
    return (
      <>
        <div className="post-grid">
          {page.items.map((post) => {
            const club = 'club' in post ? post.club : null
            const to = club ? `/space/${club.id}?post=${post.id}` : `/app/community?post=${post.id}`
            return (
              <Link key={post.id} className="post-tile" to={to} aria-label={`Abrir publicação: ${post.body.slice(0, 60)}`}>
                <span className="post-tile__media">
                  {post.media[0]?.kind === 'image' ? (
                    <PrivateMedia previewOnly publicMedia={!club} media={post.media[0]} alt="" />
                  ) : (
                    <CoverArt title={post.bookTitle || post.quote || post.body.slice(0, 40)} author={post.bookAuthor} />
                  )}
                </span>
                <span className="post-tile__text">{post.quote ? `“${post.quote}”` : post.body}</span>
                <span className="post-tile__meta">
                  <span><Heart size={13} aria-hidden="true" />{post.likes}</span>
                  <span><MessageCircle size={13} aria-hidden="true" />{post.comments}</span>
                </span>
              </Link>
            )
          })}
        </div>
        {page.nextCursor && (
          <div className="library-add">
            <Button variant="secondary" disabled={busy} aria-busy={busy} onClick={() => void more()}>
              {busy ? 'Carregando…' : 'Mais publicações'}
            </Button>
          </div>
        )}
      </>
    )
  return (
    <div className="social-feed profile-feed">
      {page.items.map((post) => {
        const club = 'club' in post ? post.club : null
        return (
          <div className="profile-feed__item" key={post.id}>
            {clubLabel && club && (
              <p className="profile-feed__club">
                <span className="chip chip--success">{club.name}</span>
                <Link className="text-link" to={`/space/${club.id}?post=${post.id}`}>
                  Ver no mural do clube
                </Link>
              </p>
            )}
            {!club && (
              <p className="profile-feed__club">
                <Link className="text-link" to={`/app/community?post=${post.id}`}>
                  Ver publicação original
                </Link>
              </p>
            )}
            <PostCard
              post={post}
              clubId={club?.id ?? null}
              onChanged={(value) =>
                setPage(
                  (current) =>
                    current && {
                      ...current,
                      items: current.items.map((item) =>
                        item.id === value.id ? { ...value, ...(club ? { club } : {}) } : item,
                      ),
                    },
                )
              }
              onRemoved={() =>
                setPage(
                  (current) =>
                    current && {
                      ...current,
                      items: current.items.filter((item) => item.id !== post.id),
                    },
                )
              }
            />
          </div>
        )
      })}
      {page.nextCursor && (
        <Button variant="secondary" disabled={busy} onClick={() => void more()}>
          {busy ? 'Carregando…' : 'Mais publicações'}
        </Button>
      )}
    </div>
  )
}

/**
 * Perfil de outro leitor. Combina o perfil público (quando ativo) com o cartão de clubes em comum.
 * A aba "Publicações dos Clubes" usa /people/:id/club-posts, que o servidor limita aos clubes
 * em que o visitante também participa.
 */
export function SocialProfile({ profileId }: { profileId?: string } = {}) {
  const params = useParams(),
    id = profileId ?? params.id,
    [search] = useSearchParams(),
    [requests, setRequests] = useState(search.get('requests') === '1')
  const navigate = useNavigate(),
    { user } = useAuth(),
    [profile, setProfile] = useState<SocialProfileDto | null>(null),
    [person, setPerson] = useState<PersonCard | null>(null),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [tab, setTab] = useState<Tab>('public'),
    [connections, setConnections] = useState<'followers' | 'following' | null>(null)
  const verified = !!user?.emailVerified
  useEffect(() => {
    let live = true
    setLoaded(false)
    setError('')
    void Promise.allSettled([
      socialRead<SocialProfileDto>(user, `/public/profiles/${id}`),
      verified ? apiRequest<PersonCard>(user!, `/people/${id}`) : Promise.reject(null),
    ]).then(([publicResult, personResult]) => {
      if (!live) return
      const publicProfile = publicResult.status === 'fulfilled' ? publicResult.value : null
      const card = personResult.status === 'fulfilled' ? personResult.value : null
      setProfile(publicProfile)
      setPerson(card)
      if (!publicProfile && !card)
        setError(
          publicResult.status === 'rejected'
            ? readableError(publicResult.reason)
            : 'Este perfil não está disponível.',
        )
      setTab(publicProfile ? 'public' : 'clubs')
      setLoaded(true)
    })
    return () => {
      live = false
    }
  }, [user?.uid, verified, id, revision])
  const loadPublic = useCallback(
    (cursor?: string) =>
      socialRead<Page<PostDto>>(
        user,
        `/public/posts?author=${id}${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`,
      ),
    [user?.uid, verified, id],
  )
  const loadClubs = useCallback(
    (cursor?: string) =>
      apiRequest<Page<ClubPost>>(
        user!,
        `/people/${id}/club-posts${cursor ? '?cursor=' + encodeURIComponent(cursor) : ''}`,
      ),
    [user?.uid, id],
  )
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
  function back() {
    if (window.history.length > 1) navigate(-1)
    else navigate('/app/community')
  }
  if (!loaded) return <SkeletonPage label="Abrindo perfil…" />
  if (error && !profile && !person)
    return (
      <div className="social-room profile-unavailable" role="alert">
        <UserAvatar name="?" size="xl" />
        <h1>Perfil indisponível</h1>
        <p>{error}</p>
        <Link className="button-link" to="/app/community">
          Voltar à comunidade
        </Link>
      </div>
    )
  const name = profile?.displayName ?? person!.name
  const avatarId = profile?.avatarId ?? person?.avatarId ?? null
  const isSelf = verified && profile?.isSelf === true
  const shared = person?.sharedClubs ?? []
  const tabs: { id: Tab; label: string }[] = [
    ...(profile ? [{ id: 'public' as Tab, label: 'Publicações' }] : []),
    ...(verified ? [{ id: 'clubs' as Tab, label: 'Clubes' }] : []),
  ]
  if (verified) tabs.push({ id: 'activity', label: 'Atividades' })
  if (isSelf) tabs.push({ id: 'saved', label: 'Salvos' })
  if (
    profile &&
    (profile.stats || profile.library?.length || profile.clubs?.length || profile.genres.length)
  )
    tabs.push({ id: 'about', label: 'Sobre' })
  const current = tabs.some((item) => item.id === tab) ? tab : tabs[0]?.id
  return (
    <div className="social-room profile-page coral-profile">
      <header className="profile-hero">
        {profile?.coverId && (
          <div className="profile-hero__cover">
            <Photo id={profile.coverId} alt={`Capa do perfil de ${name}`} />
          </div>
        )}
        <div className="profile-hero__bar">
          {isSelf ? (
            <span className="profile-hero__label">Meu perfil</span>
          ) : (
            <button type="button" className="hero-icon" aria-label="Voltar" onClick={back}>
              <ArrowLeft size={20} />
            </button>
          )}
          <div className="hero__actions">
            {isSelf ? (
              <>
                <HeroBell />
                <Link className="hero-icon" to="/app/ajustes" aria-label="Configurações">
                  <Settings size={20} />
                </Link>
              </>
            ) : (
              profile && verified && (
                <details className="profile-more">
                  <summary className="hero-icon" aria-label="Mais opções do perfil">
                    <Ellipsis size={20} />
                  </summary>
                  <div className="social-menu">
                    <ConfirmAction
                      label="Bloquear leitor"
                      confirmLabel="Confirmar bloqueio"
                      disabled={busy}
                      onConfirm={() => relation('block', true)}
                    />
                    <ReportAction kind="profile" id={profile.id} />
                  </div>
                </details>
              )
            )}
          </div>
        </div>
      </header>
      <section className="profile-card" aria-labelledby="profile-name">
        <div className="profile-card__avatar">
          <UserAvatar name={name} avatarId={avatarId} size="xl" />
        </div>
        <h1 id="profile-name">{name}</h1>
        {profile && <p className="profile-card__handle">@{profile.handle}</p>}
        {profile?.bio && <p className="preserve-text profile-card__bio">{profile.bio}</p>}
        {!profile && (
          <p className="profile-card__bio">
            Perfil privado. Você vê o que esta pessoa compartilhou nos clubes em comum.
          </p>
        )}
        {isSelf && (
          <div className="profile-card__actions">
            <Link className="pill-button profile-edit" to="/app/social-profile">
              Editar perfil
            </Link>
            {(profile?.pendingRequests ?? 0) > 0 && (
              <button type="button" className="pill-button pill-button--solid" aria-expanded={requests} onClick={() => setRequests(!requests)}>
                Solicitações ({profile?.pendingRequests})
              </button>
            )}
          </div>
        )}
        {profile && verified && !isSelf && (
          <div className="profile-card__actions">
            <button
              type="button"
              className={`pill-button profile-follow ${profile.following || profile.requested ? '' : 'pill-button--solid'}`}
              disabled={busy}
              aria-busy={busy}
              aria-pressed={!!(profile.following || profile.requested)}
              onClick={() => void relation('follow', !(profile.following || profile.requested))}
            >
              {profile.following
                ? 'Seguindo'
                : profile.requested
                  ? 'Solicitação pendente'
                  : profile.isPublic
                    ? 'Seguir'
                    : 'Solicitar para seguir'}
            </button>
          </div>
        )}
        {profile && (
          <div className="profile-stats">
            <button type="button" onClick={() => setTab('public')} disabled={profile.posts == null}>
              <strong>{profile.posts ?? '—'}</strong>
              <span>Publicações</span>
            </button>
            <button type="button" onClick={() => setConnections('followers')} disabled={profile.followers == null || !verified}>
              <strong>{profile.followers ?? '—'}</strong>
              <span>Seguidores</span>
            </button>
            <button type="button" onClick={() => setConnections('following')} disabled={profile.follows == null || !verified}>
              <strong>{profile.follows ?? '—'}</strong>
              <span>Seguindo</span>
            </button>
          </div>
        )}
        {!isSelf && shared.length > 0 && (
          <p className="profile-card__shared">
            Clubes em comum:{' '}
            {shared.map((club) => (
              <span className="tag" key={club.id}>
                {club.name}
              </span>
            ))}
          </p>
        )}
      </section>
      {connections && id && <ConnectionsSheet personId={id} kind={connections} onClose={() => setConnections(null)} />}
      {isSelf && <CreateFab />}
      {isSelf && requests && <FollowRequests onResolved={() => setRevision((n) => n + 1)} />}
      {profile?.canSeeContent === false && (
        <p className="profile-private-notice">
          Perfil privado. Solicite para seguir para acessar as publicações pessoais. A participação
          em clubes é autorizada separadamente.
        </p>
      )}
      {error && (
        <p role="alert" className="access-error">
          {error}
        </p>
      )}
      {tabs.length > 0 && (
        <div className="profile-tabs line-tabs" role="tablist" aria-label="Seções do perfil">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`profile-tab-${item.id}`}
              aria-selected={current === item.id}
              aria-controls={`profile-panel-${item.id}`}
              tabIndex={current === item.id ? 0 : -1}
              onClick={() => setTab(item.id)}
              onKeyDown={(event) => {
                const index = tabs.findIndex((value) => value.id === item.id)
                const next =
                  event.key === 'ArrowRight'
                    ? tabs[(index + 1) % tabs.length]
                    : event.key === 'ArrowLeft'
                      ? tabs[(index - 1 + tabs.length) % tabs.length]
                      : null
                if (next) {
                  event.preventDefault()
                  setTab(next.id)
                  document.getElementById(`profile-tab-${next.id}`)?.focus()
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      {current && (
        <section
          className="profile-panel"
          role="tabpanel"
          id={`profile-panel-${current}`}
          aria-labelledby={`profile-tab-${current}`}
          key={current}
        >
          {current === 'public' && (
            <ProfilePostList
              grid
              load={loadPublic}
              empty={`${name} ainda não publicou na comunidade.`}
            />
          )}
          {current === 'clubs' && (
            <>
              <div className="profile-club-list">
                {profile?.clubs?.map((club) => (
                  <article className="card" key={club.id}>
                    <strong>{club.name}</strong>
                    <small>
                      {club.visibility === 'private' ? 'Clube privado' : 'Clube público'}
                      {['owner', 'admin'].includes(club.role ?? '') ? ' · Administração' : ''}
                    </small>
                    <Link to={club.shared || isSelf ? `/space/${club.id}` : '/app/explore'}>
                      Ver clube
                    </Link>
                  </article>
                ))}
              </div>
              <ProfilePostList
                load={loadClubs}
                clubLabel
                empty="Nenhuma publicação nos murais dos clubes que vocês compartilham."
              />
            </>
          )}
          {current === 'activity' && id && (
            <ProfileActivityFeed id={id} author={{ name, handle: profile?.handle, avatarId }} />
          )}
          {current === 'saved' && isSelf && id && (
            <>
              <SavedReading />
              <h2>Publicações salvas</h2>
              <ProfileActivityFeed id={id} saved />
            </>
          )}
          {current === 'about' && profile && (
            <div className="profile-about">
              {profile.genres.length > 0 && (
                <section>
                  <h2>Gêneros favoritos</h2>
                  <p className="profile-genres">
                    {profile.genres.map((genre) => (
                      <span className="chip" key={genre}>
                        {genre}
                      </span>
                    ))}
                  </p>
                </section>
              )}
              {profile.stats && (
                <section>
                  <h2>Entre livros</h2>
                  <p>
                    {profile.stats.completed} leitura(s) concluída(s) · {profile.stats.books}{' '}
                    livro(s) na biblioteca{profile.goal ? ` · meta anual: ${profile.goal}` : ''}
                  </p>
                </section>
              )}
              {!!profile.library?.length && (
                <section>
                  <h2>Estante compartilhada</h2>
                  <ul className="profile-shelf">
                    {profile.library.map((book, i) => (
                      <li key={i}>
                        <CoverArt title={book.title} author={book.author} size="sm" />
                        <span>
                          <strong>{book.title}</strong>
                          <small>
                            {book.author} · {statusLabels[book.status] ?? book.status}
                          </small>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {!!profile.clubs?.length && (
                <section>
                  <h2>Clubes públicos</h2>
                  <p className="profile-genres">
                    {profile.clubs.map((club) => (
                      <Link className="chip chip--success" key={club.id} to="/app/explore">
                        {club.name}
                      </Link>
                    ))}
                  </p>
                </section>
              )}
            </div>
          )}
        </section>
      )}
      {!tabs.length && (
        <p className="empty-inline profile-empty">
          Este leitor ainda não compartilhou publicações com você.
        </p>
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
          Escolha como se apresentar. Em perfil privado, suas publicações pessoais ficam disponíveis
          somente aos seguidores aprovados; os clubes mantêm suas próprias permissões.
        </p>
      </header>
      <div className="card">
        <AvatarUploader
          name={profile.displayName}
          avatarId={profile.avatarId}
          onChange={() =>
            void apiRequest<SocialProfileDto>(user, '/me/profile').then((next) =>
              setProfile((current) =>
                current ? { ...current, avatarId: next.avatarId, version: next.version } : next,
              ),
            )
          }
        />
      </div>
      <div className="card">
        <CoverUploader
          coverId={profile.coverId}
          isPublic={savedPublic}
          onChange={() =>
            void apiRequest<SocialProfileDto>(user, '/me/profile').then((next) =>
              setProfile((current) =>
                current ? { ...current, coverId: next.coverId, version: next.version } : next,
              ),
            )
          }
        />
      </div>
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
          <legend>Privacidade do perfil</legend>
          <label className="workspace-check">
            <input
              type="radio"
              name="profilePrivacy"
              checked={profile.isPublic}
              onChange={() => setProfile({ ...profile, isPublic: true })}
            />
            Público — seguir sem aprovação
          </label>
          <label className="workspace-check">
            <input
              type="radio"
              name="profilePrivacy"
              checked={!profile.isPublic}
              onChange={() => setProfile({ ...profile, isPublic: false })}
            />
            Privado — aprovar solicitações para seguir
          </label>
          {profile.suspended && <p role="alert">Seu perfil público foi suspenso pela moderação.</p>}
          {[
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
          perfil público, seus seguidores aprovados são preservados. Clubes privados nunca são
          liberados por seguir alguém.
        </p>
        <div className="workspace-actions">
          <Button disabled={busy || uploading}>Salvar perfil e privacidade</Button>
          {profile.isPublic && (
            <Link to={`/app/people/${profile.id}`}>Ver meu perfil público →</Link>
          )}
        </div>
      </form>
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
      <Link to="/app/profile">Voltar ao meu perfil →</Link>
      <Link to="/app/settings">Conta e backup pessoal →</Link>
    </div>
  )
}

export function OwnSocialProfile() {
  const { user } = useAuth(),
    [id, setId] = useState<string | null>(null),
    [error, setError] = useState('')
  useEffect(() => {
    let live = true
    if (user)
      void apiRequest<{ id: string }>(user, '/me/profile')
        .then((p) => live && setId(p.id))
        .catch((e) => live && setError(readableError(e)))
    return () => {
      live = false
    }
  }, [user?.uid])
  if (error) return <p role="alert">{error}</p>
  return id ? <SocialProfile profileId={id} /> : <SkeletonPage label="Abrindo seu perfil…" />
}
