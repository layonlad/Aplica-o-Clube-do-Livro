import { readEpub } from './epub-archive'
import type { z } from 'zod'
import type { bookMetadataSchema, chapterSchema } from '../../server/src/workspace-model'
export interface ImportedBook {
  title: string
  author: string
  content: string
  metadata?: z.infer<typeof bookMetadataSchema>
  chapters?: z.infer<typeof chapterSchema>[]
}

function xml(value: string) {
  if (/<!\s*ENTITY\b/i.test(value)) throw Error('O EPUB contém entidades XML não suportadas.')
  const safe = value.replace(/<!DOCTYPE[\s\S]*?>/gi, '')
  const doc = new DOMParser().parseFromString(safe, 'application/xml')
  if (doc.querySelector('parsererror')) throw Error('O EPUB contém um documento inválido.')
  return doc
}
export async function importBook(file: File): Promise<ImportedBook> {
  if (file.size > 10000000) throw Error('Escolha um arquivo de até 10 MB.')
  if (/\.txt$/i.test(file.name)) {
    const content = (await file.text()).trim()
    if (!content || content.length > 600000)
      throw Error('O texto deve ter entre 1 e 600 mil caracteres.')
    return {
      title: file.name.replace(/\.txt$/i, ''),
      author: 'Autoria não informada',
      content,
    }
  }
  if (!/\.epub$/i.test(file.name)) throw Error('Selecione um arquivo EPUB ou TXT.')
  const archive = await readEpub(file)
  const chapters: string[] = []
  const outline: z.infer<typeof chapterSchema>[] = []
  let offset = 0
  for (const chapter of archive.chapters) {
    const doc = xml(chapter.html)
    doc.querySelectorAll('script,style,svg,iframe,object,head').forEach((node) => node.remove())
    const blocks = Array.from(doc.querySelectorAll('h1,h2,h3,p,li,blockquote')).filter(
      (node) => !node.parentElement?.closest('p,li,blockquote'),
    )
    const text = (
      blocks.length
        ? blocks
            .map((node) => node.textContent?.trim())
            .filter(Boolean)
            .join('\n\n')
        : (doc.documentElement.textContent ?? '')
    ).trim()
    if (text) {
      if (chapters.length) offset += 2
      outline.push({
        title:
          doc.querySelector('h1,h2,h3')?.textContent?.trim().slice(0, 200) ||
          `Capítulo ${outline.length + 1}`,
        start: offset,
        end: offset + text.length,
      })
      chapters.push(text)
      offset += text.length
    }
  }
  const fullContent = chapters.filter(Boolean).join('\n\n'),
    content = fullContent.slice(0, 600000)
  if (!content) throw Error('O EPUB deve conter texto legível.')
  return {
    title: archive.title || file.name.replace(/\.epub$/i, ''),
    author: archive.author || 'Autoria não informada',
    content,
    chapters: outline
      .filter((item) => item.start < 600000)
      .map((item) => ({ ...item, end: Math.min(item.end, 600000) })),
    metadata: {
      ...archive.metadata,
      source:
        fullContent.length > 600000
          ? 'EPUB importado. Texto simplificado limitado a 600 mil caracteres; abra o EPUB original para ler a edição completa.'
          : 'EPUB importado',
    },
  }
}

export { importPhoto } from './import-photo'
