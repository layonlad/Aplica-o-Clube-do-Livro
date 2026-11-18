import { onSessionEnd, sessionEnded } from '../auth/session-events'
import { useEffect, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, publicRequest, readableError } from '../auth/api'
import type { ClubSettings } from '../../server/src/club-management'
import type { ClubDetails } from '../../server/src/contracts'
import type { Page, PostDto } from '../../server/src/community-contracts'
import type { WorkspaceSnapshot } from '../../server/src/workspace-model'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import { socialRead } from '../community/social-api'

/** Resumo de um clube para os cartões (Início, Comunidade, Clubes). Só dados que a API já devolve. */
export interface ClubSummary {
  id: string
  name: string
  role?: string
  description: string
  visibility: ClubSettings['visibility']
  accent: string
  coverMediaId: string | null
  memberCount: number | null
  currentBook: { title: string; author: string } | null
  nextEvent: { title: string; date: string } | null
  /** Houve publicação, comentário ou encontro nos últimos 3 dias. */
  active: boolean
}

const cache = new Map<string, { at: number; value: ClubSummary }>()
const TTL = 60_000
onSessionEnd((uid) => {
  for (const key of cache.keys()) if (key.startsWith(uid + ':')) cache.delete(key)
})

async function loadClub(user: User, club: { id: string; name: string; role?: string }): Promise<ClubSummary> {
  const cacheKey = user.uid + ':' + club.id
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.at < TTL) return hit.value
  const [settings, details, workspace] = await Promise.all([
    apiRequest<ClubSettings>(user, `/clubs/${club.id}/settings`).catch(() => null),
    apiRequest<ClubDetails>(user, `/clubs/${club.id}`).catch(() => null),
    apiRequest<WorkspaceSnapshot>(user, `/clubs/${club.id}/workspace?view=app`).catch(() => null),
  ])
  const state = workspace?.state
  const book = state ? (state.books.find((item) => item.id === state.currentBookId) ?? null) : null
  const upcoming = state
    ? [...state.events].filter((event) => new Date(event.date).getTime() >= Date.now()).sort((a, b) => a.date.localeCompare(b.date))[0]
    : undefined
  const recent = Date.now() - 3 * 86400_000
  const value: ClubSummary = {
    id: club.id,
    name: settings?.name ?? club.name,
    role: club.role,
    description: settings?.description ?? '',
    visibility: settings?.visibility ?? 'private',
    accent: settings?.accent ?? '#6e477c',
    coverMediaId: settings?.coverMediaId ?? null,
    memberCount: details?.memberCount ?? details?.members.filter((member) => member.status === 'active').length ?? null,
    currentBook: book ? { title: book.title, author: book.author } : null,
    nextEvent: upcoming ? { title: upcoming.title, date: upcoming.date } : null,
    active: !!state && (state.topics.some((topic) => new Date(topic.at).getTime() > recent) || state.events.some((event) => Math.abs(new Date(event.date).getTime() - Date.now()) < 3 * 86400_000)),
  }
  // Só guarda o resumo quando o clube respondeu; uma falha passageira não fica presa no cache.
  if (settings && !sessionEnded(user)) cache.set(cacheKey, { at: Date.now(), value })
  return value
}
export function forgetClub(id?: string) {
  if (id) {
    for (const key of cache.keys()) if (key.endsWith(':' + id)) cache.delete(key)
  } else cache.clear()
}

/** Clubes de que a pessoa participa, com capa, membros, livro do momento e próximo encontro. */
export function useMyClubs() {
  const { user } = useAuth(),
    { clubs } = useWorkspace(),
    [items, setItems] = useState<ClubSummary[] | null>(null),
    [error, setError] = useState('')
  const key = clubs.map((club) => club.id).join(',')
  useEffect(() => {
    if (!user?.emailVerified) {
      setItems([])
      return
    }
    let live = true
    setError('')
    Promise.all(clubs.map((club) => loadClub(user, club)))
      .then((value) => live && setItems(value))
      .catch((err) => live && setError(readableError(err)))
    return () => {
      live = false
    }
  }, [user?.uid, user?.emailVerified, key])
  return { items, error }
}

export interface DiscoverClub {
  id: string
  name: string
  description: string
  visibility: string
  accent: string
  coverMediaId?: string | null
}
/** Clubes abertos a novos leitores (públicos ou que aceitam pedidos). */
export function useDiscoverClubs(query = '', reload = 0) {
  const [page, setPage] = useState<{ items: DiscoverClub[]; nextCursor: string | null } | null>(null)
  const [error, setError] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const generation = useRef(0)
  const paging = useRef(false)
  const search = query.trim().length >= 2 ? query.trim() : ''
  const path = (cursor?: string) => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (cursor) params.set('cursor', cursor)
    return '/discover/clubs' + (params.size ? `?${params}` : '')
  }
  useEffect(() => {
    const current = ++generation.current
    setPage(null)
    setError('')
    paging.current = false
    setLoadingMore(false)
    publicRequest<{ items: DiscoverClub[]; nextCursor: string | null }>(path())
      .then((value) => current === generation.current && setPage(value))
      .catch((err) => current === generation.current && setError(readableError(err)))
    return () => { generation.current++ }
  }, [search, reload])
  async function loadMore() {
    if (!page?.nextCursor || paging.current) return
    const current = generation.current
    paging.current = true
    setLoadingMore(true)
    setError('')
    try {
      const next = await publicRequest<{ items: DiscoverClub[]; nextCursor: string | null }>(path(page.nextCursor))
      if (current !== generation.current) return
      setPage((previous) => previous && ({ ...next, items: [...previous.items, ...next.items.filter((club) => !previous.items.some((item) => item.id === club.id))] }))
    } catch (err) {
      if (current === generation.current) setError(readableError(err))
    } finally {
      if (current === generation.current) { paging.current = false; setLoadingMore(false) }
    }
  }
  return { page, error, loadMore, loadingMore }
}

/** Pessoas que você segue e que publicaram recentemente (para "Leituras dos amigos"). */
export function useFollowingReaders() {
  const { user } = useAuth(),
    [people, setPeople] = useState<{ id: string; name: string; avatarId?: string | null; book: string }[] | null>(null)
  useEffect(() => {
    if (!user?.emailVerified) {
      setPeople([])
      return
    }
    let live = true
    socialRead<Page<PostDto>>(user, '/public/posts?following=1&limit=30')
      .then((page) => {
        if (!live) return
        const seen = new Map<string, { id: string; name: string; avatarId?: string | null; book: string }>()
        for (const post of page.items)
          if (post.author.id !== user.uid && !seen.has(post.author.id))
            seen.set(post.author.id, { ...post.author, book: post.bookTitle })
        setPeople([...seen.values()])
      })
      .catch(() => live && setPeople([]))
    return () => {
      live = false
    }
  }, [user?.uid, user?.emailVerified])
  return people
}

/** Publicações públicas recentes (Novidades da comunidade). */
export function useCommunityPosts(filters: string, revision = 0) {
  const { user } = useAuth(),
    [page, setPage] = useState<Page<PostDto> | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    let live = true
    setBusy(true)
    setError('')
    socialRead<Page<PostDto>>(user, `/public/posts?${filters}`)
      .then((value) => live && setPage(value))
      .catch((err) => live && setError(readableError(err)))
      .finally(() => live && setBusy(false))
    return () => {
      live = false
    }
  }, [user?.uid, user?.emailVerified, filters, revision])
  return { page, setPage, error, busy }
}
