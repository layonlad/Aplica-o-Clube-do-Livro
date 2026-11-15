import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appearanceTokens, contrast, defaultAppearance, ensureContrast, normalizeAppearance, presetOptions, sameAppearance } from './appearance'
import { appearanceSchema } from '../../server/src/appearance-schema'
import { BookOpening, INTRO_KEY, introDuration, introVariant, introZoom } from './BookOpening'
import { UserAvatar, UserIdentity, initialsOf } from '../components/UserAvatar'
import { avatarFileError } from '../components/AvatarUploader'
import { coverFileError } from '../components/CoverUploader'

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

describe('formatação: texto, espaçamento e formatos', () => {
  it('converte as escolhas em tokens de escala, densidade, entrelinha e cantos', () => {
    const { vars } = appearanceTokens({
      ...defaultAppearance,
      textSize: 'sm',
      density: 'compact',
      lineHeight: 'relaxed',
      buttons: 'square',
    })
    expect(vars['--text-scale']).toBe('0.875')
    expect(vars['--density-user']).toBe('0.88')
    expect(vars['--leading-normal']).toBe('1.75')
    expect(vars['--radius-button']).toBe('var(--radius-xs)')
    expect(vars['--radius-field']).toBe('var(--radius-xs)')
  })
  it('preferências antigas, sem os campos novos, continuam válidas e equivalem ao padrão', () => {
    const old = { preset: 'padrao', mode: 'light', accent: null, headingFont: 'fraunces', bodyFont: 'jakarta', radius: 'round' } as const
    expect(appearanceSchema.safeParse(old).success).toBe(true)
    expect(normalizeAppearance(old)).toEqual(defaultAppearance)
    expect(sameAppearance(old, defaultAppearance)).toBe(true)
    expect(appearanceSchema.safeParse({ ...old, textSize: 'gigante' }).success).toBe(false)
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
    // Mais lenta, mas abaixo de 5 s (movimento automático mais longo pediria controle de pausa).
    expect(introDuration.full).toBeGreaterThanOrEqual(4000)
    expect(introDuration.full).toBeLessThan(5000)
  })
  it('o zoom final faz a página cobrir a tela inteira, no celular e no computador', () => {
    for (const viewport of [{ width: 375, height: 812 }, { width: 1440, height: 900 }]) {
      const page = { width: 173, height: 245 }
      const zoom = introZoom(page, viewport)
      expect(page.width * zoom).toBeGreaterThanOrEqual(viewport.width)
      expect(page.height * zoom).toBeGreaterThanOrEqual(viewport.height)
    }
  })
  it('não tem botão de pular, fecha com Esc e não se repete na mesma sessão', () => {
    const { unmount } = render(<BookOpening />)
    expect(screen.getByTestId('book-intro')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(sessionStorage.getItem(INTRO_KEY)).toBe('1')
    fireEvent.keyDown(document, { key: 'Escape' })
    act(() => void vi.advanceTimersByTime(400))
    expect(screen.queryByTestId('book-intro')).not.toBeInTheDocument()
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
    expect(avatarFileError({ type: 'image/bmp', size: 1000 })).toMatch(/JPG, PNG, WebP ou GIF/)
    expect(avatarFileError({ type: 'image/png', size: 20_000_000 })).toMatch(/15 MB/)
    expect(avatarFileError({ type: 'image/webp', size: 300_000 })).toBe('')
    // GIF (inclusive animado) é aceito até 8 MB, na foto e na capa.
    expect(avatarFileError({ type: 'image/gif', size: 2_000_000 })).toBe('')
    expect(avatarFileError({ type: 'image/gif', size: 9_000_000 })).toMatch(/8 MB/)
    expect(coverFileError({ type: 'image/gif', size: 7_000_000 })).toBe('')
    expect(coverFileError({ type: 'image/gif', size: 8_500_000 })).toMatch(/8 MB/)
    expect(coverFileError({ type: 'application/pdf', size: 1000 })).toMatch(/JPG, PNG, WebP ou GIF/)
  })
})
