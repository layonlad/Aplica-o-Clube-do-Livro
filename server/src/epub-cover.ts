import sharp from 'sharp'
import { openEpubPackage, epubCover } from './epub-package.js'
import { HttpError } from './errors.js'
const cache = new Map<string, { bytes: Buffer; at: number }>()
let processing = false
/** Small volatile cache only. The caller must revalidate ownership before every lookup. */
export async function privateEpubCover(key: string, source: () => Promise<Uint8Array>) {
  const previous = cache.get(key)
  if (previous && Date.now() - previous.at < 600000) {
    cache.delete(key)
    cache.set(key, previous)
    return previous.bytes
  }
  if (processing)
    throw new HttpError(
      429,
      'EPUB_COVER_BUSY',
      'A capa está sendo preparada. Tente novamente em instantes.',
    )
  processing = true
  try {
    const pkg = openEpubPackage(await source()),
      cover = epubCover(pkg)
    if (!cover)
      throw new HttpError(404, 'EPUB_COVER_MISSING', 'Este EPUB não informa uma capa compatível.')
    const bytes = await sharp(cover.bytes, {
      animated: false,
      limitInputPixels: 20000000,
      failOn: 'error',
    })
      .timeout({ seconds: 10 })
      .rotate()
      .resize({
        width: 360,
        height: 540,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .flatten({ background: '#fbf4e8' })
      .jpeg({ quality: 78 })
      .toBuffer()
    if (bytes.length > 300000)
      throw new HttpError(422, 'EPUB_COVER_INVALID', 'A capa deste arquivo não pôde ser preparada.')
    cache.delete(key)
    cache.set(key, { bytes, at: Date.now() })
    while (cache.size > 24) cache.delete(cache.keys().next().value!)
    return bytes
  } finally {
    processing = false
  }
}
