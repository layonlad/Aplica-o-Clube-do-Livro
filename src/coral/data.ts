import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { ApiError, forgetCached, peekCached, publicRequest, readCached, readableError, updateCached } from '../auth/api'
import type { ClubSummary } from '../../server/src/club-management'
import type { Page, PostDto } from '../../server/src/community-contracts'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import { cachedSocialRead } from '../community/social-api'

export type { ClubSummary }
const clubSummaryPath = '/me/clubs/summary'

export function useMyClubs() {
  const { user } = useAuth()
  const { clubs } = useWorkspace()
  const owner = user?.emailVerified ? user.uid : null
  const membershipKey = clubs.map(({ id, role }) => `${id}:${role}`).join(',')
  const key = JSON.stringify([owner, membershipKey])
  const cached = owner ? peekCached<ClubSummary[]>(owner, clubSummaryPath) : []
  const [state, setState] = useState<{ key: string; items: ClubSummary[] | null; error: string }>({
    key, items: cached ?? null, error: '',
  })
  useEffect(() => {
    if (!owner || !user) return
    let live = true
    if (state.key !== key) forgetCached(owner, clubSummaryPath)
    void cachedSocialRead<ClubSummary[]>(user, clubSummaryPath).then((items) => {
      if (live) setState({ key, items, error: '' })
    }).catch((error: unknown) => {
      if (live) setState({ key, items: [], error: readableError(error) })
    })
    return () => { live = false }
  }, [key])
  if (state.key !== key) return { items: null, error: '' }
  // Membership changes take effect locally even if the old summary is still in memory.
  const allowed = new Set(clubs.map(({ id }) => id))
  return { ...state, items: state.items?.filter(({ id }) => allowed.has(id)) ?? null }
}

export interface DiscoverClub {
  id: string
  name: string
  description: string
  visibility: string
  accent: string
  coverMediaId?: string | null
}
function discoverPath(query: string, cursor?: string) {
  const search = query.trim()
  const params = new URLSearchParams()
  if (search.length >= 2) params.set('q', search)
  if (cursor) params.set('cursor', cursor)
  return '/discover/clubs' + (params.size ? `?${params}` : '')
}
/** Clubes abertos a novos leitores (públicos ou que aceitam pedidos). */
export function useDiscoverClubs(query = '', reload = 0) {
  const [page, setPage] = useState<{ items: DiscoverClub[]; nextCursor: string | null } | null>(() =>
    peekCached(null, discoverPath(query)) ?? null)
  const [error, setError] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const generation = useRef(0)
  const paging = useRef(false)
  const initialPath = discoverPath(query)
  useEffect(() => {
    const current = ++generation.current
    setPage(peekCached(null, initialPath) ?? null)
    setError('')
    paging.current = false
    setLoadingMore(false)
    readCached(null, initialPath, () => publicRequest<Page<DiscoverClub>>(initialPath), reload > 0)
      .then((value) => current === generation.current && setPage(value))
      .catch((err) => current === generation.current && setError(readableError(err)))
    return () => { generation.current++ }
  }, [initialPath, reload])
  async function loadMore() {
    if (!page?.nextCursor || paging.current) return
    const current = generation.current
    paging.current = true
    setLoadingMore(true)
    setError('')
    try {
      const next = await publicRequest<{ items: DiscoverClub[]; nextCursor: string | null }>(discoverPath(query, page.nextCursor))
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
    cachedSocialRead<Page<PostDto>>(user, '/public/posts?following=1&limit=30')
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

const emptyPage: Page<PostDto> = { items: [], nextCursor: null }

/** Retains the last verified page while it is refreshed. Filters are separate cache keys. */
export function useCommunityPosts(filters: string, revision = 0, selected?: string | null) {
  const { user } = useAuth()
  const owner = user?.emailVerified ? user.uid : null
  const path = selected ? `/public/posts/${selected}` : `/public/posts?${filters}`
  const cached = selected
    ? peekCached<PostDto>(owner, path)
    : peekCached<Page<PostDto>>(owner, path)
  const previous = cached && (selected ? { items: [cached as PostDto], nextCursor: null } : cached as Page<PostDto>)
  const key = JSON.stringify([owner, path])
  const [state, setState] = useState<{ key: string; page?: Page<PostDto>; error?: string; busy: boolean }>({
    key, page: previous, busy: !previous,
  })
  const current = state.key === key ? state : { key, page: previous, busy: true, error: '' }

  useEffect(() => {
    let live = true
    setState((state) => ({ key, page: state.key === key ? state.page : previous, busy: true }))
    const request = selected
      ? cachedSocialRead<PostDto>(user, path, revision > 0).then((post) => ({ items: [post], nextCursor: null }))
      : cachedSocialRead<Page<PostDto>>(user, path, revision > 0)
    void request.then((page) => {
      if (live) setState({ key, page, busy: false })
    }).catch((error: unknown) => {
      if (!live) return
      const denied = error instanceof ApiError && [401, 403, 404].includes(error.status)
      setState((state) => ({ key, page: denied || state.key !== key ? undefined : state.page, error: readableError(error), busy: false }))
    })
    return () => { live = false }
  }, [key, revision])

  return {
    page: current.page ?? null,
    error: current.error ?? '',
    busy: current.busy,
    setPage: (update: (page: Page<PostDto>) => Page<PostDto>, remember = false) => {
      if (remember && !selected) updateCached<Page<PostDto>>(owner, path, (page) => {
        const next = update(page)
        return next.items.length <= 100 ? next : page
      })
      setState((state) => state.key === key ? { ...state, page: update(state.page ?? emptyPage) } : state)
    },
  }
}
