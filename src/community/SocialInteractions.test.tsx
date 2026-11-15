import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { SpaceSwitcher } from '../components/SpaceSwitcher'
import { CoverUploader } from '../components/CoverUploader'
import { PostComments } from './ClubWall'
import { apiRequest } from '../auth/api'
const { user } = vi.hoisted(() => ({
  user: { uid: 'reader', emailVerified: true, displayName: 'Leitora' },
}))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user }) }))
vi.mock('../workspace/WorkspaceProvider', () => ({ useWorkspace: () => ({}) }))
vi.mock('../auth/api', async (original) => ({
  ...(await original<typeof import('../auth/api')>()),
  apiRequest: vi.fn(),
}))
vi.mock('./PrivateMedia', () => ({
  PrivateMedia: ({ alt }: { alt: string }) => <span>{alt}</span>,
  MediaPicker: () => null,
}))
beforeEach(() => {
  vi.mocked(apiRequest).mockReset()
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:local-test'),
  })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
})
it('abre a lista suspensa e escolhe um espaço por teclado sem select nativo', async () => {
  const change = vi.fn(),
    keyboard = userEvent.setup()
  render(
    <SpaceSwitcher
      label="Você está em"
      disabled={false}
      value="personal"
      options={[
        { id: 'personal', name: 'Meu espaço pessoal' },
        { id: 'club', name: 'Um clube com nome longo para testar a leitura' },
      ]}
      onChange={change}
    />,
  )
  const trigger = screen.getByRole('button', { name: 'Espaço de leitura' })
  await keyboard.click(trigger)
  expect(screen.getByRole('listbox')).toBeInTheDocument()
  await waitFor(() =>
    expect(screen.getByRole('option', { name: 'Meu espaço pessoal' })).toHaveFocus(),
  )
  await keyboard.keyboard('{ArrowDown}{Enter}')
  expect(change).toHaveBeenCalledWith('club')
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})
it('mostra comentários no painel, envia a resposta para o post certo e fecha', async () => {
  const keyboard = userEvent.setup(),
    close = vi.fn(),
    changed = vi.fn()
  const existing = {
    id: 'comment',
    body: 'Uma conversa que já existe.',
    author: { id: 'someone', name: 'Outra leitora' },
    parentId: null,
    createdAt: '2026-11-14T12:00:00Z',
    likes: 0,
    liked: false,
    canDelete: false,
  }
  const created = { ...existing, id: 'created', body: 'Gostei desta leitura.' }
  vi.mocked(apiRequest).mockImplementation((_u, path, method) =>
    Promise.resolve(
      method === 'POST'
        ? { id: 'created' }
        : path.endsWith('/created')
          ? created
          : { items: [existing], nextCursor: null },
    ),
  )
  render(
    <MemoryRouter>
      <PostComments clubId="club-a" postId="post-a" onClose={close} onCountChanged={changed} />
    </MemoryRouter>,
  )
  expect(await screen.findByText('Uma conversa que já existe.')).toBeInTheDocument()
  expect(screen.getByRole('dialog', { name: 'Comentários' })).toBeInTheDocument()
  await keyboard.type(screen.getByLabelText('Seu comentário'), 'Gostei desta leitura.')
  await keyboard.click(screen.getByRole('button', { name: 'Publicar comentário' }))
  await waitFor(() =>
    expect(apiRequest).toHaveBeenCalledWith(user, '/clubs/club-a/posts/post-a/comments', 'POST', {
      body: 'Gostei desta leitura.',
      mediaIds: [],
      clientRequestId: expect.any(String),
    }),
  )
  await waitFor(() => expect(changed).toHaveBeenCalled())
  await keyboard.click(screen.getByRole('button', { name: 'Fechar comentários' }))
  expect(close).toHaveBeenCalled()
})
it('reutiliza a capa GIF do Claude e salva sem submeter outro formulário', async () => {
  const keyboard = userEvent.setup(),
    saved = vi.fn()
  vi.mocked(apiRequest).mockResolvedValue({ coverId: 'gif-cover' })
  render(<CoverUploader coverId={null} isPublic onChange={saved} />)
  const file = new File(['GIF89a-test'], 'cover.gif', { type: 'image/gif' })
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => new TextEncoder().encode('GIF89a-test').buffer,
  })
  await keyboard.upload(screen.getByLabelText('Adicionar capa do perfil'), file)
  expect(screen.getByRole('group', { name: 'Prévia da capa animada' })).toBeInTheDocument()
  await keyboard.click(screen.getByRole('button', { name: 'Salvar capa' }))
  await waitFor(() => expect(saved).toHaveBeenCalledWith('gif-cover'))
  expect(apiRequest).toHaveBeenCalledWith(user, '/me/cover', 'POST', { data: expect.any(String) })
  expect(await screen.findByRole('status')).toHaveTextContent('Capa salva')
})
