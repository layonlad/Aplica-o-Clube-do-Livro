import { afterEach, expect, it, vi } from 'vitest'
import type { User } from 'firebase/auth'
import { apiRequest, authenticatedResponse } from '../auth/api'
import { announceBookFiles, bookCoverBlob } from './book-files'

vi.mock('./epub-storage', () => ({ localEpub: vi.fn(async () => undefined), saveEpub: vi.fn() }))
vi.mock('../auth/api', async original => ({
  ...(await original<typeof import('../auth/api')>()),
  apiRequest: vi.fn(),
  authenticatedResponse: vi.fn(),
}))
afterEach(() => {
  vi.unstubAllEnvs()
  vi.mocked(apiRequest).mockReset()
  vi.mocked(authenticatedResponse).mockReset()
})

it('compartilha a consulta de disponibilidade e pede apenas capas que têm original', async () => {
  vi.stubEnv('VITE_API_URL', 'https://api.example.invalid')
  const user = { uid: 'reader', emailVerified: true } as User
  const fetched = vi.mocked(apiRequest)
  fetched.mockResolvedValueOnce({ enabled: true, bookIds: ['existing'] })
  const cover = vi.mocked(authenticatedResponse)
  cover.mockImplementation(async () => new Response('capa', { headers: { 'Content-Type': 'image/jpeg' } }))
  const result = await Promise.all(['missing-1', 'existing', 'missing-2'].map(id => bookCoverBlob(user, id)))
  expect(fetched).toHaveBeenCalledTimes(1)
  expect(cover).toHaveBeenCalledTimes(1)
  expect(cover.mock.calls[0][1]).toBe('/me/book-files/existing/cover')
  expect(result[0]).toBeUndefined()
  expect(result[2]).toBeUndefined()
  expect(result[1]?.size).toBe(4)

  announceBookFiles()
  fetched.mockResolvedValueOnce({ enabled: true, bookIds: ['missing-1'] })
  expect((await bookCoverBlob(user, 'missing-1'))?.size).toBe(4)
  expect(fetched).toHaveBeenCalledTimes(2)
  expect(cover).toHaveBeenCalledTimes(2)
})
