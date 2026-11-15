import { it, expect } from 'vitest'
import { appearanceSchema } from '../../server/src/appearance-schema'
import { appearanceTokens, applyAppearance, defaultAppearance, contrast } from './appearance'
it('aplica fundo personalizado, cores legíveis e limpa a prévia ao voltar ao tema', () => {
  const custom = appearanceSchema.parse({ ...defaultAppearance, background: '#123456' })
  const tokens = appearanceTokens(custom)
  expect(tokens.vars['--bg']).toBe('#123456')
  expect(contrast(tokens.vars['--text']!, '#123456')).toBeGreaterThanOrEqual(7)
  applyAppearance(custom)
  expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#123456')
  applyAppearance(defaultAppearance)
  expect(document.documentElement.style.getPropertyValue('--bg')).toBe('')
})
it('continua aceitando preferências antigas sem campo de fundo', () => {
  const old = { ...defaultAppearance }
  delete old.background
  expect(appearanceSchema.safeParse(old).success).toBe(true)
  expect(appearanceSchema.safeParse({ ...old, background: 'url(javascript:bad)' }).success).toBe(
    false,
  )
})

it.each(['#777777','#123456','#ffff00','#00ff00','#ffffff','#000000'])('mantém contraste AA nas superfícies sobre %s',background=>{
 const {vars}=appearanceTokens({...defaultAppearance,background})
 for(const surface of [background,vars['--surface']!,vars['--surface-raised']!,vars['--bg-sunken']!])expect(contrast(vars['--text']!,surface)).toBeGreaterThanOrEqual(4.5)
 expect(contrast(vars['--text-on-brand']!,vars['--brand']!)).toBeGreaterThanOrEqual(4.5)
})
