import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { emptyWorkspace, type WorkspaceAction, type WorkspaceSnapshot } from '../../server/src/workspace-model'
import { apiRequest } from '../auth/api'
import { useWorkspace, WorkspaceProvider } from './WorkspaceProvider'

const { account } = vi.hoisted(() => ({ account: { uid: 'reader', emailVerified: true } }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: account }) }))
vi.mock('../auth/api', async original => ({
  ...(await original<typeof import('../auth/api')>()),
  apiRequest: vi.fn(),
}))

it('usa a revisão confirmada ao salvar duas viradas antes de renderizar novamente', async () => {
  const bookId = '3eeb0885-8db5-45e4-9bef-e13c4c3a0849'
  const state: WorkspaceSnapshot = {
    actorId: account.uid, role: 'owner', version: 0, state: emptyWorkspace(), reading: {},
  }
  let revision = 0
  const seen: number[] = []
  vi.mocked(apiRequest).mockImplementation(async (_user, path, method, payload) => {
    if (path === '/me') return { clubs: [] }
    if (method !== 'POST') return state
    const { action } = payload as { action: Extract<WorkspaceAction, { type: 'reading.update' }> }
    seen.push(action.expectedRevision!)
    if (action.expectedRevision !== revision) throw Error('Revisão incorreta')
    revision++
    return { ...state, reading: { [bookId]: { revision, percent: action.percent } } }
  })
  const hook = renderHook(() => useWorkspace(), { wrapper: WorkspaceProvider })
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  await act(async () => {
    const save = hook.result.current.act
    for (const percent of [12, 18]) {
      const action = { type: 'reading.update', id: bookId, percent, expectedRevision: 0 } as const
      expect(await save(action, undefined, { quiet: true })).toBe(true)
    }
  })
  expect(seen).toEqual([0, 1])
})
