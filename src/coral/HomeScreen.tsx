import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BookOpen, Compass, PenLine, Plus, UsersRound } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { UserAvatar, useOwnAvatar } from '../components/UserAvatar'
import { PostCard } from '../community/ClubWall'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import { useCommunityPosts, useFollowingReaders, useMyClubs, useDiscoverClubs } from './data'
import { Hero, HeroBell, HeroSearch, SectionHead, SheetBody } from './kit'
import { BookActions, ClubTile, ReadingCard } from './pieces'


export function HomeScreen() {
  const { snapshot, setScope } = useWorkspace()
  const { user } = useAuth()
  const navigate = useNavigate()
  const ownAvatar = useOwnAvatar()
  const { state, reading } = snapshot!
  const [menu, setMenu] = useState<string | null>(null)
  const current =
    state.books.find((book) => book.id === state.currentBookId && (reading[book.id]?.percent ?? 0) < 100) ??
    [...state.books].filter((book) => (reading[book.id]?.percent ?? 0) > 0 && (reading[book.id]?.percent ?? 0) < 100)[0] ??
    state.books.find((book) => (reading[book.id]?.percent ?? 0) < 100)
  const name = (user?.displayName ?? '').trim().split(/\s+/)[0]
  const clubs = useMyClubs()
  const discover = useDiscoverClubs()
  const friends = useFollowingReaders()
  const feed = useCommunityPosts('limit=10')
  const menuBook = state.books.find((book) => book.id === menu)
  const featured = clubs.items?.length ? clubs.items : null
  const waitingForClubs = !!user?.emailVerified && clubs.items === null

  return (
    <div className="home-screen">
      <Hero
        title={<>Olá{name ? `, ${name}` : ''} <span aria-hidden="true">👋</span></>}
        subtitle="Pronto para mais uma leitura?"
        small
        leading={
          <Link to={user ? '/app/profile' : '/account'} className="hero-avatar" aria-label={user ? 'Abrir meu perfil' : 'Entrar na sua conta'}>
            <UserAvatar name={user?.displayName || name || '?'} avatarId={ownAvatar} size="lg" />
            {user?.emailVerified && <span className="hero-avatar__online" aria-hidden="true" />}
          </Link>
        }
        actions={<><HeroBell /><HeroSearch /></>}
      />
      <SheetBody>
        <section aria-labelledby="home-reading">
          <SectionHead id="home-reading" title="Continuar lendo" to="/app/library" linkLabel="Ver biblioteca" />
          {current ? (
            <ReadingCard book={current} entry={reading[current.id]} onMore={() => setMenu(current.id)} />
          ) : (
            <div className="soft-empty">
              <BookOpen size={26} aria-hidden="true" />
              <strong>Nenhuma leitura em andamento</strong>
              <span>Importe um EPUB ou adicione um livro para começar.</span>
              <Link className="pill-button" to="/app/library">Abrir biblioteca</Link>
            </div>
          )}
        </section>

        <section aria-labelledby="home-clubs">
          <SectionHead id="home-clubs" title={featured ? 'Clubes em destaque' : 'Clubes para conhecer'} to="/app/clubs" />
          <div className="h-scroll">
            {featured
              ? featured.map((club) => (
                  <ClubTile key={club.id} name={club.name} members={club.memberCount} accent={club.accent} coverMediaId={club.coverMediaId} book={club.currentBook} onOpen={() => { setScope(club.id); navigate('/app') }} />
                ))
              : !waitingForClubs && discover.page?.items.slice(0, 8).map((club) => (
                  <ClubTile key={club.id} name={club.name} accent={club.accent} coverMediaId={club.coverMediaId} publicMedia onOpen={() => navigate(`/app/clubs?clube=${club.id}`)} />
                ))}
            {!featured && (waitingForClubs || !discover.page) && [0, 1, 2].map((key) => <span key={key} className="skeleton skeleton-tile" aria-hidden="true" />)}
            {!waitingForClubs && !featured && discover.page && !discover.page.items.length && (
              <Link className="add-tile" to="/app/clubs?criar=1" style={{ width: 146, aspectRatio: '1.18' }}>
                <Plus size={22} aria-hidden="true" />Criar um clube
              </Link>
            )}
          </div>
        </section>

        {friends && friends.length > 0 && (
          <section className="home-friends" aria-labelledby="home-friends">
            <div className="section-head">
              <h2 id="home-friends">Leituras dos amigos</h2>
              <div className="avatar-stack">
                {friends.slice(0, 3).map((person) => (
                  <Link key={person.id} to={`/app/people/${person.id}`} aria-label={`${person.name}${person.book ? `, lendo ${person.book}` : ''}`}>
                    <UserAvatar name={person.name} avatarId={person.avatarId} size="md" />
                  </Link>
                ))}
                {friends.length > 3 && <Link className="avatar-stack__more" to="/app/community?aba=seguindo" aria-label={`Mais ${friends.length - 3} pessoas`}>+{friends.length - 3}</Link>}
              </div>
            </div>
          </section>
        )}

        <section aria-labelledby="home-feed">
          <SectionHead id="home-feed" title="Novidades da comunidade" to="/app/community" linkLabel="Ver mais" />
          <div className="social-feed coral-feed">
            {feed.page?.items.slice(0, 5).map((post) => (
              <PostCard
                key={post.id}
                clubId={null}
                post={post}
                onChanged={(value) => feed.setPage((page) => page && { ...page, items: page.items.map((item) => (item.id === value.id ? value : item)) })}
                onRemoved={() => feed.setPage((page) => page && { ...page, items: page.items.filter((item) => item.id !== post.id) })}
              />
            ))}
            {feed.busy && !feed.page && <span className="skeleton" style={{ height: 150, borderRadius: 16 }} aria-hidden="true" />}
            {feed.page && !feed.page.items.length && (
              <div className="soft-empty">
                <PenLine size={24} aria-hidden="true" />
                <strong>Nada por aqui ainda</strong>
                <span>Seja a primeira pessoa a contar o que está lendo.</span>
                <Link className="pill-button" to="/app/community?publicar=1">Publicar</Link>
              </div>
            )}
            {feed.error && <p role="alert" className="access-error">{feed.error}</p>}
          </div>
        </section>
        {!user && (
          <div className="soft-empty">
            <UsersRound size={24} aria-hidden="true" />
            <strong>Leia junto com outras pessoas</strong>
            <span>Entre para participar de clubes e publicar na comunidade.</span>
            <Link className="pill-button pill-button--solid" to="/account">Entrar ou criar conta</Link>
          </div>
        )}
        {user && !featured && clubs.items && (
          <Link className="settings-group settings-row" to="/app/explore">
            <span className="settings-row__icon"><Compass size={19} /></span>
            <span className="settings-row__text"><strong>Explorar livros e clubes</strong><small>Encontre sua próxima leitura</small></span>
          </Link>
        )}
      </SheetBody>
      {menuBook && <BookActions book={menuBook} entry={reading[menuBook.id]} onClose={() => setMenu(null)} />}
    </div>
  )
}
