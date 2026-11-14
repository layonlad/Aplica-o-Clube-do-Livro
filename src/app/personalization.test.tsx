import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appearanceTokens, contrast, defaultAppearance, ensureContrast, presetOptions } from './appearance'
import { BookOpening, INTRO_KEY, introDuration, introVariant } from './BookOpening'
import { UserAvatar, UserIdentity, initialsOf } from '../components/UserAvatar'
import { avatarFileError } from '../components/AvatarUploader'

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: null }) }))

describe('cores e contraste', () => {
  it('todos os temas prontos mantêm texto branco legível nos botões (AA)', () => {
    for (const preset of presetOptions) expect(contrast(preset.brand, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })
  it('ajusta uma cor personalizada clara demais até atingir AA', () => {
    const result = ensureContrast('#f4b942', '#ffffff')
    expect(result.adjusted).toBe(true)
    expect(contrast(result.color, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(ensureContrast('#462b70', '#ffffff')).toEqual({ color: '#462b70', adjusted: false })
  })
  it('a cor personalizada no modo escuro fica legível sobre o fundo escuro', () => {
    const tokens = appearanceTokens({ ...defaultAppearance, preset: 'personalizado', accent: '#1a1a40', mode: 'dark' })
    expect(contrast(tokens.vars['--brand']!, '#17111f')).toBeGreaterThanOrEqual(4.5)
  })
  it('a aparência padrão não sobrescreve nenhum token do design system', () => {
    expect(Object.values(appearanceTokens(defaultAppearance).vars).every((value) => value === null)).toBe(true)
  })
})

describe('abertura com livro', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('escolhe a versão certa para sessão, movimento reduzido e aparelhos modestos', () => {
    expect(introVariant({ seen: true, reducedMotion: false })).toBeNull()
    expect(introVariant({ seen: false, reducedMotion: true })).toBe('still')
    expect(introVariant({ seen: false, reducedMotion: false, cores: 2 })).toBe('lite')
    expect(introVariant({ seen: false, reducedMotion: false, saveData: true })).toBe('lite')
    expect(introVariant({ seen: false, reducedMotion: false, cores: 8 })).toBe('full')
    expect(introDuration.full).toBeLessThanOrEqual(3000)
  })
  it('pode ser pulada e não se repete na mesma sessão', () => {
    const { unmount } = render(<BookOpening />)
    const skip = screen.getByRole('button', { name: 'Pular abertura' })
    expect(sessionStorage.getItem(INTRO_KEY)).toBe('1')
    fireEvent.click(skip)
    act(() => void vi.advanceTimersByTime(400))
    expect(screen.queryByRole('button', { name: 'Pular abertura' })).not.toBeInTheDocument()
    unmount()
    render(<BookOpening />)
    expect(screen.queryByTestId('book-intro')).not.toBeInTheDocument()
  })
  it('sai sozinha depois da duração prevista', () => {
    render(<BookOpening />)
    expect(screen.getByTestId('book-intro')).toBeInTheDocument()
    act(() => void vi.advanceTimersByTime(introDuration.full + 50))
    expect(screen.queryByTestId('book-intro')).not.toBeInTheDocument()
  })
})

describe('foto e identidade', () => {
  it('mostra iniciais quando não há foto e liga o nome ao perfil', () => {
    expect(initialsOf('Maria Clara Souza')).toBe('MC')
    expect(initialsOf('  ')).toBe('?')
    render(
      <MemoryRouter>
        <UserIdentity id="u1" name="Maria Clara" meta="Resenha" />
        <UserAvatar name="João" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Maria Clara' })).toHaveAttribute('href', '/app/people/u1')
    expect(screen.getByText('MC')).toBeInTheDocument()
    expect(screen.getByText('J')).toBeInTheDocument()
  })
  it('recusa formatos e tamanhos inválidos antes do envio', () => {
    expect(avatarFileError({ type: 'image/gif', size: 1000 })).toMatch(/JPG, PNG ou WebP/)
    expect(avatarFileError({ type: 'image/png', size: 20_000_000 })).toMatch(/15 MB/)
    expect(avatarFileError({ type: 'image/webp', size: 300_000 })).toBe('')
  })
})
