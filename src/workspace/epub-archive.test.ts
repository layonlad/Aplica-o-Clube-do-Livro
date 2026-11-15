import { beforeAll, it, expect, vi } from 'vitest'
import { strToU8 } from 'fflate'
import { Blob } from 'node:buffer'
import { webcrypto } from 'node:crypto'
import { syntheticEpub } from './epub-test-fixture'
beforeAll(() => {
  vi.stubGlobal('crypto', webcrypto)
})
import { readEpub, epubPath, safeImage } from './epub-archive'
it('abre capítulos e metadados, usa hash estável e impede caminhos e recursos externos', async () => {
  const blob = new Blob([new Uint8Array(syntheticEpub())])
  const archive = await readEpub(blob)
  expect(archive.title).toBe('Livro de teste')
  expect(archive.author).toBe('Equipe de teste')
  expect(archive.chapters).toHaveLength(2)
  expect(archive.hash).toMatch(/^[a-f0-9]{64}$/)
  expect(archive.chapters[0].text).not.toContain('Não faz parte')
  expect((await readEpub(blob)).hash).toBe(archive.hash)
  expect(epubPath('https://untrusted.example/pixel.png', 'OPS/one.xhtml')).toBeNull()
  expect(epubPath('javascript:alert(1)', 'OPS/one.xhtml')).toBeNull()
  expect(epubPath('two.xhtml#nota', 'OPS/one.xhtml')).toEqual({
    path: 'OPS/two.xhtml',
    fragment: 'nota',
  })
})
it('rejeita XML com entidades, DRM, arquivos falsos e imagens com dimensões excessivas', async () => {
  await expect(readEpub(new Blob(['não é EPUB']))).rejects.toThrow('válido')
  await expect(
    readEpub(
      new Blob([new Uint8Array(syntheticEpub('<!ENTITY secret SYSTEM "file:///etc/passwd">'))]),
    ),
  ).rejects.toThrow('Entidades')
  await expect(
    readEpub(
      new Blob([
        new Uint8Array(
          syntheticEpub(undefined, { 'META-INF/encryption.xml': strToU8('<encryption><EncryptedData><EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/><CipherData><CipherReference URI="OPS/one.xhtml"/></CipherData></EncryptedData></encryption>') }),
        ),
      ]),
    ),
  ).rejects.toThrow('DRM')
  const png = new Uint8Array(24)
  png.set([137, 80, 78, 71, 13, 10, 26, 10])
  const view = new DataView(png.buffer)
  view.setUint32(16, 100000)
  view.setUint32(20, 100000)
  expect(safeImage(png)).toBeNull()
  await expect(
    readEpub(
      new Blob([
        new Uint8Array(syntheticEpub(undefined, { '../escape.xml': strToU8('<escape/>') })),
      ]),
    ),
  ).rejects.toThrow('Caminho')
})
it('abre EPUB com direitos autorais e fonte ofuscada, mantendo o texto legível',async()=>{
 const bytes=syntheticEpub('<p>Texto privado da leitora.</p>',{
  'OPS/book.opf':strToU8('<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:rights>Todos os direitos reservados.</dc:rights></metadata><manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="font" href="font.otf" media-type="font/otf"/></manifest><spine><itemref idref="one"/></spine></package>'),
  'OPS/font.otf':new Uint8Array([1,2,3]),
  'META-INF/encryption.xml':strToU8('<encryption><EncryptedData><EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/><CipherData><CipherReference URI="OPS/font.otf"/></CipherData></EncryptedData></encryption>')
 })
 const value=await readEpub(new Blob([new Uint8Array(bytes)]))
 expect(value.chapters[0].text).toContain('Texto privado da leitora.')
 expect(value.metadata?.license).toBe('Todos os direitos reservados.')
})
it('recupera capa em página SVG indicada pelo guia da edição EPUB 2',async()=>{
 const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10]);const view=new DataView(png.buffer);view.setUint32(16,90);view.setUint32(20,140)
 const bytes=syntheticEpub(undefined,{
  'OPS/book.opf':strToU8('<package><manifest><item id="one" href="one.xhtml"/><item id="coverpage" href="cover.svg"/></manifest><spine><itemref idref="one"/></spine><guide><reference type="cover" href="cover.svg"/></guide></package>'),
  'OPS/cover.svg':strToU8('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="images/capa.png"/></svg>'),
  'OPS/images/capa.png':png
 })
 const value=await readEpub(new Blob([new Uint8Array(bytes)]))
 expect(value.coverPath).toBe('OPS/images/capa.png')
 expect(value.images.get(value.coverPath!)).toMatchObject({mime:'image/png',width:90,height:140})
})
