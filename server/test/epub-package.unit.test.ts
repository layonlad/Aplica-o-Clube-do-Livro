import { it, expect } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import sharp from 'sharp'
import { validateEpub } from '../src/private-storage.js'
import { openEpubPackage, epubCover } from '../src/epub-package.js'
import { privateEpubCover } from '../src/epub-cover.js'
const encryption = (algorithm: string, path = 'OPS/font.otf') =>
  `<e:encryption xmlns:e="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:x="http://www.w3.org/2001/04/xmlenc#"><x:EncryptedData><x:EncryptionMethod Algorithm="${algorithm}"/><x:CipherData><x:CipherReference URI="${path}"/></x:CipherData></x:EncryptedData></e:encryption>`
const fixture = (extra: Record<string, Uint8Array> = {}, manifest = '', guide = '') =>
  Buffer.from(
    zipSync({
      mimetype: strToU8('application/epub+zip'),
      'META-INF/container.xml': strToU8(
        '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>',
      ),
      'OPS/book.opf': strToU8(
        `<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:rights>Todos os direitos reservados pela autora sintética.</dc:rights></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="font" href="font.otf" media-type="font/otf"/>${manifest}</manifest><spine><itemref idref="chapter"/></spine>${guide}</package>`,
      ),
      'OPS/chapter.xhtml': strToU8(
        '<html><body><p>Uma história para leitura privada.</p></body></html>',
      ),
      'OPS/font.otf': new Uint8Array([1, 2, 3]),
      ...extra,
    }),
  )
it.each(['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC'])(
  'aceita fontes ofuscadas %s sem tratar direitos autorais como DRM',
  (algorithm) => {
    const bytes = fixture({
      'META-INF/encryption.xml': strToU8(encryption(algorithm)),
    })
    expect(() => validateEpub(bytes)).not.toThrow()
    expect(openEpubPackage(bytes).manifest.some((item) => item.id === 'chapter')).toBe(true)
  },
)
it('aceita encryption.xml vazio e recusa criptografia de capítulos, referências remotas e XML com entidades', () => {
  expect(() =>
    validateEpub(fixture({ 'META-INF/encryption.xml': strToU8('<encryption/>') })),
  ).not.toThrow()
  for (const [algorithm, path] of [
    ['http://www.w3.org/2001/04/xmlenc#aes128-cbc', 'OPS/chapter.xhtml'],
    ['http://www.idpf.org/2008/embedding', 'OPS/chapter.xhtml'],
    ['http://www.idpf.org/2008/embedding', 'https://evil.example/font.otf'],
  ])
    expect(() =>
      validateEpub(
        fixture({
          'META-INF/encryption.xml': strToU8(encryption(algorithm, path)),
        }),
      ),
    ).toThrow('criptografados')
  expect(() =>
    validateEpub(
      fixture({
        'META-INF/encryption.xml': strToU8(
          '<!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><encryption>&a;</encryption>',
        ),
      }),
    ),
  ).toThrow('Entidades')
})
it('extrai capa EPUB 3, respeita o limite de imagem e não segue capa remota', async () => {
  const png = await sharp({
    create: { width: 64, height: 96, channels: 3, background: '#462b70' },
  })
    .png()
    .toBuffer()
  const bytes = fixture(
    { 'OPS/cover.png': png },
    '<item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/>',
  )
  expect(epubCover(openEpubPackage(bytes))).toMatchObject({
    path: 'OPS/cover.png',
    mime: 'image/png',
  })
  expect(() => openEpubPackage(fixture({ 'OPS/oversized.png': new Uint8Array(5000001) }))).toThrow(
    'limite',
  )
  expect(
    epubCover(
      openEpubPackage(
        fixture(
          {},
          '<item id="cover" href="https://evil.example/cover.png" properties="cover-image"/>',
        ),
      ),
    ),
  ).toBeUndefined()
})
it('reconhece guia EPUB 2 com capa SVG que referencia imagem e prepara JPEG privado em cache', async () => {
  const png = await sharp({
    create: { width: 80, height: 120, channels: 3, background: '#31735a' },
  })
    .png()
    .toBuffer()
  const bytes = fixture(
    {
      'OPS/art/capa.png': png,
      'OPS/cover.svg': strToU8(
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="art/capa.png"/></svg>',
      ),
    },
    '<item id="wrapper" href="cover.svg" media-type="image/svg+xml"/>',
    '<guide><reference type="cover" href="cover.svg"/></guide>',
  )
  expect(epubCover(openEpubPackage(bytes))?.path).toBe('OPS/art/capa.png')
  let reads = 0
  const cover = await privateEpubCover('unit-private-epub', async () => {
    reads++
    return bytes
  })
  expect((await sharp(cover).metadata()).format).toBe('jpeg')
  expect(cover.length).toBeLessThan(300000)
  await privateEpubCover('unit-private-epub', async () => {
    reads++
    return bytes
  })
  expect(reads).toBe(1)
})
