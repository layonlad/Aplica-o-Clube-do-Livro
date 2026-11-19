import { fireEvent, render, screen } from '@testing-library/react'
import type { User } from 'firebase/auth'
import { afterEach, expect, it, vi } from 'vitest'
import { KindleExport, supportsFileShare } from './KindleExport'

const { call, fetchFile } = vi.hoisted(() => ({ call: vi.fn(), fetchFile: vi.fn() }))
vi.mock('../auth/api', () => ({
  apiRequest: call,
  authenticatedResponse: fetchFile,
  messageFor: (err: Error) => err.message,
}))
vi.mock('./client', () => ({ kindleBookPath: () => '/private/book' }))
const user = { uid: 'reading-test' } as User

afterEach(() => {
  call.mockReset()
  fetchFile.mockReset()
  vi.unstubAllGlobals()
})

it('identifica suporte ao EPUB pelo sistema, inclusive quando canShare lança exceção', () => {
  const epub = new File(['example'], 'book.epub', { type: 'application/epub+zip' })
  expect(supportsFileShare(epub, {} as Navigator)).toBe(false)
  expect(supportsFileShare(epub, { share: vi.fn(), canShare: () => false } as unknown as Navigator)).toBe(false)
  expect(supportsFileShare(epub, { share: vi.fn(), canShare: () => { throw Error('indisponível') } } as unknown as Navigator)).toBe(false)
  expect(supportsFileShare(epub, { share: vi.fn(), canShare: ({ files }: ShareData) => files?.[0] === epub } as unknown as Navigator)).toBe(true)
})

it('oferece download manual após a preparação quando compartilhar arquivo é indisponível', async () => {
  call.mockResolvedValue({ file: { id: 'file', filename: 'original.epub', byteSize: 3, permission: 'personal' }, history: [] })
  fetchFile.mockResolvedValue({
    headers: new Headers({ 'X-Reading-Export-Id': 'attempt', 'Content-Type': 'application/epub+zip' }),
    blob: async () => new Blob(['abc']),
  })
  render(<KindleExport user={user} bookId="book" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Preparar EPUB' }))
  expect(await screen.findByRole('button', { name: 'Baixar EPUB' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: 'Compartilhar pelo aparelho' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Abrir Send to Kindle' })).toHaveAttribute('href', 'https://www.amazon.com/sendtokindle')
  expect(call.mock.calls.some(([, path]) => path.endsWith('/attempt'))).toBe(false)
})

it('mostra falha do arquivo e mantém o envio indisponível', async () => {
  call.mockResolvedValue({ file: { id: 'file', filename: 'original.epub', byteSize: 3, permission: 'personal' }, history: [] })
  fetchFile.mockRejectedValue(new Error('Não foi possível recuperar o arquivo agora.'))
  render(<KindleExport user={user} bookId="book" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Preparar EPUB' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível recuperar o arquivo')
  expect(screen.queryByRole('button', { name: 'Baixar EPUB' })).not.toBeInTheDocument()
})
