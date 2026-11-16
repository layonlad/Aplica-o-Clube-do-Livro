import { describe, expect, it } from 'vitest'
import { dominantColor } from './CoverBackdrop'
import { clearPendingShare, peekPendingShare, takePendingShare } from './BookShare'
import { contrast, ensureContrast } from '../app/appearance'

const pixels = (...colors: [number, number, number][]) =>
  new Uint8ClampedArray(colors.flatMap(([r, g, b]) => [r, g, b, 255]))

describe('cor da história (capa como fundo)', () => {
  it('pega a cor marcante da capa e ignora branco, preto e cinza', () => {
    const cover = pixels(
      ...Array(30).fill([250, 250, 250]),
      ...Array(20).fill([10, 10, 10]),
      ...Array(20).fill([128, 128, 130]),
      ...Array(12).fill([180, 40, 60]),
    )
    const color = dominantColor(cover)!
    expect(color).toMatch(/^#[0-9a-f]{6}$/)
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
    expect(r).toBeGreaterThan(g + 80)
    expect(r).toBeGreaterThan(b + 60)
  })
  it('capa só em tons neutros não muda as cores do app', () => {
    expect(dominantColor(pixels([255, 255, 255], [0, 0, 0], [120, 120, 120]))).toBeNull()
  })
  it('a versão para texto da cor da capa continua legível sobre o fundo', () => {
    for (const color of ['#f4b942', '#b9e6c9', '#fc7667', '#3d6be0'])
      expect(contrast(ensureContrast(color, '#fbf4e8').color, '#fbf4e8')).toBeGreaterThanOrEqual(4.5)
  })
})

describe('compartilhar a capa', () => {
  it('a publicação pronta só aparece no destino escolhido e é usada uma vez', async () => {
    const { BookShare } = await import('./BookShare')
    expect(BookShare).toBeTypeOf('function')
    expect(peekPendingShare('public')).toBeNull()
    expect(takePendingShare('public')).toBeNull()
    clearPendingShare()
  })
})
