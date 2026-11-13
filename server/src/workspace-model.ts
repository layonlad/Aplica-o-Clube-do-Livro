import { z } from 'zod'

const id = z.uuid()
const title = z.string().trim().min(1).max(150)
const text = z.string().trim().min(1).max(5000)
const date = z.iso.datetime({ offset: true })
const photo = z.string().max(220000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)
export const readingSchema = z.record(id, z.object({ percent: z.number().int().min(0).max(100), page: z.number().int().min(0).max(10000), bookmark: z.number().int().min(0).max(10000).nullable(), rating: z.number().int().min(0).max(5), finishedAt: date.nullable() }).strict()).refine(value => Object.keys(value).length <= 100)
export const workspaceSchema = z.object({
  books: z.array(z.object({ id, title, author: title, category: z.string().max(80), content: z.string().max(600000), createdBy: z.string(), createdAt: date })).max(100),
  currentBookId: id.nullable(),
  events: z.array(z.object({ id, title, date, location: z.string().max(200), description: z.string().max(2000), createdBy: z.string(), rsvps: z.record(z.string(), z.enum(['yes', 'maybe', 'no'])), photos: z.array(z.object({ id, src: photo, by: z.string() })).max(8) })).max(100),
  topics: z.array(z.object({ id, title, body: text, by: z.string(), name: title, at: date, spoiler: z.boolean(), likedBy: z.array(z.string()).max(500), replies: z.array(z.object({ id, body: text, by: z.string(), name: title, at: date })).max(100) })).max(200),
  nominations: z.array(z.object({ id, title, author: title, by: z.string(), name: title })).max(100),
  draws: z.array(z.object({ id, title, winnerId: id, candidates: z.array(z.object({ id, title })).min(1).max(100), by: z.string(), at: date })).max(100),
}).strict()
export type WorkspaceState = z.infer<typeof workspaceSchema>
export type ReadingState = z.infer<typeof readingSchema>
export interface WorkspaceSnapshot { state: WorkspaceState; reading: ReadingState; version: number; role: 'owner' | 'member'; actorId: string }
export const emptyWorkspace = (): WorkspaceState => ({ books: [], currentBookId: null, events: [], topics: [], nominations: [], draws: [] })

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('workspace.import'), state: workspaceSchema, reading: readingSchema }).strict(),
  z.object({ type: z.literal('book.add'), title, author: title, category: z.string().max(80), content: z.string().max(600000) }).strict(),
  z.object({ type: z.literal('book.remove'), id }).strict(),
  z.object({ type: z.literal('book.current'), id: id.nullable() }).strict(),
  z.object({ type: z.literal('reading.update'), id, percent: z.number().int().min(0).max(100).optional(), page: z.number().int().min(0).max(10000).optional(), bookmark: z.number().int().min(0).max(10000).nullable().optional(), rating: z.number().int().min(0).max(5).optional() }).strict(),
  z.object({ type: z.literal('event.add'), title, date, location: z.string().max(200), description: z.string().max(2000) }).strict(),
  z.object({ type: z.literal('event.remove'), id }).strict(),
  z.object({ type: z.literal('event.rsvp'), id, value: z.enum(['yes', 'maybe', 'no']) }).strict(),
  z.object({ type: z.literal('event.photo'), id, src: photo }).strict(),
  z.object({ type: z.literal('topic.add'), title, body: text, spoiler: z.boolean() }).strict(),
  z.object({ type: z.literal('topic.reply'), id, body: text }).strict(),
  z.object({ type: z.literal('topic.like'), id }).strict(),
  z.object({ type: z.literal('topic.remove'), id }).strict(),
  z.object({ type: z.literal('nomination.add'), title, author: title }).strict(),
  z.object({ type: z.literal('nomination.remove'), id }).strict(),
  z.object({ type: z.literal('draw') }).strict(),
])
export type WorkspaceAction = z.infer<typeof actionSchema>
export class WorkspaceError extends Error { constructor(public code: 'FORBIDDEN' | 'NOT_FOUND' | 'LIMIT', message: string) { super(message) } }

export function applyWorkspaceAction(snapshot: WorkspaceSnapshot, action: WorkspaceAction, actor: { id: string; name: string }, options: { id: string; now: string; drawIndex?: number; personal?: boolean }): WorkspaceSnapshot {
  let state = structuredClone(snapshot.state)
  let reading = structuredClone(snapshot.reading)
  const owner = snapshot.role === 'owner'
  const requireOwner = () => { if (!owner) throw new WorkspaceError('FORBIDDEN', 'Somente o responsável pode fazer essa alteração no clube.') }
  const missing = () => new WorkspaceError('NOT_FOUND', 'Este item não está mais disponível.')
  const book = 'id' in action ? state.books.find(b => b.id === action.id) : undefined
  const event = 'id' in action ? state.events.find(e => e.id === action.id) : undefined
  const topic = 'id' in action ? state.topics.find(t => t.id === action.id) : undefined
  switch (action.type) {
    case 'workspace.import': if (!options.personal) throw new WorkspaceError('FORBIDDEN', 'O backup só pode ser importado no espaço pessoal.'); state = action.state; reading = action.reading; break
    case 'book.add': requireOwner(); state.books.unshift({ id: options.id, title: action.title, author: action.author, category: action.category, content: action.content, createdBy: actor.id, createdAt: options.now }); break
    case 'book.remove': requireOwner(); if (!book) throw missing(); state.books = state.books.filter(b => b.id !== action.id); if (state.currentBookId === action.id) state.currentBookId = null; delete reading[action.id]; break
    case 'book.current': requireOwner(); if (action.id && !book) throw missing(); state.currentBookId = action.id; break
    case 'reading.update': {
      if (!book) throw missing()
      const previous = reading[action.id] ?? { percent: 0, page: 0, bookmark: null, rating: 0, finishedAt: null }
      const { type: _, id: __, ...patch } = action
      const next = { ...previous, ...patch }
      next.finishedAt = next.percent === 100 ? previous.finishedAt ?? options.now : null
      reading[action.id] = next
      break
    }
    case 'event.add': requireOwner(); state.events.push({ id: options.id, title: action.title, date: action.date, location: action.location, description: action.description, createdBy: actor.id, rsvps: {}, photos: [] }); break
    case 'event.remove': requireOwner(); if (!event) throw missing(); state.events = state.events.filter(e => e.id !== action.id); break
    case 'event.rsvp': if (!event) throw missing(); event.rsvps[actor.id] = action.value; break
    case 'event.photo': if (!event) throw missing(); event.photos.push({ id: options.id, src: action.src, by: actor.id }); break
    case 'topic.add': state.topics.unshift({ id: options.id, title: action.title, body: action.body, spoiler: action.spoiler, by: actor.id, name: actor.name, at: options.now, replies: [], likedBy: [] }); break
    case 'topic.reply': if (!topic) throw missing(); topic.replies.push({ id: options.id, body: action.body, by: actor.id, name: actor.name, at: options.now }); break
    case 'topic.like': if (!topic) throw missing(); topic.likedBy = topic.likedBy.includes(actor.id) ? topic.likedBy.filter(id => id !== actor.id) : [...topic.likedBy, actor.id]; break
    case 'topic.remove': if (!topic) throw missing(); if (!owner && topic.by !== actor.id) throw new WorkspaceError('FORBIDDEN', 'Você só pode excluir suas próprias conversas.'); state.topics = state.topics.filter(t => t.id !== action.id); break
    case 'nomination.add':
      if (!options.personal && state.nominations.some(n => n.by === actor.id)) throw new WorkspaceError('LIMIT', 'Você já indicou um livro nesta rodada.')
      state.nominations.push({ id: options.id, title: action.title, author: action.author, by: actor.id, name: actor.name }); break
    case 'nomination.remove': {
      const item = state.nominations.find(n => n.id === action.id); if (!item) throw missing()
      if (!owner && item.by !== actor.id) throw new WorkspaceError('FORBIDDEN', 'Você só pode retirar sua própria indicação.')
      state.nominations = state.nominations.filter(n => n.id !== action.id); break
    }
    case 'draw': {
      requireOwner()
      const winner = state.nominations[options.drawIndex ?? -1]
      if (!winner) throw new WorkspaceError('LIMIT', 'Adicione pelo menos um livro antes de sortear.')
      state.draws.unshift({ id: options.id, title: winner.title, winnerId: winner.id, candidates: state.nominations.map(n => ({ id: n.id, title: n.title })), by: actor.id, at: options.now })
      state.nominations = []
      break
    }
  }
  const parsed = workspaceSchema.safeParse(state)
  if (!parsed.success || JSON.stringify({state,reading}).length > 8000000) throw new WorkspaceError('LIMIT', 'O espaço atingiu o limite de itens ou conteúdo. Exporte um backup e organize o acervo.')
  reading = Object.fromEntries(Object.entries(reading).filter(([id]) => state.books.some(book => book.id === id)))
  return { ...snapshot, state: parsed.data, reading: readingSchema.parse(reading), version: snapshot.version + (action.type === 'reading.update' ? 0 : 1) }
}
