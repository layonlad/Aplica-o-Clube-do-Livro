import { Unzip, UnzipInflate, strFromU8 } from 'fflate'
import { XMLParser, XMLValidator } from 'fast-xml-parser'

type Xml = Record<string, unknown>
const object = (value: unknown): Xml =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Xml) : {}
const list = (value: unknown): Xml[] =>
  (Array.isArray(value) ? value : value === undefined ? [] : [value]).map(object)
const attribute = (node: Xml, name: string) =>
  typeof node['@_' + name] === 'string' ? (node['@_' + name] as string) : ''
export function epubXml(text: string): Xml {
  if (/<!\s*ENTITY\b/i.test(text)) throw Error('Entidades XML não são permitidas.')
  const source = text.replace(/<!DOCTYPE[^>]*>/gi, '')
  if (XMLValidator.validate(source) !== true) throw Error('Documento EPUB inválido.')
  return object(
    new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      parseTagValue: false,
      parseAttributeValue: false,
      processEntities: true,
    }).parse(source),
  )
}
export function epubResource(href: string, base: string) {
  try {
    if (href.includes('\\')) return null
    const url = new URL(href, 'https://epub.invalid/' + base)
    if (url.origin !== 'https://epub.invalid' || url.username || url.password) return null
    const path = decodeURIComponent(url.pathname.slice(1))
    if (path.includes('\0') || path.includes('\\')) return null
    return { path, fragment: decodeURIComponent(url.hash.slice(1)) }
  } catch {
    return null
  }
}
export interface EpubPackage {
  files: Map<string, Uint8Array>
  names: Set<string>
  root: string
  xml: string
  manifest: { id: string; path: string; type: string; properties: string[] }[]
  package: Xml
}
/** Bounded ZIP extraction shared by the browser and the private-file API. Fonts are not decoded. */
export function openEpubPackage(bytes: Uint8Array, resources = true): EpubPackage {
  if (
    !bytes.length ||
    bytes.length > 10000000 ||
    bytes[0] !== 80 ||
    bytes[1] !== 75 ||
    bytes[2] !== 3 ||
    bytes[3] !== 4
  )
    throw Error('Selecione um arquivo EPUB válido de até 10 MB.')
  const files = new Map<string, Uint8Array>(),
    names = new Set<string>()
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
      entry.name.split('/').includes('..') ||
      entry.name.includes('\\') ||
      entry.name.includes('\0') ||
      names.has(entry.name)
    ) {
      failure = Error('Caminho inválido ou recurso duplicado no EPUB.')
      return
    }
    names.add(entry.name)
    const image = /\.(png|jpe?g|webp|gif)$/i.test(entry.name)
    const max = image ? 5000000 : entry.name === 'META-INF/encryption.xml' ? 65536 : 3000000
    if ((entry.originalSize ?? 0) > max) {
      failure = Error('Um recurso do EPUB excede o limite.')
      return
    }
    const metadata =
      ['mimetype', 'META-INF/container.xml', 'META-INF/encryption.xml'].includes(entry.name) ||
      /\.opf$/i.test(entry.name)
    if (
      !metadata &&
      (!resources || !/\.(xml|xhtml|html|htm|ncx|png|jpe?g|webp|gif|svg)$/i.test(entry.name))
    )
      return
    let size = 0
    const chunks: Uint8Array[] = []
    entry.ondata = (error, chunk, final) => {
      if (error) {
        failure = Error('Não foi possível abrir este EPUB.')
        return
      }
      size += chunk.length
      total += chunk.length
      if (size > max || total > (resources ? 30000000 : 6000000)) {
        failure = Error('O EPUB descompactado excede o limite de leitura.')
        entry.terminate()
        return
      }
      chunks.push(chunk)
      if (final) {
        const joined = new Uint8Array(size)
        let offset = 0
        for (const part of chunks) {
          joined.set(part, offset)
          offset += part.length
        }
        files.set(entry.name, joined)
      }
    }
    entry.start()
  })
  unzip.register(UnzipInflate)
  try {
    for (let offset = 0; offset < bytes.length; offset += 4096) {
      unzip.push(bytes.subarray(offset, offset + 4096), offset + 4096 >= bytes.length)
      if (failure) throw failure
    }
  } catch (error) {
    throw failure ?? (error instanceof Error ? error : Error('Não foi possível abrir este EPUB.'))
  }
  if (strFromU8(files.get('mimetype') ?? new Uint8Array()).trim() !== 'application/epub+zip')
    throw Error('Identificação EPUB inválida.')
  const container = epubXml(strFromU8(files.get('META-INF/container.xml') ?? new Uint8Array()))
  const root = attribute(
    list(object(object(container.container).rootfiles).rootfile)[0] ?? {},
    'full-path',
  )
  if (
    !root ||
    !files.has(root) ||
    root.startsWith('/') ||
    root.split('/').includes('..') ||
    !/\.opf$/i.test(root)
  )
    throw Error('Pacote EPUB ausente.')
  const xml = strFromU8(files.get(root)!),
    pkg = object(epubXml(xml).package)
  const manifest = list(object(pkg.manifest).item).map((item) => ({
    id: attribute(item, 'id'),
    path: epubResource(attribute(item, 'href'), root)?.path ?? '',
    type: attribute(item, 'media-type'),
    properties: attribute(item, 'properties').split(/\s+/),
  }))
  const encryption = files.get('META-INF/encryption.xml')
  if (encryption) {
    const enc = epubXml(strFromU8(encryption))
    if (!('encryption' in enc)) throw Error('Metadados de proteção do EPUB inválidos.')
    const spine = new Set(list(object(pkg.spine).itemref).map((ref) => attribute(ref, 'idref')))
    const fonts = new Set(
      manifest
        .filter(
          (item) =>
            !spine.has(item.id) &&
            /\.(otf|ttf|woff2?)$/i.test(item.path) &&
            /^(font\/(otf|ttf|woff2?)|application\/(vnd\.ms-opentype|x-font-(ttf|opentype)|font-(sfnt|woff)))$/.test(
              item.type,
            ),
        )
        .map((item) => item.path),
    )
    for (const encrypted of list(object(enc.encryption).EncryptedData)) {
      const method = attribute(object(encrypted.EncryptionMethod), 'Algorithm')
      const uri = attribute(object(object(encrypted.CipherData).CipherReference), 'URI')
      const target = epubResource(uri, '')
      if (
        !['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC'].includes(
          method,
        ) ||
        !uri ||
        !target ||
        target.fragment ||
        !fonts.has(target.path) ||
        !names.has(target.path)
      )
        throw Error(
          'Este EPUB contém texto ou imagens criptografados (DRM). Para ler aqui, use uma edição legível fornecida pela loja ou editora.',
        )
    }
  }
  return { files, names, root, xml, manifest, package: pkg }
}
export function epubImage(
  bytes: Uint8Array,
): { mime: string; width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const sized = (mime: string, width: number, height: number) =>
    width > 0 && height > 0 && width * height <= 20000000 ? { mime, width, height } : null
  if (bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n))
    return sized('image/png', view.getUint32(16), view.getUint32(20))
  if (bytes.length >= 10 && strFromU8(bytes.subarray(0, 6)).match(/^GIF8[79]a$/))
    return sized('image/gif', view.getUint16(6, true), view.getUint16(8, true))
  if (
    bytes.length >= 30 &&
    strFromU8(bytes.subarray(0, 4)) === 'RIFF' &&
    strFromU8(bytes.subarray(8, 12)) === 'WEBP'
  ) {
    const type = strFromU8(bytes.subarray(12, 16))
    if (type === 'VP8X')
      return sized(
        'image/webp',
        1 + bytes[24] + bytes[25] * 256 + bytes[26] * 65536,
        1 + bytes[27] + bytes[28] * 256 + bytes[29] * 65536,
      )
    if (type === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a)
      return sized('image/webp', view.getUint16(26, true) & 16383, view.getUint16(28, true) & 16383)
    if (type === 'VP8L' && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true)
      return sized('image/webp', 1 + (bits & 16383), 1 + ((bits >>> 14) & 16383))
    }
  }
  if (bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216) {
    for (let offset = 2; offset + 8 < bytes.length;) {
      if (bytes[offset] !== 255) return null
      const marker = bytes[offset + 1]
      if (marker === 217 || marker === 218) return null
      if (marker === 216 || marker === 1) {
        offset += 2
        continue
      }
      const length = view.getUint16(offset + 2)
      if (length < 2 || offset + 2 + length > bytes.length) return null
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker))
        return sized('image/jpeg', view.getUint16(offset + 7), view.getUint16(offset + 5))
      offset += length + 2
    }
  }
  return null
}
/** Selects the publisher's cover; SVG/XHTML wrappers only supply a local raster reference. */
export function epubCover(
  pkg: EpubPackage,
): { path: string; bytes: Uint8Array; mime: string } | undefined {
  const image = (path: string) => {
    const bytes = pkg.files.get(path),
      info = bytes ? epubImage(bytes) : null
    return bytes && info ? { path, bytes, mime: info.mime } : undefined
  }
  const referenced = (path: string, depth = 0): ReturnType<typeof epubCover> => {
    const direct = image(path)
    if (direct) return direct
    if (depth > 1 || !path.match(/\.(xhtml|html|htm|svg)$/i)) return
    const bytes = pkg.files.get(path)
    if (!bytes) return
    try {
      const doc = epubXml(strFromU8(bytes))
      const visit = (node: unknown): ReturnType<typeof epubCover> => {
        if (Array.isArray(node)) {
          for (const value of node) {
            const found = visit(value)
            if (found) return found
          }
          return
        }
        for (const [tag, value] of Object.entries(object(node))) {
          if (tag === 'img' || tag === 'image')
            for (const el of list(value)) {
              const href = attribute(el, 'src') || attribute(el, 'href'),
                target = epubResource(href, path)
              if (target) {
                const found = referenced(target.path, depth + 1)
                if (found) return found
              }
            }
          if (!tag.startsWith('@_')) {
            const found = visit(value)
            if (found) return found
          }
        }
      }
      return visit(doc)
    } catch {
      return
    }
  }
  const metadata = object(pkg.package.metadata)
  const coverId = list(metadata.meta).find(
    (meta) => attribute(meta, 'name').toLowerCase() === 'cover',
  )
  const candidates = [
    ...pkg.manifest
      .filter((item) => item.properties.includes('cover-image'))
      .map((item) => item.path),
    ...pkg.manifest
      .filter((item) => item.id === attribute(coverId ?? {}, 'content'))
      .map((item) => item.path),
    ...list(object(pkg.package.guide).reference)
      .filter((ref) => attribute(ref, 'type').split(/\s+/).includes('cover'))
      .map((ref) => epubResource(attribute(ref, 'href'), pkg.root)?.path ?? ''),
    ...pkg.manifest
      .filter((item) => /(^|[\/_-])(cover|capa)([._\/-]|$)/i.test(item.id + '/' + item.path))
      .map((item) => item.path),
  ]
  for (const path of new Set(candidates)) {
    const cover = referenced(path)
    if (cover) return cover
  }
}
