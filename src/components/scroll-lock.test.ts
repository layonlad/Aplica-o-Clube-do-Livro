import { it, expect } from 'vitest'
import { lockPageScroll } from './scroll-lock'

it('preserva o bloqueio de uma folha aberta quando o leitor pai desmonta primeiro', () => {
  document.body.style.overflow = 'auto'
  document.documentElement.style.overflow = 'scroll'
  const reader = lockPageScroll(),
    sheet = lockPageScroll()
  reader()
  reader()
  expect(document.body.style.overflow).toBe('hidden')
  expect(document.documentElement.style.overflow).toBe('hidden')
  sheet()
  expect(document.body.style.overflow).toBe('auto')
  expect(document.documentElement.style.overflow).toBe('scroll')
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
})
