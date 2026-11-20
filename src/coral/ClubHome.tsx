import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, CalendarDays, Camera, ChevronRight, Clock, MapPin, MessagesSquare, Sparkles, UsersRound } from 'lucide-react'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import { useMyClubs } from './data'
import { compact, SectionHead } from './kit'
import { BookActions, ClubArt, ReadingCard } from './pieces'

/** Visão geral de um clube: identidade, leitura do momento, próximo encontro e atalhos do grupo. */
export function ClubHome() {
  const { snapshot, scope, scopeName } = useWorkspace()
  const { state, reading } = snapshot!
  const clubs = useMyClubs()
  const club = clubs.items?.find((item) => item.id === scope)
  const [menu, setMenu] = useState(false)
  const current = state.books.find((book) => book.id === state.currentBookId) ?? state.books[0]
  const next = [...state.events].filter((event) => new Date(event.date).getTime() >= Date.now()).sort((a, b) => a.date.localeCompare(b.date))[0]
  const shortcuts = [
    { to: '/app/wall', label: 'Mural', hint: 'Conversas do grupo', icon: MessagesSquare },
    { to: '/app/forum', label: 'Fórum', hint: `${snapshot!.forumCount ?? state.topics.length} discussões`, icon: MessagesSquare },
    { to: '/app/calendar', label: 'Encontros', hint: `${state.events.length} na agenda`, icon: CalendarDays },
    { to: '/app/gallery', label: 'Galeria', hint: 'Fotos dos encontros', icon: Camera },
    { to: '/app/nominations', label: 'Indicações e sorteio', hint: 'Próxima leitura', icon: Sparkles },
    { to: '/app/library', label: 'Leituras do clube', hint: `${state.books.length} livros`, icon: BookOpen },
  ]
  return (
    <div className="club-home">
      <section className="club-banner" aria-label={scopeName}>
        <span className="club-banner__art">
          <ClubArt accent={club?.accent ?? '#6e477c'} coverMediaId={club?.coverMediaId} book={current ? { title: current.title, author: current.author } : null} name={scopeName} />
        </span>
        <div className="club-banner__text">
          <strong>{scopeName}</strong>
          {club?.memberCount != null && <small><UsersRound size={14} aria-hidden="true" />{club.memberCount === 1 ? '1 membro' : `${compact(club.memberCount)} membros`}</small>}
        </div>
      </section>
      {club?.description && <p className="club-home__description preserve-text">{club.description}</p>}

      <section aria-labelledby="club-reading">
        <SectionHead id="club-reading" title="Lendo agora" to="/app/library" linkLabel="Ver leituras" />
        {current ? (
          <ReadingCard book={current} entry={reading[current.id]} onMore={() => setMenu(true)} />
        ) : (
          <div className="soft-empty"><BookOpen size={24} aria-hidden="true" /><strong>O clube ainda não escolheu a leitura</strong><Link className="pill-button" to="/app/nominations">Indicar um livro</Link></div>
        )}
      </section>

      {import.meta.env.VITE_CLUB_CHAT_ENABLED==='true' && <Link className="pill-button" to="/app/chat"><MessagesSquare size={18}/> Chat do clube</Link>}
      <section aria-labelledby="club-next">
        <SectionHead id="club-next" title="Próximo encontro" to="/app/calendar" linkLabel="Agenda" />
        {next ? (
          <Link className="row-card event-row" to="/app/calendar">
            <span className="date-tile" aria-hidden="true"><strong>{new Date(next.date).getDate()}</strong><span>{new Date(next.date).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span></span>
            <span className="row-card__body">
              <strong>{next.title}</strong>
              <span className="row-card__meta">
                <span><Clock size={14} aria-hidden="true" />{new Date(next.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                {next.location && <span><MapPin size={14} aria-hidden="true" />{next.location}</span>}
              </span>
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
        ) : (
          <div className="soft-empty"><CalendarDays size={24} aria-hidden="true" /><strong>Nenhum encontro marcado</strong><Link className="pill-button" to="/app/calendar">Abrir agenda</Link></div>
        )}
      </section>

      <section aria-labelledby="club-shortcuts">
        <SectionHead id="club-shortcuts" title="No clube" />
        <div className="settings-group">
          {shortcuts.map(({ to, label, hint, icon: Icon }) => (
            <Link key={to} className="settings-row" to={to}>
              <span className="settings-row__icon"><Icon size={18} aria-hidden="true" /></span>
              <span className="settings-row__text"><strong>{label}</strong><small>{hint}</small></span>
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
      {menu && current && <BookActions book={current} entry={reading[current.id]} onClose={() => setMenu(false)} />}
    </div>
  )
}
