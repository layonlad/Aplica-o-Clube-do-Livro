import { ArrowRight, CalendarDays, ChevronRight, Clock3, MapPin, Megaphone, MessageCircle, Sparkles, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { currentBook, events } from '../data/mockData'
import { Avatar, BookCover, Button, Card, DemoBadge, ProgressBar } from '../components/ui'

export function HomePage() {
  const nextEvent = events[0]
  return (
    <div className="stack-xl home-page">
      <DemoBadge />
      <section className="current-reading">
        <div className="section-heading"><div><span className="eyebrow">LEITURA DE OUTUBRO</span><h2>Nosso livro do mês</h2></div><span className="days-pill"><Clock3 size={14} /> 14 dias</span></div>
        <Card className="reading-card">
          <BookCover book={currentBook} size="lg" />
          <div className="reading-info">
            <span className="book-category">{currentBook.category}</span>
            <h3>{currentBook.title}</h3>
            <p>{currentBook.author}</p>
            <div className="reader-avatars"><Avatar initials="MA" size="sm" /><Avatar initials="LM" size="sm" /><Avatar initials="RA" size="sm" /><span>+6 lendo</span></div>
          </div>
          <ProgressBar value={currentBook.progress ?? 0} label="Seu progresso" />
          <Link to="/app/reader" className="button-link">Continuar leitura <ArrowRight size={18} /></Link>
        </Card>
      </section>

      <section>
        <div className="section-heading"><div><span className="eyebrow">PRÓXIMO ENCONTRO</span><h2>Já temos um encontro</h2></div><Link to="/app/calendar">Ver agenda</Link></div>
        <Card className="event-highlight">
          <div className="date-tile"><strong>{nextEvent.day}</strong><span>{nextEvent.month}</span></div>
          <div className="event-copy"><h3>{nextEvent.title}</h3><p><Clock3 size={15} /> {nextEvent.time}</p><p><MapPin size={15} /> {nextEvent.location}</p></div>
          <ChevronRight size={20} />
        </Card>
      </section>

      <section className="quick-grid">
        <Link to="/app/nominations" className="quick-card quick-card--accent"><Sparkles /><span><strong>Próxima leitura</strong><small>3 livros indicados</small></span><ChevronRight /></Link>
        <Link to="/app/forum" className="quick-card"><MessageCircle /><span><strong>Novas conversas</strong><small>8 mensagens hoje</small></span><ChevronRight /></Link>
      </section>

      <Card className="notice-card">
        <span className="notice-icon"><Megaphone size={21} /></span>
        <div><span className="eyebrow">AVISO DA MARINA</span><h3>Tragam uma passagem favorita</h3><p>No encontro de sexta, vamos abrir a conversa com uma leitura coletiva.</p><small>Publicado há 3 horas</small></div>
      </Card>

      <section>
        <div className="section-heading"><div><span className="eyebrow">NOSSO RITMO</span><h2>Outubro em movimento</h2></div></div>
        <div className="stats-grid">
          <Card><BookCover book={currentBook} size="sm" /><strong>62%</strong><span>média de leitura</span></Card>
          <Card><Users /><strong>9</strong><span>membros ativos</span></Card>
          <Card><CalendarDays /><strong>2</strong><span>encontros marcados</span></Card>
        </div>
      </section>
    </div>
  )
}
