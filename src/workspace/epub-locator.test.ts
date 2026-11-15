import { it, expect } from 'vitest'
import { epubTextPoint } from './epub-locator'
it('retoma o próximo parágrafo quando a posição está exatamente na fronteira entre nós', () => {
  const root = document.createElement('article')
  root.innerHTML = '<p>Alpha</p><p><strong>Beta</strong> fim</p>'
  const point = epubTextPoint(root, 5)
  expect(point?.node.textContent).toBe('Beta')
  expect(point?.offset).toBe(0)
  expect(epubTextPoint(root, 7)?.offset).toBe(2)
})
it('limita posições fora do texto e suporta capítulo sem texto', () => {
  const root = document.createElement('article')
  root.innerHTML = '<p>Uma página</p>'
  expect(epubTextPoint(root, -4)?.offset).toBe(0)
  expect(epubTextPoint(root, 9000)?.offset).toBe('Uma página'.length)
  expect(epubTextPoint(document.createElement('article'), 0)).toBeNull()
})
