import { Blob } from 'node:buffer'
import { webcrypto } from 'node:crypto'
import { beforeEach, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { EpubReader } from './EpubReader'
import { syntheticEpub } from './epub-test-fixture'
const mocks = vi.hoisted(() => ({
  local: vi.fn(),
  act: vi.fn(),
  snapshot: { reading: {} as Record<string, unknown> },
}))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('./WorkspaceProvider', () => ({
  useWorkspace: () => ({ snapshot: mocks.snapshot, act: mocks.act, busy: false, clubs: [] }),
}))
vi.mock('./epub-storage', () => ({
  localEpub: (...args: unknown[]) => mocks.local(...args),
  saveEpub: vi.fn(),
  removeEpub: vi.fn(),
}))
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto)
  Element.prototype.scrollIntoView = vi.fn()
  mocks.local.mockReset()
  mocks.act.mockReset()
  mocks.snapshot = { reading: {} }
  mocks.act.mockResolvedValue(true)
})
it('não incorpora scripts, handlers, recursos remotos ou formulários do EPUB e salva a navegação privada', async () => {
  const bytes = syntheticEpub(
    '<h1>Capítulo seguro</h1><script>window.evil=1</script><img src="https://untrusted.example/pixel.png" onerror="window.evil=2"/><form action="https://untrusted.example"><input name="secret"/><p>Texto legível</p></form><a href="javascript:alert(1)">Link bloqueado</a>',
  )
  mocks.local.mockResolvedValue({
    file: new Blob([new Uint8Array(bytes)]),
    filename: 'synthetic.epub',
  })
  const { container } = render(
    <MemoryRouter>
      <EpubReader bookId="test-book" title="Livro" author="Autora" />
    </MemoryRouter>,
  )
  await screen.findByText('Texto legível')
  expect(container.querySelector('script')).toBeNull()
  expect(container.querySelector('[onerror]')).toBeNull()
  expect(container.querySelector('img[src^="http"]')).toBeNull()
  expect(container.querySelector('form[action]')).toBeNull()
  expect(container.querySelector('a[href^="javascript"]')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Próximo capítulo' }))
  await screen.findByText('A história continua aqui.')
  await waitFor(() =>
    expect(mocks.act).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'reading.update',
        id: 'test-book',
        epubLocator: expect.objectContaining({
          chapter: 1,
          hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    ),
  )
})
