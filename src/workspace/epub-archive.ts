import { Unzip, UnzipInflate, strFromU8 } from 'fflate'
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
  images: Map<string, { bytes: Uint8Array; mime: string }>
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
export function epubPath(href: string, base: string) {
  try {
    const value = new URL(href, 'https://epub.invalid/' + base)
    if (value.origin !== 'https://epub.invalid' || value.username || value.password) return null
    return {
      path: decodeURIComponent(value.pathname.slice(1)),
      fragment: decodeURIComponent(value.hash.slice(1)),
    }
  } catch {
    return null
  }
}
export function safeImage(
  bytes: Uint8Array,
): { mime: string; width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (
    bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)
  ) {
    const width = view.getUint32(16),
      height = view.getUint32(20)
    return width > 0 && height > 0 && width * height <= 20000000
      ? { mime: 'image/png', width, height }
      : null
  }
  if (bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216) {
    for (let offset = 2; offset + 8 < bytes.length; ) {
      if (bytes[offset] !== 255) return null
      const marker = bytes[offset + 1]
      if (marker === 217 || marker === 218) return null
      if (marker === 216 || marker === 1) {
        offset += 2
        continue
      }
      const length = view.getUint16(offset + 2)
      if (length < 2 || offset + 2 + length > bytes.length) return null
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
        const height = view.getUint16(offset + 5),
          width = view.getUint16(offset + 7)
        return width > 0 && height > 0 && width * height <= 20000000
          ? { mime: 'image/jpeg', width, height }
          : null
      }
      offset += length + 2
    }
  }
  return null
}
export async function readEpub(file: Pick<Blob, 'size' | 'arrayBuffer'>): Promise<EpubArchive> {
  if (file.size > 10000000) throw Error('O EPUB excede 10 MB.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes[0] !== 80 || bytes[1] !== 75) throw Error('Selecione um arquivo EPUB válido.')
  const files = new Map<string, Uint8Array>()
  let count = 0,
    total = 0,
    failure: Error | undefined
  const unzip = new Unzip((entry) => {
    if (++count > 1500) {
      failure = Error('O EPUB tem arquivos demais.')
      return
    }
    if (
      entry.name.startsWith('/') ||
      entry.name.split('/').some((part) => part === '..') ||
      entry.name.includes('\\')
    ) {
      failure = Error('Caminho inválido no EPUB.')
      return
    }
    if (
      !/\.(xml|opf|xhtml|html|htm|ncx|png|jpe?g)$/.test(entry.name.toLowerCase()) &&
      entry.name !== 'mimetype'
    )
      return
    const max = /\.(png|jpe?g)$/i.test(entry.name) ? 2000000 : 3000000
    if ((entry.originalSize ?? 0) > max) {
      failure = Error('Um recurso do EPUB excede o limite.')
      return
    }
    let size = 0
    const chunks: Uint8Array[] = []
    entry.ondata = (error, chunk, final) => {
      if (error) {
        failure = Error('Não foi possível abrir o EPUB.')
        return
      }
      total += chunk.length
      size += chunk.length
      if (total > 20000000 || size > max) {
        failure = Error('O EPUB descompactado excede o limite de leitura.')
        entry.terminate()
        return
      }
      chunks.push(chunk)
      if (final) {
        const joined = new Uint8Array(size)
        let pos = 0
        for (const part of chunks) {
          joined.set(part, pos)
          pos += part.length
        }
        if (files.has(entry.name)) {
          failure = Error('Recurso duplicado no EPUB.')
          return
        }
        files.set(entry.name, joined)
      }
    }
    entry.start()
  })
  unzip.register(UnzipInflate)
  for (let pos = 0; pos < bytes.length; pos += 4096) {
    unzip.push(bytes.subarray(pos, pos + 4096), pos + 4096 >= bytes.length)
    if (failure) throw failure
  }
  if (strFromU8(files.get('mimetype') ?? new Uint8Array()) !== 'application/epub+zip')
    throw Error('Identificação EPUB inválida.')
  if (files.has('META-INF/encryption.xml')) throw Error('Este leitor não abre arquivos com DRM.')
  const container = files.get('META-INF/container.xml')
  if (!container) throw Error('Índice EPUB ausente.')
  const root = parseXml(strFromU8(container))
      .getElementsByTagName('rootfile')[0]
      ?.getAttribute('full-path'),
    packageBytes = root ? files.get(root) : null
  if (!root || !packageBytes) throw Error('Pacote EPUB ausente.')
  const opf = parseXml(strFromU8(packageBytes)),
    items = new Map(
      Array.from(opf.getElementsByTagName('item')).map((item) => [item.getAttribute('id'), item]),
    ),
    chapters: EpubChapter[] = [],
    images: EpubArchive['images'] = new Map()
  for (const [path, data] of files) {
    if (!/\.(png|jpe?g)$/i.test(path)) continue
    const image = safeImage(data)
    if (image) images.set(path, { bytes: data, mime: image.mime })
  }
  const toc = new Map<string, string>()
  const nav = Array.from(items.values()).find((item) =>
    item.getAttribute('properties')?.split(/\s+/).includes('nav'),
  )
  if (nav) {
    const navPath = epubPath(nav.getAttribute('href') ?? '', root)?.path,
      content = navPath ? files.get(navPath) : null
    if (navPath && content) {
      for (const link of Array.from(parseXml(strFromU8(content)).getElementsByTagName('a'))) {
        const path = epubPath(link.getAttribute('href') ?? '', navPath)?.path
        if (path && !toc.has(path)) toc.set(path, (link.textContent ?? '').trim().slice(0, 200))
      }
    }
  }
  for (const ref of Array.from(opf.getElementsByTagName('itemref'))) {
    if (ref.getAttribute('linear') === 'no') continue
    const item = items.get(ref.getAttribute('idref')),
      path = epubPath(item?.getAttribute('href') ?? '', root)?.path,
      content = path ? files.get(path) : null
    if (!path || !content) continue
    const html = strFromU8(content),
      doc = parseXml(html)
    doc
      .querySelectorAll('script,style,head,iframe,object,svg,math')
      .forEach((node) => node.remove())
    const body = doc.getElementsByTagName('body')[0] ?? doc.documentElement
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
  const cover =
    Array.from(items.values()).find((item) =>
      item.getAttribute('properties')?.split(/\s+/).includes('cover-image'),
    ) ??
    items.get(
      Array.from(opf.getElementsByTagName('meta'))
        .find((meta) => meta.getAttribute('name') === 'cover')
        ?.getAttribute('content') ?? null,
    )
  const coverPath = cover ? epubPath(cover.getAttribute('href') ?? '', root)?.path : undefined
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
  }
}
