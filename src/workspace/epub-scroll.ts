import { epubTextPoint } from './epub-locator'

export interface EpubPoint {
  offset: number
  element?: number
}

/** First visible printable character, independent of paragraphs and font metrics. */
export function visibleScrollPoint(body: HTMLElement, host: HTMLElement): EpubPoint {
  const { top, bottom } = host.getBoundingClientRect()
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
  let node: Node | null,
    total = 0
  while ((node = walker.nextNode())) {
    const text = node.textContent ?? '',
      range = document.createRange()
    range.selectNodeContents(node)
    const rect = range.getBoundingClientRect()
    if (/\S/.test(text) && rect.bottom > top + 1 && rect.top < bottom) {
      let low = 0,
        high = text.length - 1
      const below = (at: number) => {
        range.setStart(node!, at)
        range.setEnd(node!, at + 1)
        return range.getBoundingClientRect().bottom > top + 1
      }
      while (low < high) {
        const middle = Math.floor((low + high) / 2)
        if (below(middle)) high = middle
        else low = middle + 1
      }
      while (low < text.length && /\s/.test(text[low])) low++
      if (low < text.length) return { offset: total + low }
    }
    total += text.length
  }
  const images = [...body.querySelectorAll('img')]
  const element = images.findIndex((img) => {
    const rect = img.getBoundingClientRect()
    return rect.bottom > top + 1 && rect.top < bottom
  })
  return element >= 0 ? { offset: total, element } : { offset: total }
}

export function revealScrollPoint(body: HTMLElement, host: HTMLElement, point: EpubPoint) {
  const image =
    point.element === undefined ? undefined : body.querySelectorAll('img')[point.element]
  let rect = image?.getBoundingClientRect()
  if (!rect && point.offset > 0) {
    const text = epubTextPoint(body, point.offset)
    if (text) {
      const range = document.createRange(),
        length = text.node.textContent?.length ?? 0
      const at = Math.max(0, Math.min(text.offset, length - 1))
      range.setStart(text.node, at)
      range.setEnd(text.node, Math.min(at + 1, length))
      rect = range.getBoundingClientRect()
    }
  }
  host.scrollTop = rect ? host.scrollTop + rect.top - host.getBoundingClientRect().top : 0
}
