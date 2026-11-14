import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, MapPin } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, readableError } from '../auth/api'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import { Button, SkeletonPage } from '../components/ui'
import { ConfirmAction } from '../community/ClubWall'
import type { Page } from '../../server/src/community-contracts'
import type { ForumPage } from '../../server/src/forum-contracts'
export interface ClubEvent {
  id: string
  title: string
  date: string
  location: string
  description: string
  bookId: string | null
  bookTitle: string
  topicId: string | null
  version: number
  confirmed: number
  myRsvp: 'yes' | 'maybe' | 'no' | null
  legacyPhotoCount: number
  albums: number
}
type EventPage = Page<ClubEvent> & { canManage: boolean }
const localInput = (date: string) => {
  const value = new Date(date)
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset())
  return value.toISOString().slice(0, 16)
}
export function ClubCalendar({ clubId }: { clubId: string }) {
  const { user } = useAuth(),
    [page, setPage] = useState<EventPage>({ items: [], nextCursor: null, canManage: false }),
    [period, setPeriod] = useState('upcoming'),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [editing, setEditing] = useState<ClubEvent | null | undefined>(undefined),
    [boundary] = useState(() => new Date().toISOString())
  const filters =
      period === 'upcoming'
        ? `from=${boundary}&order=asc`
        : period === 'past'
          ? `until=${boundary}&order=desc`
          : 'order=desc',
    path = `/clubs/${clubId}/events`
  useEffect(() => {
    let live = true
    setBusy(true)
    setError('')
    setPage({ items: [], nextCursor: null, canManage: false })
    apiRequest<EventPage>(user!, `${path}?${filters}`)
      .then((value) => live && setPage(value))
      .catch((err) => live && setError(readableError(err)))
      .finally(() => live && setBusy(false))
    return () => {
      live = false
    }
  }, [user?.uid, user?.emailVerified, path, filters, revision])
  async function action(suffix: string, payload?: unknown, method = 'POST') {
    setBusy(true)
    setError('')
    try {
      await apiRequest(user!, path + suffix, method, payload)
      setRevision((n) => n + 1)
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="stack-lg">
      <header className="page-intro">
        <div>
          <span className="eyebrow">LEITURAS QUE VIRAM ENCONTROS</span>
          <h1>Calendário do clube</h1>
          <p>Combine o próximo encontro, confirme presença e guarde as memórias na galeria.</p>
        </div>
        {page.canManage && (
          <Button disabled={busy} onClick={() => setEditing(null)}>
            Agendar encontro
          </Button>
        )}
      </header>
      <div className="workspace-actions" role="group" aria-label="Período dos encontros">
        {[
          ['upcoming', 'Próximos'],
          ['past', 'Passados'],
          ['all', 'Todos'],
        ].map(([value, label]) => (
          <Button
            variant={period === value ? 'primary' : 'secondary'}
            key={value}
            aria-pressed={period === value}
            onClick={() => setPeriod(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      {editing !== undefined && (
        <EventEditor
          clubId={clubId}
          event={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined)
            setRevision((n) => n + 1)
          }}
        />
      )}
      {error && <p role="alert">{error}</p>}
      {busy && !page.items.length && <SkeletonPage label="Abrindo encontros…" />}
      <div className="event-list-x">
        {page.items.map((event) => (
          <article className="card event-card-x" key={event.id}>
            <header>
              <span className="eyebrow">
                {new Date(event.date).toLocaleDateString('pt-BR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </span>
              <h2>{event.title}</h2>
              <p>
                {new Date(event.date).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {event.location && (
                  <>
                    {' '}
                    · <MapPin size={15} /> {event.location}
                  </>
                )}
              </p>
            </header>
            <p className="preserve-text">{event.description}</p>
            {event.bookTitle && (
              <p>
                Entre essas páginas: <strong>{event.bookTitle}</strong>
              </p>
            )}
            <p>{event.confirmed} presença(s) confirmada(s)</p>
            <div
              className="workspace-actions"
              role="group"
              aria-label={`Sua presença em ${event.title}`}
            >
              {(['yes', 'maybe', 'no'] as const).map((value, index) => (
                <Button
                  key={value}
                  variant={event.myRsvp === value ? 'primary' : 'secondary'}
                  aria-pressed={event.myRsvp === value}
                  disabled={busy}
                  onClick={() => void action(`/${event.id}/rsvp`, { value })}
                >
                  {['Vou', 'Talvez', 'Não vou'][index]}
                </Button>
              ))}
            </div>
            <div className="workspace-actions">
              <Link to={`/app/gallery?event=${event.id}`}>
                {event.albums ? 'Abrir álbuns' : 'Criar álbum do encontro'} →
              </Link>
              {event.topicId && (
                <Link to={`/app/forum?topic=${event.topicId}`}>Discussão do encontro →</Link>
              )}
              {page.canManage && (
                <>
                  <Button variant="ghost" disabled={busy} onClick={() => setEditing(event)}>
                    Editar encontro
                  </Button>
                  <ConfirmAction
                    label="Excluir encontro"
                    disabled={busy}
                    onConfirm={() => action('/' + event.id, undefined, 'DELETE')}
                  />
                </>
              )}
            </div>
            <Attendees clubId={clubId} event={event} canManage={page.canManage} />
            {event.legacyPhotoCount > 0 && (
              <LegacyPhotos clubId={clubId} eventId={event.id} count={event.legacyPhotoCount} />
            )}
          </article>
        ))}
      </div>
      {!busy && !error && !page.items.length && (
        <div className="library-empty">
          <CalendarDays size={36} />
          <h2>Uma data para novas histórias</h2>
          <p>Os encontros deste período aparecerão aqui.</p>
        </div>
      )}
      {page.nextCursor && (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            void apiRequest<EventPage>(
              user!,
              `${path}?${filters}&cursor=${encodeURIComponent(page.nextCursor!)}`,
            )
              .then((next) =>
                setPage((value) => ({ ...next, items: [...value.items, ...next.items] })),
              )
              .catch((err) => setError(readableError(err)))
              .finally(() => setBusy(false))
          }}
        >
          Mais encontros
        </Button>
      )}
    </div>
  )
}
function EventEditor({
  clubId,
  event,
  onClose,
  onSaved,
}: {
  clubId: string
  event: ClubEvent | null
  onClose: () => void
  onSaved: () => void
}) {
  const { user } = useAuth(),
    { snapshot } = useWorkspace(),
    [title, setTitle] = useState(event?.title ?? ''),
    [date, setDate] = useState(event ? localInput(event.date) : ''),
    [location, setLocation] = useState(event?.location ?? ''),
    [description, setDescription] = useState(event?.description ?? ''),
    [bookId, setBookId] = useState(event?.bookId ?? ''),
    [topicId, setTopicId] = useState(event?.topicId ?? ''),
    [topics, setTopics] = useState<ForumPage | null>(null),
    [topicSearch, setTopicSearch] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  async function searchTopics() {
    try {
      setTopics(
        await apiRequest<ForumPage>(
          user!,
          `/clubs/${clubId}/forum/topics` +
            (topicSearch.trim().length >= 2 ? '?q=' + encodeURIComponent(topicSearch) : ''),
        ),
      )
    } catch (err) {
      setError(readableError(err))
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await apiRequest(
        user!,
        `/clubs/${clubId}/events` + (event ? `/${event.id}/edit` : ''),
        'POST',
        {
          title,
          date: new Date(date).toISOString(),
          location,
          description,
          bookId: bookId || null,
          topicId: topicId || null,
          ...(event ? { version: event.version } : {}),
        },
      )
      onSaved()
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="card">
      <form className="workspace-form" onSubmit={submit}>
        <h2>{event ? 'Editar encontro' : 'Um novo encontro'}</h2>
        <label>
          Título do encontro
          <input
            required
            maxLength={150}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Data e hora
          <input
            type="datetime-local"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          Local ou link da reunião
          <input maxLength={200} value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
        <label>
          Descrição
          <textarea
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label>
          Livro relacionado
          <select value={bookId} onChange={(e) => setBookId(e.target.value)}>
            <option value="">Sem livro</option>
            {snapshot?.state.books.map((book) => (
              <option value={book.id} key={book.id}>
                {book.title}
              </option>
            ))}
          </select>
        </label>
        <details>
          <summary>Vincular uma discussão do fórum</summary>
          <label>
            Buscar discussão
            <input
              maxLength={100}
              value={topicSearch}
              onChange={(e) => setTopicSearch(e.target.value)}
            />
          </label>
          <Button type="button" variant="secondary" onClick={() => void searchTopics()}>
            Buscar discussões
          </Button>
          <label>
            Discussão
            <select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
              <option value="">Sem discussão</option>
              {event?.topicId && !topics?.items.some((t) => t.id === event.topicId) && (
                <option value={event.topicId}>Discussão já vinculada</option>
              )}
              {[...(topics?.pinned ?? []), ...(topics?.items ?? [])].map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title}
                </option>
              ))}
            </select>
          </label>
        </details>
        {error && <p role="alert">{error}</p>}
        <div className="workspace-actions">
          <Button disabled={busy}>Salvar encontro</Button>
          <Button type="button" disabled={busy} variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </form>
    </section>
  )
}
function Attendees({
  clubId,
  event,
  canManage,
}: {
  clubId: string
  event: ClubEvent
  canManage: boolean
}) {
  const { user } = useAuth(),
    [open, setOpen] = useState(false),
    [page, setPage] = useState<
      Page<{ id: string; name: string; rsvp: string; attended: boolean | null }>
    >({ items: [], nextCursor: null }),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const path = `/clubs/${clubId}/events/${event.id}/attendees`
  useEffect(() => {
    if (!open) return
    let live = true
    apiRequest<typeof page>(user!, path)
      .then((value) => live && setPage(value))
      .catch((err) => live && setError(readableError(err)))
    return () => {
      live = false
    }
  }, [user?.uid, user?.emailVerified, open, path, revision, event.myRsvp])
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Participantes e lista de presença</summary>
      {error && <p role="alert">{error}</p>}
      {page.items.map((person) => (
        <div className="workspace-actions" key={person.id}>
          <span>
            {person.name} ·{' '}
            {
              ({ yes: 'Confirmou', maybe: 'Talvez', no: 'Não vai' } as Record<string, string>)[
                person.rsvp
              ]
            }
            {person.attended === null ? '' : person.attended ? ' · Presente' : ' · Ausente'}
          </span>
          {canManage && (
            <>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  void apiRequest(user!, path + '/' + person.id, 'POST', {
                    attended: !person.attended,
                  })
                    .then(() => setRevision((n) => n + 1))
                    .catch((err) => setError(readableError(err)))
                    .finally(() => setBusy(false))
                }}
              >
                {person.attended ? 'Marcar ausência' : 'Marcar presença'}
              </Button>
            </>
          )}
        </div>
      ))}
      {!page.items.length && <p>Nenhuma resposta de presença ainda.</p>}
      {page.nextCursor && (
        <Button
          variant="ghost"
          onClick={() =>
            void apiRequest<typeof page>(
              user!,
              path + '?cursor=' + encodeURIComponent(page.nextCursor!),
            )
              .then((next) =>
                setPage((value) => ({
                  items: [...value.items, ...next.items],
                  nextCursor: next.nextCursor,
                })),
              )
              .catch((err) => setError(readableError(err)))
          }
        >
          Mais participantes
        </Button>
      )}
    </details>
  )
}
function LegacyPhotos({
  clubId,
  eventId,
  count,
}: {
  clubId: string
  eventId: string
  count: number
}) {
  const { user } = useAuth(),
    [open, setOpen] = useState(false),
    [photos, setPhotos] = useState<{ id: string; src: string }[]>([]),
    [error, setError] = useState('')
  useEffect(() => {
    if (!open) return
    let live = true
    apiRequest<{ photos: typeof photos }>(user!, `/clubs/${clubId}/events/${eventId}/legacy-photos`)
      .then((value) => live && setPhotos(value.photos))
      .catch((err) => live && setError(readableError(err)))
    return () => {
      live = false
    }
  }, [user?.uid, user?.emailVerified, clubId, eventId, open])
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{count} foto(s) do calendário anterior</summary>
      <p>Os novos registros ficam na galeria do clube.</p>
      {error && <p role="alert">{error}</p>}
      <div className="workspace-photos">
        {photos.map((photo) => (
          <img
            key={photo.id}
            src={photo.src}
            alt="Registro anterior deste encontro"
            loading="lazy"
          />
        ))}
      </div>
    </details>
  )
}
