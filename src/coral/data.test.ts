import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../auth/api', () => ({ publicRequest: request, readableError: (e: Error) => e.message }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('../workspace/WorkspaceProvider', () => ({ useWorkspace: () => ({ clubs: [] }) }))
import { useDiscoverClubs } from './data'
beforeEach(() => request.mockReset())
it('carrega a próxima página pelo cursor sem repetir clubes', async () => {
  request.mockResolvedValueOnce({ items: [{ id: 'a' }], nextCursor: 'next' })
    .mockResolvedValueOnce({ items: [{ id: 'a' }, { id: 'b' }], nextCursor: null })
  const { result } = renderHook(() => useDiscoverClubs())
  await waitFor(() => expect(result.current.page?.nextCursor).toBe('next'))
  await act(() => result.current.loadMore())
  expect(request).toHaveBeenLastCalledWith('/discover/clubs?cursor=next')
  expect(result.current.page?.items.map((item) => item.id)).toEqual(['a', 'b'])
})
it('descarta uma página atrasada quando a pesquisa muda', async () => {
  let finish!: (value: unknown) => void
  request.mockResolvedValueOnce({ items: [{ id: 'a' }], nextCursor: 'old' })
    .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    .mockResolvedValueOnce({ items: [{ id: 'new' }], nextCursor: null })
  const { result, rerender } = renderHook(({ query }) => useDiscoverClubs(query), { initialProps: { query: '' } })
  await waitFor(() => expect(result.current.page?.nextCursor).toBe('old'))
  let more!: Promise<void>
  act(() => { more = result.current.loadMore() })
  rerender({ query: 'Fantasia' })
  await waitFor(() => expect(result.current.page?.items[0]?.id).toBe('new'))
  await act(async () => { finish({ items: [{ id: 'stale' }], nextCursor: null }); await more })
  expect(result.current.page?.items.map((item) => item.id)).toEqual(['new'])
})
