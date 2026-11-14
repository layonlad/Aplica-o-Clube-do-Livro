import { expect, it } from 'vitest'
import { pageAt, readingPages } from './reading-layout'
it('preserva limites de capítulos e localiza uma posição estável', () => {
  const first = 'Uma página. '.repeat(300),
    second = 'Outra história. '.repeat(200)
  const text = first + '\n\n' + second
  const pages = readingPages(text, [
    { start: 0, end: first.length },
    { start: first.length + 2, end: text.length },
  ])
  expect(
    pages
      .filter((page) => page.chapter === 0)
      .map((page) => text.slice(page.start, page.end))
      .join(''),
  ).toBe(first)
  expect(
    pages
      .filter((page) => page.chapter === 1)
      .map((page) => text.slice(page.start, page.end))
      .join(''),
  ).toBe(second)
  expect(pages[pageAt(pages, first.length + 20)].chapter).toBe(1)
  expect(pages.every((page) => page.end > page.start)).toBe(true)
})
