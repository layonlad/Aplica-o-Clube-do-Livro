export interface ReadingPage {
  start: number
  end: number
  chapter: number
}
export function readingPages(
  content: string,
  chapters: { start: number; end: number }[] = [],
): ReadingPage[] {
  if (!content) return []
  const sections = chapters.length ? chapters : [{ start: 0, end: content.length }]
  const pages: ReadingPage[] = []
  sections.forEach((chapter, index) => {
    const end = Math.min(content.length, chapter.end)
    for (let start = Math.max(0, chapter.start); start < end; ) {
      let next = Math.min(start + 1800, end)
      if (next < end) {
        const boundary = content.lastIndexOf(' ', next)
        if (boundary > start + 900) next = boundary + 1
      }
      pages.push({ start, end: next, chapter: index })
      start = next
    }
  })
  return pages
}
export const pageAt = (pages: ReadingPage[], offset: number) =>
  Math.max(
    0,
    pages.findIndex((page) => offset >= page.start && offset < page.end),
  )
