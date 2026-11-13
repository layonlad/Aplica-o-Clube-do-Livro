import { z } from 'zod'

const id = z.uuid()
const title = z.string().trim().min(1).max(150)
const text = z.string().trim().min(1).max(5000)
const date = z.iso.datetime({ offset: true })
const photo = z.string().max(220000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)
const annotationSchema = z.object({ id, start: z.number().int().min(0).max(600000), end: z.number().int().min(1).max(600000), quote: z.string().min(1).max(280), note: z.string().max(2000), at: date }).strict()
export const preferencesSchema = z.object({
  shelves: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  reader: z.object({ size: z.number().int().min(16).max(32), font: z.enum(['serif','sans']), theme: z.enum(['light','dark','sepia']), margin: z.enum(['compact','comfortable','wide']) }).default({size:20,font:'serif',theme:'light',margin:'comfortable'}),
}).default({shelves:[],reader:{size:20,font:'serif',theme:'light',margin:'comfortable'}})
export type ReadingPreferences = z.infer<typeof preferencesSchema>
export const readingSchema = z.record(id, z.object({ percent: z.number().int().min(0).max(100), page: z.number().int().min(0).max(10000), bookmark: z.number().int().min(0).max(10000).nullable(), rating: z.number().int().min(0).max(5), finishedAt: date.nullable(),
  status:z.enum(['want','reading','finished','paused','abandoned']).optional(), favorite:z.boolean().optional(), shelf:z.string().max(60).optional(), locator:z.number().int().min(0).max(600000).optional(), revision:z.number().int().min(0).optional(),annotations:z.array(annotationSchema).max(200).optional(),
}).strict()).refine(value => Object.keys(value).length <= 100)
export const bookMetadataSchema = z.object({isbn:z.string().max(32).optional(),synopsis:z.string().max(3000).optional(),publisher:z.string().max(150).optional(),language:z.string().max(50).optional(),year:z.string().max(20).optional(),pages:z.number().int().min(1).max(100000).optional(),source:z.string().max(500).optional(),license:z.string().max(500).optional(),cover:z.string().regex(/^https:\/\/covers\.openlibrary\.org\/b\/id\/\d+-M\.jpg$/).optional()}).strict()
export const chapterSchema = z.object({title:z.string().max(200),start:z.number().int().min(0).max(600000),end:z.number().int().min(1).max(600000)}).strict()
export const workspaceSchema = z.object({
  books: z.array(z.object({ id, title, author: title, category: z.string().max(80), content: z.string().max(600000), createdBy: z.string(), createdAt: date, metadata:bookMetadataSchema.optional(), chapters:z.array(chapterSchema).max(1000).optional() })).max(100),
  currentBookId: id.nullable(),
  events: z.array(z.object({ id, title, date, location: z.string().max(200), description: z.string().max(2000), createdBy: z.string(), rsvps: z.record(z.string(), z.enum(['yes', 'maybe', 'no'])), photos: z.array(z.object({ id, src: photo, by: z.string() })).max(8) })).max(100),
  topics: z.array(z.object({ id, title, body: text, by: z.string(), name: title, at: date, spoiler: z.boolean(), likedBy: z.array(z.string()).max(500), replies: z.array(z.object({ id, body: text, by: z.string(), name: title, at: date })).max(100) })).max(200),
  nominations: z.array(z.object({ id, title, author: title, by: z.string(), name: title })).max(100),
  draws: z.array(z.object({ id, title, winnerId: id, candidates: z.array(z.object({ id, title })).min(1).max(100), by: z.string(), at: date })).max(100),
}).strict()
export type WorkspaceState = z.infer<typeof workspaceSchema>
export type ReadingState = z.infer<typeof readingSchema>
export interface WorkspaceSnapshot { state: WorkspaceState; reading: ReadingState; preferences?:ReadingPreferences; version: number; role: 'owner' | 'member'; actorId: string }
export const emptyWorkspace = (): WorkspaceState => ({ books: [], currentBookId: null, events: [], topics: [], nominations: [], draws: [] })

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('workspace.import'), state: workspaceSchema, reading: readingSchema,preferences:preferencesSchema.optional() }).strict(),
  z.object({ type: z.literal('book.add'), title, author: title, category: z.string().max(80), content: z.string().max(600000),metadata:bookMetadataSchema.optional(),chapters:z.array(chapterSchema).max(1000).optional() }).strict(),
  z.object({ type:z.literal('book.metadata'),id,title,author:title,category:z.string().max(80),metadata:bookMetadataSchema }).strict(),
  z.object({ type: z.literal('book.remove'), id }).strict(),
  z.object({ type: z.literal('book.current'), id: id.nullable() }).strict(),
  z.object({ type: z.literal('reading.update'), id, percent: z.number().int().min(0).max(100).optional(), page: z.number().int().min(0).max(10000).optional(), bookmark: z.number().int().min(0).max(10000).nullable().optional(), rating: z.number().int().min(0).max(5).optional(),status:z.enum(['want','reading','finished','paused','abandoned']).optional(),favorite:z.boolean().optional(),shelf:z.string().max(60).optional(),locator:z.number().int().min(0).max(600000).optional(),expectedRevision:z.number().int().min(0).optional() }).strict(),
  z.object({type:z.literal('reading.annotate'),id,start:z.number().int().min(0),end:z.number().int().min(1),quote:z.string().min(1).max(280),note:z.string().max(2000)}).strict(),
  z.object({type:z.literal('reading.annotation.remove'),id,annotationId:id}).strict(),
  z.object({type:z.literal('shelf.add'),name:z.string().trim().min(1).max(60)}).strict(),
  z.object({type:z.literal('shelf.remove'),name:z.string().trim().min(1).max(60)}).strict(),
  z.object({type:z.literal('reader.preferences'),reader:preferencesSchema.unwrap().shape.reader}).strict(),
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
export class WorkspaceError extends Error { constructor(public code: 'FORBIDDEN' | 'NOT_FOUND' | 'LIMIT' | 'READING_CHANGED', message: string) { super(message) } }
export const isPersonalAction=(action:WorkspaceAction)=>action.type.startsWith('reading.')||action.type.startsWith('shelf.')||action.type==='reader.preferences'

export function applyWorkspaceAction(snapshot: WorkspaceSnapshot, action: WorkspaceAction, actor: { id: string; name: string }, options: { id: string; now: string; drawIndex?: number; personal?: boolean }): WorkspaceSnapshot {
  let state = structuredClone(snapshot.state)
  let reading = structuredClone(snapshot.reading)
  let preferences=preferencesSchema.parse(snapshot.preferences)
  const owner = snapshot.role === 'owner'
  const requireOwner = () => { if (!owner) throw new WorkspaceError('FORBIDDEN', 'Somente o responsável pode fazer essa alteração no clube.') }
  const missing = () => new WorkspaceError('NOT_FOUND', 'Este item não está mais disponível.')
  const book = 'id' in action ? state.books.find(b => b.id === action.id) : undefined
  const event = 'id' in action ? state.events.find(e => e.id === action.id) : undefined
  const topic = 'id' in action ? state.topics.find(t => t.id === action.id) : undefined
  switch (action.type) {
    case 'workspace.import': if (!options.personal) throw new WorkspaceError('FORBIDDEN', 'O backup só pode ser importado no espaço pessoal.'); state = action.state; reading = action.reading;preferences=preferencesSchema.parse(action.preferences); break
    case 'book.add': requireOwner(); state.books.unshift({ id: options.id, title: action.title, author: action.author, category: action.category, content: action.content, createdBy: actor.id, createdAt: options.now,...(action.metadata?{metadata:action.metadata}:{}),...(action.chapters?{chapters:action.chapters}:{}) }); break
    case 'book.metadata':requireOwner();if(!book)throw missing();Object.assign(book,{title:action.title,author:action.author,category:action.category,metadata:action.metadata});break
    case 'book.remove': requireOwner(); if (!book) throw missing(); state.books = state.books.filter(b => b.id !== action.id); if (state.currentBookId === action.id) state.currentBookId = null; delete reading[action.id]; break
    case 'book.current': requireOwner(); if (action.id && !book) throw missing(); state.currentBookId = action.id; break
    case 'reading.update': {
      if (!book) throw missing()
      const previous = reading[action.id] ?? { percent: 0, page: 0, bookmark: null, rating: 0, finishedAt: null }
      if(action.expectedRevision!==undefined&&action.expectedRevision!==(previous.revision??0))throw new WorkspaceError('READING_CHANGED','Sua leitura mudou em outro dispositivo. Recarregue antes de salvar novamente.')
      const { type: _, id: __, expectedRevision:___,...patch } = action
      const next = { ...previous, ...patch }
      if(action.status==='finished')next.percent=100
      else if(action.percent===100)next.status='finished'
      else if(action.status&&next.percent===100)next.percent=0
      else if(action.percent!==undefined&&action.percent<100)next.status=action.percent>0?'reading':'want'
      next.revision=(previous.revision??0)+1
      next.finishedAt = next.percent === 100 ? previous.finishedAt ?? options.now : null
      reading[action.id] = next
      break
    }
    case 'reading.annotate':{
      if(!book)throw missing()
      if(action.end<=action.start||book.content.slice(action.start,action.end)!==action.quote)throw new WorkspaceError('LIMIT','Selecione um trecho válido do texto, com até 280 caracteres.')
      const previous=reading[action.id]??{percent:0,page:0,bookmark:null,rating:0,finishedAt:null}
      reading[action.id]={...previous,revision:(previous.revision??0)+1,annotations:[...(previous.annotations??[]),{id:options.id,start:action.start,end:action.end,quote:action.quote,note:action.note,at:options.now}]};break
    }
    case 'reading.annotation.remove':{if(!book)throw missing();const previous=reading[action.id];if(!previous)throw missing();reading[action.id]={...previous,revision:(previous.revision??0)+1,annotations:previous.annotations?.filter(note=>note.id!==action.annotationId)};break}
    case 'shelf.add':if(!preferences.shelves.includes(action.name))preferences.shelves.push(action.name);break
    case 'shelf.remove':preferences.shelves=preferences.shelves.filter(name=>name!==action.name);for(const item of Object.values(reading))if(item.shelf===action.name)item.shelf='';break
    case 'reader.preferences':preferences.reader=action.reader;break
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
  return { ...snapshot, state: parsed.data, reading: readingSchema.parse(reading),preferences:preferencesSchema.parse(preferences), version: snapshot.version + (isPersonalAction(action) ? 0 : 1) }
}
