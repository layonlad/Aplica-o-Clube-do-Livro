import { strFromU8 } from 'fflate'
import { openEpubPackage, epubResource, epubImage, epubCover } from '../../server/src/epub-package'
import type { z } from 'zod'
import type { bookMetadataSchema } from '../../server/src/workspace-model'
export interface EpubChapter {
  path: string
  title: string
  html: string
  text: string
}
export interface EpubArchive {
  hash: string
  title: string
  author: string
  chapters: EpubChapter[]
  images: Map<string, { bytes: Uint8Array; mime: string; width?: number; height?: number }>
  metadata?: z.infer<typeof bookMetadataSchema>
  coverPath?: string
}
const parseXml = (text: string) => {
  if (/<!\s*ENTITY\b/i.test(text)) throw Error('Entidades XML não são permitidas.')
  const doc = new DOMParser().parseFromString(
    text.replace(/<!DOCTYPE[\s\S]*?>/gi, ''),
    'application/xml',
  )
  if (doc.querySelector('parsererror')) throw Error('Documento EPUB inválido.')
  return doc
}
export const epubPath = epubResource
export const safeImage = epubImage
export async function readEpub(file: Pick<Blob, 'size' | 'arrayBuffer'>): Promise<EpubArchive> {
  if (file.size > 10000000) throw Error('O EPUB excede 10 MB.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes[0] !== 80 || bytes[1] !== 75) throw Error('Selecione um arquivo EPUB válido.')
  const pkg = openEpubPackage(bytes),
    files = pkg.files,
    root = pkg.root
  const opf = parseXml(pkg.xml),
    items = new Map(
      Array.from(opf.getElementsByTagNameNS('*', 'item')).map((item) => [
        item.getAttribute('id'),
        item,
      ]),
    ),
    chapters: EpubChapter[] = [],
    images: EpubArchive['images'] = new Map()
  for (const [path, data] of files) {
    if (!/\.(png|jpe?g|webp|gif)$/i.test(path)) continue
    const image = safeImage(data)
    if (image) images.set(path, { bytes: data, ...image })
  }
  const toc = new Map<string, string>()
  const nav = Array.from(items.values()).find((item) =>
    item.getAttribute('properties')?.split(/\s+/).includes('nav'),
  )
  if (nav) {
    const navPath = epubPath(nav.getAttribute('href') ?? '', root)?.path,
      content = navPath ? files.get(navPath) : null
    if (navPath && content) {
      for (const link of Array.from(
        parseXml(strFromU8(content)).getElementsByTagNameNS('*', 'a'),
      )) {
        const path = epubPath(link.getAttribute('href') ?? '', navPath)?.path
        if (path && !toc.has(path)) toc.set(path, (link.textContent ?? '').trim().slice(0, 200))
      }
    }
  }
  for (const ref of Array.from(opf.getElementsByTagNameNS('*', 'itemref'))) {
    if (ref.getAttribute('linear') === 'no') continue
    const item = items.get(ref.getAttribute('idref')),
      path = epubPath(item?.getAttribute('href') ?? '', root)?.path,
      content = path ? files.get(path) : null
    if (!path || !content) continue
    const html = strFromU8(content),
      doc = parseXml(html)
    Array.from(doc.getElementsByTagName('*'))
      .filter((node) =>
        ['script', 'style', 'head', 'iframe', 'object', 'svg', 'math'].includes(node.localName),
      )
      .forEach((node) => node.remove())
    const body = doc.getElementsByTagNameNS('*', 'body')[0] ?? doc.documentElement
    chapters.push({
      path,
      html,
      text: body.textContent ?? '',
      title:
        toc.get(path) ||
        doc.querySelector('h1,h2,h3')?.textContent?.trim().slice(0, 200) ||
        `Capítulo ${chapters.length + 1}`,
    })
  }
  if (!chapters.length || chapters.length > 1000) throw Error('O EPUB não tem capítulos legíveis.')
  const cover = epubCover(pkg)
  const coverPath = cover?.path
  const meta = (name: string) => opf.getElementsByTagNameNS('*', name)[0]?.textContent?.trim()
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
  return {
    hash,
    title: opf.getElementsByTagNameNS('*', 'title')[0]?.textContent ?? '',
    author: opf.getElementsByTagNameNS('*', 'creator')[0]?.textContent ?? '',
    chapters,
    images,
    coverPath,
    metadata: {
      synopsis: meta('description')?.slice(0, 3000),
      publisher: meta('publisher')?.slice(0, 150),
      language: meta('language')?.slice(0, 50),
      year: meta('date')?.slice(0, 20),
      license: meta('rights')?.slice(0, 500),
      isbn: Array.from(opf.getElementsByTagNameNS('*', 'identifier'))
        .map((node) =>
          (node.textContent ?? '')
            .trim()
            .replace(/^urn:isbn:/i, '')
            .replace(/[-\s]/g, ''),
        )
        .find((value) => /^(?:[0-9]{9}[0-9Xx]|[0-9]{13})$/.test(value)),
    },
  }
}
