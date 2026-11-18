import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import {
  emptyWorkspace,
  preferencesSchema,
  type WorkspaceSnapshot,
} from '../../server/src/workspace-model'
import { readingPages } from './reading-layout'
import { ReadingRoom } from './ReadingRoom'
const mocks = vi.hoisted(() => ({ snapshot: {} as WorkspaceSnapshot, act: vi.fn() }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('./WorkspaceProvider', () => ({
  useWorkspace: () => ({
    snapshot: mocks.snapshot,
    act: mocks.act,
    busy: false,
    scope: 'personal',
    clubs: [],
  }),
}))
vi.mock('./epub-storage', () => ({ localEpub: vi.fn(async () => undefined) }))
const id = '11111111-1111-4111-8111-111111111111'
const first = Array.from(
  { length: 55 },
  (_, n) =>
    `Primeiro capítulo, parágrafo ${n}: uma passagem original de teste com posição única para conferir os destaques.\n\n`,
).join('')
const second = Array.from(
  { length: 55 },
  (_, n) =>
    `Segundo capítulo, parágrafo ${n}: outro trecho original que deve continuar privado e guardar a posição correta.\n\n`,
).join('')
const content = first + second
const chapters = [
  { title: 'Primeiro', start: 0, end: first.length },
  { title: 'Segundo', start: first.length, end: content.length },
]
const pages = readingPages(content, chapters)
beforeEach(() => {
  mocks.act.mockReset()
  mocks.act.mockResolvedValue(true)
  Element.prototype.scrollIntoView = vi.fn()
})
it.each([
  ['paged', 1],
  ['scroll', 1],
  ['scroll', pages.findIndex((page) => page.chapter === 1) + 1],
] as const)(
  'guarda a posição exata do trecho selecionado em %s, página %i',
  async (flow, index) => {
    mocks.snapshot = {
      state: {
        ...emptyWorkspace(),
        books: [
          {
            id,
            title: 'Livro de teste',
            author: 'Autora',
            category: '',
            content,
            chapters,
            createdAt: '2026-11-17T12:00:00Z',
            createdBy: 'visitor',
          },
        ],
      },
      reading: {
        [id]: {
          percent: 20,
          page: index,
          locator: pages[index].start,
          bookmark: null,
          rating: 0,
          finishedAt: null,
        },
      },
      preferences: preferencesSchema.parse({
        reader: { size: 20, font: 'serif', theme: 'light', margin: 'comfortable', flow },
      }),
      version: 0,
      role: 'owner',
      actorId: 'visitor',
    }
    const { container } = render(
      <MemoryRouter initialEntries={[`/app/reader/${id}`]}>
        <Routes>
          <Route path="/app/reader/:id" element={<ReadingRoom />} />
        </Routes>
      </MemoryRouter>,
    )
    await act(async () => {})
    const block =
      flow === 'scroll'
        ? container.querySelector(`[data-page="${index}"]`)!
        : container.querySelector('.text-page')!
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()!
    while (node && !node.textContent) node = walker.nextNode()!
    const range = document.createRange()
    range.setStart(node, 0)
    range.setEnd(node, 28)
    const quote = range.toString()
    await act(async () => {
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
    })
    expect(screen.getByRole('dialog', { name: 'Guardar um trecho' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar destaque' }))
    expect(mocks.act).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'reading.annotate',
        id,
        quote,
        start: pages[index].start,
        end: pages[index].start + quote.length,
      }),
    )
  },
)
