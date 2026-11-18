import { beforeEach, expect, it } from 'vitest'
import { readStoredAppearance, defaultTheme } from './ThemeProvider'
import { APPEARANCE_KEY, defaultAppearance } from './appearance'
beforeEach(() => localStorage.clear())
it('usa Inter no primeiro acesso e após salvar o tema legado padrão', () => {
  expect(readStoredAppearance()).toEqual(defaultAppearance)
  localStorage.setItem('clube-aurora-demo-theme', JSON.stringify(defaultTheme))
  expect(readStoredAppearance().bodyFont).toBe('inter')
})
it('preserva a escolha explícita de fonte e o modo do usuário', () => {
  localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ ...defaultAppearance, bodyFont: 'jakarta', mode: 'dark' }))
  expect(readStoredAppearance()).toMatchObject({ bodyFont: 'jakarta', mode: 'dark' })
})
it('preserva a fonte editorial escolhida no tema legado', () => {
  localStorage.setItem('clube-aurora-demo-theme', JSON.stringify({ ...defaultTheme, font: 'editorial' }))
  expect(readStoredAppearance().bodyFont).toBe('lora')
})
