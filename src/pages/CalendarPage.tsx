import { CalendarDays, Camera, Check, ChevronLeft, ChevronRight, Clock3, MapPin, Users } from 'lucide-react'
import { useState } from 'react'
import { Button, Card, DemoBadge } from '../components/ui'
import { events as seedEvents } from '../data/mockData'
import type { ClubEvent } from '../types/domain'

export function CalendarPage() {
  const [events, setEvents] = useState(seedEvents)

  function setRsvp(id: string, rsvp: ClubEvent['rsvp']) {
    setEvents((current) => current.map((event) => event.id === id ? { ...event, rsvp } : event))
  }

  return (
    <div className="stack-lg">
      <div className="page-intro"><div><DemoBadge /><h1>Encontros que ficam</h1><p>Horários no fuso de São Paulo</p></div><CalendarDays className="title-icon" /></div>
      <Card className="calendar-strip">
        <div className="month-control"><button aria-label="Mês anterior"><ChevronLeft /></button><strong>Outubro 2026</strong><button aria-label="Próximo mês"><ChevronRight /></button></div>
        <div className="week-row">{['DOM','SEG','TER','QUA','QUI','SEX','SÁB'].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="date-row">{[18,19,20,21,22,23,24].map((day) => <span key={day} className={day === 24 ? 'active' : day === 21 ? 'today' : ''}>{day}</span>)}</div>
      </Card>

      <section>
        <div className="section-heading"><div><span className="eyebrow">PRÓXIMOS</span><h2>Na nossa agenda</h2></div></div>
        <div className="event-list">
          {events.map((event) => (
            <Card className="event-card" key={event.id}>
              <div className="date-tile"><strong>{event.day}</strong><span>{event.month}</span></div>
              <div className="event-card__main"><h3>{event.title}</h3><p><Clock3 size={15} /> {event.fullDate} · {event.time}</p><p><MapPin size={15} /> {event.location}</p><div className="event-meta"><span><Users size={15} /> {event.attendees} confirmados</span>{event.photos > 0 && <span><Camera size={15} /> {event.photos} fotos</span>}</div></div>
              <div className="rsvp-row" aria-label="Confirmar presença">
                <span>Você vai?</span>
                <Button variant={event.rsvp === 'yes' ? 'primary' : 'secondary'} onClick={() => setRsvp(event.id, 'yes')}>{event.rsvp === 'yes' && <Check size={15} />} Vou</Button>
                <Button variant={event.rsvp === 'maybe' ? 'primary' : 'ghost'} onClick={() => setRsvp(event.id, 'maybe')}>Talvez</Button>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}
